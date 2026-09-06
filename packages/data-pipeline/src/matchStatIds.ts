import type { TradeStatGroup } from "./types.js";

type RawStatEntry = TradeStatGroup["entries"][number];

/**
 * RePoE mod text uses "(min-max)" ranges and "[InternalName|Display]" refs,
 * e.g. "+(9-12) to [Strength|Strength]". Trade's own stat text already uses
 * a bare "#" placeholder, e.g. "# to Strength". Normalizing both to the same
 * shape lets us join RePoE mods to trade stat ids without needing to
 * reimplement GGG's stat_translations grammar.
 */
export function normalizeRepoeText(text: string): string {
  return text
    .replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2")
    .replace(/\[([^\]]+)\]/g, "$1")
    .replace(/\(-?[\d.]+(?:-(?:-?[\d.]+))?\)/g, "#")
    .replace(/^\+/, "")
    .replace(/\s+/g, " ")
    .trim();
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
