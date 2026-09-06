import type { RepoeBaseItemsFile } from "./types.js";

function basesForCategory(itemClasses: string[], baseItems: RepoeBaseItemsFile) {
  return Object.values(baseItems).filter((b) => itemClasses.includes(b.item_class));
}

/**
 * `lvl` is always kept: a rare item's level requirement is driven by its
 * affixes' own required_level (any category's mods can push it up), not by
 * the base template. `str`/`dex`/`int`, by contrast, are fixed to whatever
 * the base template itself specifies — verified against RePoE: the only
 * non-unique mods that touch attribute requirements
 * (`ReducedLocalAttributeRequirements*`) only ever *reduce* an existing
 * requirement, they never create one from zero, and they only target
 * weapon/armour tags. So if every base in a category has 0 for an
 * attribute, that attribute's requirement filter can never be satisfied.
 */
export function reqFilterIdsForCategory(itemClasses: string[], baseItems: RepoeBaseItemsFile): string[] {
  const ids = ["lvl"];
  const bases = basesForCategory(itemClasses, baseItems);
  if (bases.some((b) => (b.requirements?.strength ?? 0) > 0)) ids.push("str");
  if (bases.some((b) => (b.requirements?.dexterity ?? 0) > 0)) ids.push("dex");
  if (bases.some((b) => (b.requirements?.intelligence ?? 0) > 0)) ids.push("int");
  return ids;
}

const PROPERTY_TO_EQUIPMENT_FILTER_IDS: [string, string[]][] = [
  ["armour", ["ar"]],
  ["evasion", ["ev"]],
  ["energy_shield", ["es"]],
  ["ward", ["ward"]],
  ["block", ["block"]],
  // Only bases with an actual attack (a swing/shot time) can roll damage
  // stats at all — e.g. Sceptre bases have no attack_time in PoE2 (they're
  // pure caster/minion-support weapons), so damage filters don't apply.
  ["attack_time", ["damage", "aps", "crit", "dps", "pdps", "edps"]],
];

function categoryGroup(categoryId: string): "weapon" | "armour" | "other" {
  if (categoryId === "weapon" || categoryId.startsWith("weapon.")) return "weapon";
  if (categoryId === "armour" || categoryId.startsWith("armour.")) return "armour";
  return "other";
}

/**
 * `ar`/`ev`/`es`/`ward`/`block` measure "base value + local modifiers +
 * quality" (per the trade API's own filter description) — mods can scale
 * an existing defense, but can't conjure one a base doesn't have, so base
 * `properties` presence is a reliable signal. `spirit` and rune sockets
 * aren't base `properties` fields at all; `spirit` is instead detected
 * from whether this category has any eligible stat whose text mentions it,
 * and rune sockets are left as a broad weapon/armour-group guess since no
 * per-base socket data is available.
 */
export function equipmentFilterIdsForCategory(
  itemClasses: string[],
  baseItems: RepoeBaseItemsFile,
  categoryId: string,
  hasSpiritStat: boolean,
): string[] {
  const ids = new Set<string>();
  const bases = basesForCategory(itemClasses, baseItems);
  for (const [property, filterIds] of PROPERTY_TO_EQUIPMENT_FILTER_IDS) {
    if (bases.some((b) => b.properties?.[property] !== null && b.properties?.[property] !== undefined)) {
      for (const id of filterIds) ids.add(id);
    }
  }
  if (categoryId === "weapon.crossbow" || categoryId === "weapon") ids.add("reload_time");
  if (categoryGroup(categoryId) !== "other") ids.add("rune_sockets");
  if (hasSpiritStat) ids.add("spirit");
  return [...ids];
}

// Only relevant to gems, stackable currency, and Sanctum items — none of
// which are in CATEGORY_ITEM_CLASSES (see categoryItemClasses.ts), so these
// can never apply to anything this tool offers.
export const MISC_FILTER_IDS_NEVER_APPLICABLE = [
  "gem_level",
  "gem_sockets",
  "stack_size",
  "sanctum_gold",
  "unidentified_tier",
];

// A map's monster level — meaningless for equipment.
export function miscFilterIdsForCategory(allMiscIds: string[], categoryId: string): string[] {
  if (categoryId === "map.waystone") return allMiscIds;
  return allMiscIds.filter((id) => id !== "area_level");
}
