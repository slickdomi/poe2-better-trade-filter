import type { FiltersData, StatSectionType } from "../state/types";
import type { DerivedState, DerivedStatFilter } from "../state/derive";

/**
 * Turns the pipeline's chosen modifiers into a Path of Exile 2 in-game
 * search string (the stash/vendor search box), in the same shape poe2.re
 * generates. That box:
 *  - ANDs space-separated terms, quoting only groups one containing spaces;
 *    `|` inside a term is OR, and a leading `!` is NOT ("!a|b" = neither);
 *  - tests each term, case-insensitively, as a regex against each line of
 *    the item's text on its own — so `^`/`$` anchor to one modifier line;
 *  - shows a rolled value followed by its roll range ("+45(38-45) to
 *    Spirit"), except for values rolled from a fixed tier ("+2 to Level of
 *    all Minion Skills");
 *  - accepts at most 250 characters.
 *
 * Everything below is about fitting as much as possible into that limit:
 * each modifier is matched by the shortest one or two slices of its text —
 * `^`/`$` anchored where that helps, "^mi.*fe$" — that no other modifier
 * able to roll on this selection matches, and a requested min/max becomes a
 * number pattern joined to them with `.*`, narrowed using the modifier's
 * known tier rolls. Trade stat texts match the in-game wording apart from
 * the trade-only " (Local)" suffix (stripped) and the "+" sign they omit
 * (never part of a slice).
 */
export const INGAME_SEARCH_MAX_LENGTH = 250;

/** Groups can't be added on the Regex generator tab, but a loaded selection may still carry some — these have no in-game search equivalent. */
const UNSUPPORTED_SECTION_LABEL: Partial<Record<StatSectionType, string>> = {
  if: "If",
  weight: "Weighted sum",
  weight2: "Weighted sum V2",
};

/** Shorter slices are unique among mods often enough, but start matching unrelated item text (flavour text, granted skills, ...). */
const MIN_SLICE_LENGTH = 3;
/** A `^`/`$` anchor already pins the slice to one end of a modifier line, so it can afford to be shorter. */
const MIN_ANCHORED_SLICE_LENGTH = 2;
/** Longest slice tried as one half of a two-part match — past this, a single longer slice is about as short anyway. */
const MAX_PART_LENGTH = 8;

/** How a waystone prints one of its properties, for matching a requested min/max against it. */
interface WaystoneProperty {
  /** The whole line, `#` standing in for the value. */
  line: string;
  /** Text right before the value — enough of the line to tell it apart. */
  label: string;
  /** Pattern for what right after the value ends it. */
  end: string;
  /** Printed with its sign ("+18%"), so a negative value reads "-". */
  signed: boolean;
}

/**
 * Keyed by the trade site's Endgame filter id. Wording as a waystone shows
 * it: "Waystone (Tier 15)", "Revives Available: 2", "Item Rarity: +12%",
 * "Pack Size: +18%", "Monster Effectiveness: +13%", "Waystone Drop Chance:
 * +70%". Trade's other Endgame filters (Monster Rarity, Gold, Experience)
 * are left out until their in-game wording is confirmed.
 */
const WAYSTONE_PROPERTIES: Record<string, WaystoneProperty> = {
  map_tier: { line: "waystone (tier #)", label: "tier ", end: "\\)", signed: false },
  map_revives: { line: "revives available: #", label: "available: ", end: "$", signed: false },
  map_iir: { line: "item rarity: +#%", label: "rarity: ", end: "%", signed: true },
  map_packsize: { line: "pack size: +#%", label: "pack size: ", end: "%", signed: true },
  map_magic_monsters: { line: "monster effectiveness: +#%", label: "effectiveness: ", end: "%", signed: true },
  map_bonus: { line: "waystone drop chance: +#%", label: "drop chance: ", end: "%", signed: true },
};

/** The Endgame (`mapFilters`) filter ids an in-game search can match. */
export const REGEX_MAP_FILTER_IDS = Object.keys(WAYSTONE_PROPERTIES);

/**
 * Property lines gear shows alongside its mods ("Energy Shield: 120"). A
 * slice that also fits one of these would match every item merely *having*
 * the property, so they count as other text when picking a unique slice.
 */
const ITEM_PROPERTY_LINES = [
  ...Object.values(WAYSTONE_PROPERTIES).map((p) => p.line),
  ...[
    "quality",
    "physical damage",
    "elemental damage",
    "fire damage",
    "cold damage",
    "lightning damage",
    "chaos damage",
    "critical hit chance",
    "attacks per second",
    "reload time",
    "armour",
    "evasion rating",
    "energy shield",
    "block chance",
    "spirit",
    "charm slots",
    "requires: level",
    "item level",
    "sockets",
  ].map((label) => `${label}: #`),
  "corrupted",
  "mirrored",
  "unidentified",
];

// Numeric ranges ------------------------------------------------------------

/**
 * How "any digit" is written. `.` is a character shorter, and safe wherever
 * the pattern is pinned right in front of a roll range's "(" — only a
 * value's own digits can sit there.
 */
type AnyDigit = "\\d" | ".";

function digitCount(n: number): number {
  return String(n).length;
}

function digitRun(count: number, anyDigit: AnyDigit): string {
  if (anyDigit === ".") return count <= 3 ? ".".repeat(count) : `.{${count}}`;
  if (count === 1) return "\\d";
  if (count === 2) return "\\d\\d";
  return `\\d{${count}}`;
}

/**
 * Splits [min, max] into sub-ranges that are each a plain Cartesian product
 * of per-digit ranges (e.g. 45–345 → 45–49, 50–99, 100–299, 300–339,
 * 340–345), so each one is expressible digit by digit.
 */
function splitToRanges(min: number, max: number): Array<[number, number]> {
  const stops = new Set([max]);
  const minDigits = digitCount(min);
  for (let nines = 1; ; nines++) {
    const digits = String(min);
    const stop = Number(digits.slice(0, Math.max(0, digits.length - nines)) + "9".repeat(nines));
    if (stop > max) break;
    // With trailing zeros in `min` this stop would only cut one product range
    // in two (40–99 → 40–49, 50–99) — skip it, unless it's the last number
    // with min's digit count (a range can't span two digit counts).
    if (nines < minDigits && min % 10 ** nines === 0) continue;
    stops.add(stop);
  }
  for (let zeros = 1; ; zeros++) {
    const stop = max + 1 - ((max + 1) % 10 ** zeros) - 1;
    if (stop < min) break;
    stops.add(stop);
  }

  const ranges: Array<[number, number]> = [];
  let start = min;
  for (const stop of [...stops].sort((a, b) => a - b)) {
    ranges.push([start, stop]);
    start = stop + 1;
  }
  return ranges;
}

function rangeToPattern(start: number, stop: number, anyDigit: AnyDigit): string {
  const a = String(start);
  const b = String(stop);
  let pattern = "";
  let anyDigits = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "0" && b[i] === "9") {
      anyDigits++;
      continue;
    }
    if (anyDigits > 0) {
      pattern += digitRun(anyDigits, anyDigit);
      anyDigits = 0;
    }
    if (a[i] === b[i]) pattern += a[i];
    else pattern += Number(b[i]) - Number(a[i]) === 1 ? `[${a[i]}${b[i]}]` : `[${a[i]}-${b[i]}]`;
  }
  if (anyDigits > 0) pattern += digitRun(anyDigits, anyDigit);
  return pattern;
}

/**
 * A pattern matching a whole number in [min, max] (bounds rounded inward to
 * integers). Without a max, everything longer than min's digit count is
 * accepted outright — a substring match only needs *some* run of digits to
 * fit, and a number with more digits is necessarily larger (that catch-all
 * always starts with a real `\d`, so "+45" can't pass for three digits).
 * Returns `null` when nothing is constrained (no max, min ≤ 0) or the range
 * is empty.
 */
export function numberRangePattern(
  min: number | undefined,
  max: number | undefined,
  anyDigit: AnyDigit = "\\d",
): string | null {
  const lo = Math.max(0, Math.ceil(min ?? 0));
  let alternatives: string[];
  if (max === undefined) {
    if (lo === 0) return null;
    const digits = digitCount(lo);
    alternatives = [
      ...splitToRanges(lo, 10 ** digits - 1).map(([a, b]) => rangeToPattern(a, b, anyDigit)),
      anyDigit === "." ? `\\d${digitRun(digits, ".")}` : digitRun(digits + 1, "\\d"),
    ];
  } else {
    const hi = Math.floor(max);
    if (hi < lo) return null;
    alternatives = splitToRanges(lo, hi).map(([a, b]) => rangeToPattern(a, b, anyDigit));
  }
  return alternatives.length === 1 ? alternatives[0] : `(${alternatives.join("|")})`;
}

// Values -----------------------------------------------------------------------

/**
 * How a modifier's value reads in game: "range" when every tier rolls
 * between two numbers (so a range is always printed after it), "fixed" when
 * every tier is a single number (so none ever is), "unknown" when tiers mix
 * both or there's no tier data.
 */
type ValueStyle = "range" | "fixed" | "unknown";

interface Rolls {
  lowest: number;
  highest: number;
  style: ValueStyle;
}

function rollsOf(stat: DerivedStatFilter): Rolls | undefined {
  const tiers = (stat.tierGroups ?? []).flatMap((g) => g.tiers);
  if (tiers.length === 0 || tiers.some((t) => t.min < 0 || !Number.isInteger(t.min) || !Number.isInteger(t.max))) {
    return undefined;
  }
  const style: ValueStyle = tiers.every((t) => t.min === t.max)
    ? "fixed"
    : tiers.every((t) => t.min < t.max)
      ? "range"
      : "unknown";
  return { lowest: Math.min(...tiers.map((t) => t.min)), highest: Math.max(...tiers.map((t) => t.max)), style };
}

/**
 * The number pattern for a stat's requested min/max, or `undefined` if
 * there's nothing to match. Knowing the stat's possible rolls pays off
 * twice: a bound every roll already satisfies is dropped outright, and the
 * bound left open can be any number past every roll — so the roundest ones
 * are tried and the shortest pattern kept (ties going to the widest range,
 * in case a Unique rolls outside the known tiers).
 */
function valuePattern(stat: DerivedStatFilter, rolls: Rolls | undefined, anyDigit: AnyDigit, ctx: RegexContext): string | undefined {
  const { min, max } = stat;
  if (min === undefined && max === undefined) return undefined;
  if ((stat.text.match(/#/g) ?? []).length !== 1) {
    ctx.warnings.push(`"${stat.text}" has more than one value, so its min/max can't be matched — matching the modifier alone.`);
    return undefined;
  }
  if (min !== undefined && max !== undefined && min > max) {
    ctx.warnings.push(`"${stat.text}" has a min above its max — matching the modifier alone.`);
    return undefined;
  }

  const lo = Math.max(0, Math.ceil(min ?? 0));
  const hi = max === undefined ? undefined : Math.floor(max);
  const lowestRoll = rolls?.lowest ?? 0;
  const needsMin = lo > lowestRoll;
  const needsMax = hi !== undefined && (rolls === undefined || hi < rolls.highest);
  if (!needsMin && !needsMax) return undefined;

  const lows = needsMin ? [lo] : [lowestRoll, 10 ** (digitCount(lowestRoll) - 1), 0].filter((l) => l <= lowestRoll);
  const highs = needsMax ? [hi] : rolls ? [10 ** digitCount(rolls.highest) - 1, undefined] : [undefined];
  let best: string | null = null;
  for (const l of lows) {
    for (const h of highs) {
      const pattern = numberRangePattern(l, h, anyDigit);
      if (pattern !== null && (best === null || pattern.length <= best.length)) best = pattern;
    }
  }
  if (best === null) return undefined;
  // With a max, `\b` stops the pattern matching the tail of a longer number
  // ("5" in "15"); a min alone doesn't need it, since any tail of a number is
  // smaller than the number itself.
  return needsMax ? `\\b${best}` : best;
}

/**
 * What follows a value in item text, so neither bound of a printed roll
 * range (followed by "-" or ")") can match in the value's place: "(" when a
 * range is always printed, a word boundary when one never is, and either
 * one — "(" or the template's own next character — when it can't be told.
 */
function valueRegex(numberPattern: string, style: ValueStyle, nextChar: string | undefined): string {
  if (style === "range") return `${numberPattern}\\(`;
  if (style === "fixed") return `${numberPattern}\\b`;
  if (nextChar === undefined) return `${numberPattern}(\\(|$)`;
  if (nextChar === "(") return `${numberPattern}\\(`;
  return `${numberPattern}[(${nextChar.replace(/[\\\]^-]/g, "\\$&")}]`;
}

// Text slices ----------------------------------------------------------------

function normalizeStatText(text: string): string {
  return text.replace(/\s*\(local\)/gi, "").toLowerCase();
}

function escapeLiteral(text: string): string {
  return text.replace(/[\\^$.|?*+()[\]{}]/g, "\\$&");
}

/** A slice of one line of stat text, `^`/`$` anchored to that line's edges when set. */
interface Slice {
  text: string;
  /** Index into the line, to order a match's parts and tell which side of the value each is on. */
  start: number;
  anchorStart: boolean;
  anchorEnd: boolean;
}

function renderSlice(slice: Slice): string {
  return `${slice.anchorStart ? "^" : ""}${escapeLiteral(slice.text)}${slice.anchorEnd ? "$" : ""}`;
}

/** Whether `slice` also matches `line` — another modifier's text, or other item text. */
function sliceMatches(slice: Slice, line: string): boolean {
  if (slice.anchorStart && slice.anchorEnd) return line === slice.text;
  if (slice.anchorStart) return line.startsWith(slice.text);
  if (slice.anchorEnd) return line.endsWith(slice.text);
  return line.includes(slice.text);
}

/**
 * [start, end) of each run of text between a line's `#` values. A slice
 * never spans a value: in game it's followed by its roll range
 * ("45(38-45)"), which no template text accounts for.
 */
function literalSegments(line: string): Array<[number, number]> {
  const segments: Array<[number, number]> = [];
  let start = 0;
  for (let i = 0; i <= line.length; i++) {
    if (i === line.length || line[i] === "#") {
      if (i > start) segments.push([start, i]);
      start = i + 1;
    }
  }
  return segments;
}

/** The plain and `^`/`$` anchored variants of one slice of `line` long enough to use. */
function sliceVariants(line: string, text: string, start: number): Slice[] {
  const variants: Slice[] = [];
  if (text.length >= MIN_SLICE_LENGTH) variants.push({ text, start, anchorStart: false, anchorEnd: false });
  if (text.length >= MIN_ANCHORED_SLICE_LENGTH) {
    const atLineStart = start === 0;
    const atLineEnd = start + text.length === line.length;
    if (atLineStart) variants.push({ text, start, anchorStart: true, anchorEnd: false });
    if (atLineEnd) variants.push({ text, start, anchorStart: false, anchorEnd: true });
    if (atLineStart && atLineEnd) variants.push({ text, start, anchorStart: true, anchorEnd: true });
  }
  return variants;
}

/**
 * Every slice of `line` in its own segment's `others` list, shortest first,
 * that could be half of a two-part match: at most MAX_PART_LENGTH long, and
 * still matching some other line on its own (one matching none is a whole
 * match by itself, which beats any pair containing it). Each carries the set
 * of `others` it matches, as a bitset, so a pair is unique exactly when its
 * two sets don't intersect. `othersFor` must index every segment's list the
 * same way (one entry per other line).
 */
function partCandidates(
  line: string,
  othersFor: (segmentStart: number) => string[],
): Array<{ slice: Slice; length: number; matches: Uint32Array }> {
  const candidates: Array<{ slice: Slice; length: number; matches: Uint32Array }> = [];
  for (const [segmentStart, segmentEnd] of literalSegments(line)) {
    const others = othersFor(segmentStart);
    const words = Math.ceil(others.length / 32);
    for (let start = segmentStart; start < segmentEnd; start++) {
      if (line[start] === " ") continue;
      let containing = others.map((_, i) => i);
      for (let end = start + 1; end <= Math.min(segmentEnd, start + MAX_PART_LENGTH); end++) {
        const text = line.slice(start, end);
        containing = containing.filter((i) => others[i].includes(text));
        if (containing.length === 0) break;
        if (line[end - 1] === " ") continue;
        for (const slice of sliceVariants(line, text, start)) {
          const matching = containing.filter((i) => sliceMatches(slice, others[i]));
          if (matching.length === 0) continue;
          const matches = new Uint32Array(words);
          for (const i of matching) matches[i >>> 5] |= 1 << (i & 31);
          candidates.push({ slice, length: renderSlice(slice).length, matches });
        }
      }
    }
  }
  return candidates.sort((a, b) => a.length - b.length);
}

function intersects(a: Uint32Array, b: Uint32Array): boolean {
  for (let i = 0; i < a.length; i++) if ((a[i] & b[i]) !== 0) return true;
  return false;
}

/**
 * The shortest match for `line` — one slice, or two joined by `.*` — whose
 * finished term (`render`) matches none of the lines `othersFor` gives for
 * each part's segment. Two parts earn their extra `.*` when the text setting
 * a modifier apart is split around its value, or just spread out: "Minions
 * have #% increased maximum Life" is "^mi.*fe$", where no single slice short
 * of the whole tail sets it apart from "#% increased maximum Life".
 */
function findUniqueMatch(
  line: string,
  othersFor: (segmentStart: number) => string[],
  render: (parts: Slice[]) => string,
): Slice[] | null {
  let best: Slice[] | null = null;
  let bestLength = Infinity;

  // One slice. An anchored slice only ever matches lines a plain one does
  // too, and a longer slice only fewer, so each start narrows its candidate
  // list as it grows instead of rescanning everything.
  for (const [segmentStart, segmentEnd] of literalSegments(line)) {
    const others = othersFor(segmentStart);
    for (let start = segmentStart; start < segmentEnd; start++) {
      if (line[start] === " ") continue;
      let containing = others;
      for (let end = start + 1; end <= segmentEnd; end++) {
        const text = line.slice(start, end);
        if (text.length >= bestLength) break; // a term is never shorter than its slice
        containing = containing.filter((other) => other.includes(text));
        if (line[end - 1] === " ") continue;
        for (const slice of sliceVariants(line, text, start)) {
          const length = render([slice]).length;
          if (length < bestLength && !containing.some((other) => sliceMatches(slice, other))) {
            best = [slice];
            bestLength = length;
          }
        }
      }
    }
  }

  // Two slices, shortest first, so both loops can stop as soon as the parts
  // alone (plus the ".*" between them) are no shorter than the best so far.
  const candidates = partCandidates(line, othersFor);
  for (let i = 0; i < candidates.length; i++) {
    const a = candidates[i];
    if (a.length * 2 + 2 >= bestLength) break;
    for (let j = i + 1; j < candidates.length; j++) {
      const b = candidates[j];
      if (a.length + b.length + 2 >= bestLength) break;
      const [first, second] = a.slice.start < b.slice.start ? [a.slice, b.slice] : [b.slice, a.slice];
      if (first.start + first.text.length > second.start || intersects(a.matches, b.matches)) continue;
      const length = render([first, second]).length;
      if (length < bestLength) {
        best = [first, second];
        bestLength = length;
      }
    }
  }
  return best;
}

interface PoolEntry {
  text: string;
  normalized: string;
}

interface RegexContext {
  /** Every modifier that can roll on the current selection. */
  pool: PoolEntry[];
  /** Non-modifier lines on the item a slice mustn't match either. */
  extraLines: string[];
  warnings: string[];
}

/**
 * No match for `line` is unique because another modifier's text contains
 * all of it (e.g. "# to maximum Life" inside "#% to maximum Life") — use its
 * longest run of text, anchored wherever it reaches the line's edge, and
 * say what else it matches.
 */
function fallbackSlice(line: string, stat: DerivedStatFilter, normalized: string, ctx: RegexContext): Slice {
  const [segmentStart, segmentEnd] = literalSegments(line).reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a), [0, 0]);
  const raw = line.slice(segmentStart, segmentEnd);
  const text = raw.trim();
  const start = segmentStart + raw.length - raw.trimStart().length;
  const slice: Slice = { text, start, anchorStart: start === 0, anchorEnd: start + text.length === line.length };

  const clashes = [
    ...new Set(
      ctx.pool
        .filter((p) => p.normalized !== normalized && p.normalized.split("\n").some((l) => sliceMatches(slice, l)))
        .map((p) => p.text),
    ),
  ];
  if (clashes.length > 0) {
    const more = clashes.length > 1 ? ` and ${clashes.length - 1} more` : "";
    ctx.warnings.push(`"${stat.text}" can't be told apart from "${clashes[0]}"${more} — the regex matches both.`);
  }
  return slice;
}

// Terms --------------------------------------------------------------------------

/** One modifier's match: its rendered slices on each side of its value pattern (all in `before` when there's no value). */
interface Fragment {
  before: string[];
  value?: string;
  after: string[];
}

function renderFragment(fragment: Fragment): string {
  return [...fragment.before, ...(fragment.value === undefined ? [] : [fragment.value]), ...fragment.after].join(".*");
}

/** Terms only need quotes to keep a space from splitting them in two. */
function quoteTerm(term: string): string {
  return term.includes(" ") ? `"${term}"` : term;
}

/** Which side of its value all of a fragment's slices are on, when they're all on one — the only kind that can share a value pattern with others. */
function sharedValueSide(fragment: Fragment): "before" | "after" | undefined {
  if (fragment.value === undefined) return undefined;
  if (fragment.before.length === 0) return "after";
  if (fragment.after.length === 0) return "before";
  return undefined;
}

/** An OR of fragments, writing a value pattern shared by several of them only once: "[3-9].\(.*(fir|col)". */
function renderAnyOf(fragments: Fragment[]): string {
  const groups: Fragment[][] = [];
  for (const fragment of fragments) {
    const side = sharedValueSide(fragment);
    const group = side && groups.find((g) => sharedValueSide(g[0]) === side && g[0].value === fragment.value);
    if (group) group.push(fragment);
    else groups.push([fragment]);
  }
  const parts = groups.map((group) => {
    if (group.length === 1) return renderFragment(group[0]);
    const side = sharedValueSide(group[0])!;
    const alternatives = [...new Set(group.map((f) => f[side].join(".*")))];
    const merged = alternatives.length === 1 ? alternatives[0] : `(${alternatives.join("|")})`;
    return renderFragment({ before: side === "before" ? [merged] : [], value: group[0].value, after: side === "after" ? [merged] : [] });
  });
  return [...new Set(parts)].join("|");
}

function buildFragment(stat: DerivedStatFilter, ctx: RegexContext): Fragment {
  const normalized = normalizeStatText(stat.text);
  const others = [
    ...ctx.pool.filter((p) => p.normalized !== normalized).flatMap((p) => p.normalized.split("\n")),
    ...ctx.extraLines,
  ];
  const lines = normalized.split("\n");
  const rolls = rollsOf(stat);
  const style = rolls?.style ?? "unknown";
  const numberPattern = valuePattern(stat, rolls, style === "range" ? "." : "\\d", ctx);

  if (numberPattern === undefined) {
    const toFragment = (parts: Slice[]): Fragment => ({ before: parts.map(renderSlice), after: [] });
    const render = (parts: Slice[]) => quoteTerm(renderFragment(toFragment(parts)));
    let best: Slice[] | null = null;
    for (const line of lines) {
      const match = findUniqueMatch(line, () => others, render);
      if (match && (best === null || render(match).length < render(best).length)) best = match;
    }
    const longestLine = lines.reduce((a, b) => (b.length > a.length ? b : a));
    return toFragment(best ?? [fallbackSlice(longestLine, stat, normalized, ctx)]);
  }

  const line = lines.find((l) => l.includes("#"))!;
  const hash = line.indexOf("#");
  const value = valueRegex(numberPattern, style, line[hash + 1]);
  const toFragment = (parts: Slice[]): Fragment => ({
    before: parts.filter((p) => p.start < hash).map(renderSlice),
    value,
    after: parts.filter((p) => p.start > hash).map(renderSlice),
  });
  // The term needs a value on the same side of a slice as ours, so a slice
  // after the value only has to be unique among text after another line's
  // values, and one before it among text before them — and a line with no
  // value at all can never match.
  const valued = others.filter((other) => other.includes("#"));
  const textBefore = valued.map((other) => other.slice(0, other.lastIndexOf("#")));
  const textAfter = valued.map((other) => other.slice(other.indexOf("#") + 1));
  const match =
    findUniqueMatch(
      line,
      (segmentStart) => (segmentStart > hash ? textAfter : textBefore),
      (parts) => quoteTerm(renderFragment(toFragment(parts))),
    ) ?? [fallbackSlice(line, stat, normalized, ctx)];
  return toFragment(match);
}

function buildContext(derived: DerivedState, data: FiltersData): RegexContext {
  const statsById = new Map(data.stats.map((s) => [s.id, s]));
  const categories = derived.availableCategories.length > 0 ? derived.availableCategories : data.categories;
  const texts = new Set<string>(derived.chosenStats.map((s) => s.text));
  for (const category of categories) {
    // Unique-only mods too, regardless of the toggle — a Unique can still be sitting in the stash being searched.
    for (const id of [...(data.eligibility[category.id] ?? []), ...(data.uniqueEligibility[category.id] ?? [])]) {
      const text = statsById.get(id)?.text;
      if (text) texts.add(text);
    }
  }
  const itemNames = new Set(categories.flatMap((c) => data.itemNamesByCategory[c.id] ?? []).map((n) => n.toLowerCase()));
  return {
    pool: [...texts].map((text) => ({ text, normalized: normalizeStatText(text) })),
    extraLines: [...ITEM_PROPERTY_LINES, ...itemNames],
    warnings: [],
  };
}

/**
 * A waystone property's requested min/max as one term, "pack size: \+(1[89]|[2-9]\d|\d{3})%":
 * the label pins where the value starts and `end` where it stops, so unlike
 * a modifier's value it needs no `\b` or roll range handling.
 */
function propertyTerm(misc: DerivedState["chosenMisc"][number], ctx: RegexContext): string | undefined {
  const property = WAYSTONE_PROPERTIES[misc.filterId];
  if (!property) {
    ctx.warnings.push(`"${misc.def.text}" has no in-game search equivalent and is left out.`);
    return undefined;
  }
  if ("option" in misc.value) return undefined;
  const { min, max } = misc.value;
  if (min !== undefined && max !== undefined && min > max) {
    ctx.warnings.push(`"${misc.def.text}" has a min above its max and is left out.`);
    return undefined;
  }
  const number = numberRangePattern(min, max);
  if (number === null) return undefined;

  const label = escapeLiteral(property.label);
  const value = `${number}${property.end}`;
  if (!property.signed) return `${label}${value}`;
  // Without a min above zero, a negative value is in range too.
  return (min ?? 0) > 0 ? `${label}\\+${value}` : `${label}(-|\\+${value})`;
}

export interface RegexResult {
  regex: string;
  /** Parts of the selection the regex couldn't express exactly, in plain words for the user. */
  warnings: string[];
}

export function buildRegex(derived: DerivedState, data: FiltersData): RegexResult {
  const ctx = buildContext(derived, data);
  const terms: string[] = [];
  if (derived.chosenItemName) terms.push(escapeLiteral(derived.chosenItemName.toLowerCase()));

  // The Regex tab only offers Endgame (waystone) properties; every other
  // item property is trade-only.
  for (const misc of derived.chosenMisc) {
    if (misc.group !== "mapFilters") continue;
    const term = propertyTerm(misc, ctx);
    if (term) terms.push(term);
  }

  for (const section of derived.statSections) {
    const stats = section.stats.filter((stat) => !stat.disabled);
    if (stats.length === 0) continue;
    const unsupportedLabel = UNSUPPORTED_SECTION_LABEL[section.type];
    if (unsupportedLabel) {
      ctx.warnings.push(`${unsupportedLabel} groups have no regex equivalent and are left out.`);
      continue;
    }
    const fragments = stats.map((stat) => buildFragment(stat, ctx));
    if (section.type === "not") {
      terms.push(`!${renderAnyOf(fragments)}`);
    } else if (section.type === "count") {
      const min = section.min ?? 0;
      if (fragments.length > 1 && min >= fragments.length) {
        terms.push(...fragments.map(renderFragment));
      } else {
        terms.push(renderAnyOf(fragments));
        if (min > 1 || (section.max !== undefined && section.max < fragments.length)) {
          ctx.warnings.push("A regex can only require one or all of a Count group's modifiers — this one matches any of them.");
        }
      }
    } else {
      terms.push(...fragments.map(renderFragment));
    }
  }

  return { regex: [...new Set(terms)].map(quoteTerm).join(" "), warnings: [...new Set(ctx.warnings)] };
}
