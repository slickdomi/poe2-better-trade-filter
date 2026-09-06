import type { RepoeBaseItemsFile } from "./types.js";

/**
 * Base-type names per trade category (e.g. "weapon.sceptre" -> ["Rattling
 * Sceptre", ...]), restricted to `validNames` — RePoE's own `release_state`
 * field isn't reliable for this (e.g. "Anima Quarterstaff" is marked
 * "released" in repoe-base-items.json but has never actually been
 * obtainable in PoE2's Early Access build, confirmed by its total absence
 * from a live trade-items.json pull, which only lists base types the trade
 * site itself considers real and searchable). `validNames` should be every
 * `type` trade-items.json actually lists — see parse.ts's caller.
 */
export function buildItemNamesByCategory(
  categoryItemClasses: Record<string, string[]>,
  baseItems: RepoeBaseItemsFile,
  validNames: Set<string>,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [categoryId, itemClasses] of Object.entries(categoryItemClasses)) {
    const names = new Set<string>();
    for (const base of Object.values(baseItems)) {
      if (itemClasses.includes(base.item_class) && validNames.has(base.name)) names.add(base.name);
    }
    result[categoryId] = [...names].sort();
  }
  return result;
}
