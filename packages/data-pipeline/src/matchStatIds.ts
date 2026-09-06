import type { TradeStatGroup } from "./types.js";

type RawStatEntry = TradeStatGroup["entries"][number];

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

export function resolveTradeStatId(
  index: TradeStatIndex,
  bucketOrder: string[],
  normalizedRepoeText: string,
): RawStatEntry | undefined {
  for (const bucket of bucketOrder) {
    const found = index.get(bucket)?.get(normalizedRepoeText);
    if (found) return found;
  }
  return undefined;
}
