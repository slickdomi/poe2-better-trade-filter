import type { RepoeBaseItemsFile, RepoeMod, RepoeModsByBaseFile, RepoeModsFile } from "./types.js";

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

/**
 * mods_by_base.json (the precomputed table above relies on) only covers
 * mods that spawn through the game's normal weighted-affix system — it has
 * zero entries for domain "desecrated" (Desecration/Boneshard boss mods),
 * confirmed against a live pull. Those mods still carry their own
 * `spawn_weights`, though, and PoE's own eligibility rule is simple: a mod
 * can appear on a base if any tag the base has appears in the mod's
 * `spawn_weights` with a positive weight (every base already lists
 * "default" among its own tags, so a mod whose only positive-weight entry
 * is "default" is picked up here too — no special-casing needed).
 *
 * This does NOT recover mods gated behind a purely virtual tag that no
 * base item ever actually carries (e.g. "genesis_tree_minion" — verified
 * against a live pull that zero base items have any `genesis_tree_*` tag).
 * See `poe2db/loadPoe2dbEligibility.ts` for how that's handled instead —
 * this file's own `spawn_weights`-tag approach to it was tried first and
 * found unreliable for that specific mod family (RePoE's tag value itself
 * doesn't match which item type the mod is actually obtainable on).
 */
export function residualEligibleModIds(
  itemClasses: string[],
  baseItems: RepoeBaseItemsFile,
  residualMods: [string, RepoeMod][],
): Set<string> {
  const result = new Set<string>();
  for (const base of Object.values(baseItems)) {
    if (!itemClasses.includes(base.item_class)) continue;
    const baseTagSet = new Set(base.tags);
    for (const [modId, mod] of residualMods) {
      if (mod.spawn_weights.some((sw) => sw.weight > 0 && baseTagSet.has(sw.tag))) {
        result.add(modId);
      }
    }
  }
  return result;
}

/** Mods reachable via `tagKeyToModIds` at all (any base, any tag combo) — used to find what's left over for `residualEligibleModIds` to pick up. */
export function collectCoveredModIds(tagKeyToModIds: Map<string, string[]>): Set<string> {
  const covered = new Set<string>();
  for (const modIds of tagKeyToModIds.values()) {
    for (const id of modIds) covered.add(id);
  }
  return covered;
}

export function buildResidualMods(mods: RepoeModsFile, covered: Set<string>): [string, RepoeMod][] {
  return Object.entries(mods).filter(
    ([id, m]) =>
      !covered.has(id) &&
      m.generation_type !== "unique" &&
      m.text &&
      m.stats.length === 1 &&
      m.spawn_weights.length > 0,
  );
}
