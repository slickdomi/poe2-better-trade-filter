import type { RepoeBaseItemsFile } from "./types.js";

/** Base-type names per trade category (e.g. "weapon.sceptre" -> ["Rattling Sceptre", ...]). */
export function buildItemNamesByCategory(
  categoryItemClasses: Record<string, string[]>,
  baseItems: RepoeBaseItemsFile,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [categoryId, itemClasses] of Object.entries(categoryItemClasses)) {
    const names = new Set<string>();
    for (const base of Object.values(baseItems)) {
      if (itemClasses.includes(base.item_class)) names.add(base.name);
    }
    result[categoryId] = [...names].sort();
  }
  return result;
}
