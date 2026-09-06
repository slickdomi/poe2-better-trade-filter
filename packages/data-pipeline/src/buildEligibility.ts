import type { RepoeBaseItemsFile, RepoeModsByBaseFile } from "./types.js";

/**
 * mods_by_base.json nests entries under a cosmetic top-level category label
 * (e.g. "Sceptres"), but the tag-combo key underneath (e.g.
 * "sceptre,onehand,default") is what actually matches a base item's own
 * `tags` array (joined in the same order). Flattening drops the redundant
 * outer label and lets us look up eligible mods purely by tag-combo.
 */
export function flattenModsByBase(modsByBase: RepoeModsByBaseFile): Map<string, string[]> {
  const tagKeyToModIds = new Map<string, string[]>();
  for (const category of Object.values(modsByBase)) {
    for (const [tagKey, entry] of Object.entries(category)) {
      const modIds: string[] = [];
      for (const groupDict of Object.values(entry.mods ?? {})) {
        for (const modIdMap of Object.values(groupDict)) {
          modIds.push(...Object.keys(modIdMap));
        }
      }
      const existing = tagKeyToModIds.get(tagKey);
      if (existing) existing.push(...modIds);
      else tagKeyToModIds.set(tagKey, modIds);
    }
  }
  return tagKeyToModIds;
}

export function eligibleModIdsForItemClasses(
  itemClasses: string[],
  baseItems: RepoeBaseItemsFile,
  tagKeyToModIds: Map<string, string[]>,
): Set<string> {
  const result = new Set<string>();
  for (const base of Object.values(baseItems)) {
    if (!itemClasses.includes(base.item_class)) continue;
    for (const implicitId of base.implicits ?? []) result.add(implicitId);
    const tagKey = base.tags.join(",");
    const modIds = tagKeyToModIds.get(tagKey);
    if (modIds) for (const id of modIds) result.add(id);
  }
  return result;
}
