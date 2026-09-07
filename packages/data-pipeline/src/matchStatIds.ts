import type { TradeStatGroup } from "./types.js";

type RawStatEntry = TradeStatGroup["entries"][number];

const LOCAL_SUFFIX = " (Local)";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * RePoE mod text uses "(min-max)" ranges and "[InternalName|Display]" refs,
 * e.g. "+(9-12) to [Strength|Strength]". Trade's own stat text already uses
 * a bare "#" placeholder, e.g. "# to Strength". Normalizing both to the same
 * shape lets us join RePoE mods to trade stat ids without needing to
 * reimplement GGG's stat_translations grammar.
 *
 * When a mod's roll is fixed (min === max, e.g. a mod that's always exactly
 * "+1"), RePoE omits the parens entirely — the text is just "+1 to Level of
 * all Minion Skills" — so the `(min-max)` regex above never fires and that
 * "1" stays a literal digit forever, unable to match trade's "#". Some mod
 * text also contains genuinely fixed constants that must stay literal to
 * match trade's own text (e.g. "per 10 Intelligence"), so this can't
 * blanket-replace every digit — it only substitutes the specific roll
 * value itself, and only once (per stat instance), leaving everything else
 * alone.
 */
export function normalizeRepoeText(text: string, rollMin?: number, rollMax?: number): string {
  let normalized = text
    .replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2")
    .replace(/\[([^\]]+)\]/g, "$1")
    .replace(/\(-?[\d.]+(?:-(?:-?[\d.]+))?\)/g, "#");

  if (rollMin !== undefined && rollMin === rollMax) {
    const pattern = new RegExp(`(?<![\\d.])${escapeRegExp(String(rollMin))}(?![\\d.])`);
    normalized = normalized.replace(pattern, "#");
  }

  return normalized.replace(/^\+/, "").replace(/\s+/g, " ").trim();
}

export function normalizeTradeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Trade lists a handful of stats twice under word-for-word identical text:
 * once for the item's own local property ("+# to maximum Energy Shield" on
 * a body armour, which raises that armour's own Energy Shield value) and
 * once for the global character stat (the very same wording on an amulet,
 * which raises your Energy Shield pool). It tells them apart by suffixing
 * the local entry "(Local)" — explicit.stat_4052037485 ("# to maximum
 * Energy Shield (Local)") vs explicit.stat_3489782002 ("# to maximum Energy
 * Shield") — and indexes each item under whichever one it actually has.
 *
 * RePoE draws the same distinction on the *stat id* instead
 * (`local_energy_shield` vs `base_maximum_energy_shield`) and leaves the
 * display text byte-identical, so joining on text alone silently collapses
 * both onto trade's global id. That produced a body-armour filter no body
 * armour can ever match (its Energy Shield is indexed under the (Local) id),
 * while offering no way to pick the local one at all.
 *
 * Only the pairs that actually collide carry the suffix — there is no
 * "#% increased Energy Shield (Local)", because no global stat shares that
 * wording — hence callers still fall back to the unsuffixed text.
 */
export function isLocalRepoeStatId(statId: string): boolean {
  return statId.startsWith("local_");
}

export type TradeStatIndex = Map<string, Map<string, RawStatEntry>>;

export function buildTradeStatIndex(groups: TradeStatGroup[]): TradeStatIndex {
  const index: TradeStatIndex = new Map();
  for (const group of groups) {
    const byText = new Map<string, RawStatEntry>();
    for (const entry of group.entries) {
      const key = normalizeTradeText(entry.text);
      if (!byText.has(key)) byText.set(key, entry); // first-wins on duplicate wording
    }
    index.set(group.id, byText);
  }
  return index;
}

/**
 * Global stat id -> its "(Local)" twin, for every id trade splits that way
 * (see isLocalRepoeStatId), paired within each bucket so an explicit id
 * never maps to an implicit one. Lets the data sources that only have
 * display text to go on (poe2db's scrapes) be corrected after the fact,
 * using the RePoE-derived pool — which does know local from global — as the
 * evidence for which twin a given category's items are really indexed under.
 */
export function buildLocalVariantIndex(index: TradeStatIndex): Map<string, string> {
  const localByGlobalId = new Map<string, string>();
  for (const byText of index.values()) {
    for (const [text, localEntry] of byText) {
      if (!text.endsWith(LOCAL_SUFFIX)) continue;
      const globalEntry = byText.get(text.slice(0, -LOCAL_SUFFIX.length));
      if (globalEntry) localByGlobalId.set(globalEntry.id, localEntry.id);
    }
  }
  return localByGlobalId;
}

/**
 * `preferLocal` (a RePoE `local_*` stat) tries the "(Local)" wording first
 * within each bucket, so bucket priority — implicit-before-explicit for an
 * implicit mod — still wins over the local/global preference.
 */
export function resolveTradeStatId(
  index: TradeStatIndex,
  bucketOrder: string[],
  normalizedRepoeText: string,
  preferLocal = false,
): RawStatEntry | undefined {
  for (const bucket of bucketOrder) {
    const byText = index.get(bucket);
    if (!byText) continue;
    const found =
      (preferLocal ? byText.get(`${normalizedRepoeText}${LOCAL_SUFFIX}`) : undefined) ?? byText.get(normalizedRepoeText);
    if (found) return found;
  }
  return undefined;
}
