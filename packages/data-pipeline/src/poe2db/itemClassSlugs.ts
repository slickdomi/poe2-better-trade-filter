/**
 * RePoE `item_class` -> poe2db.tw URL slug (poe2db.tw/us/{slug}). Verified
 * against a live pull that every slug below resolves (HTTP 200) — poe2db's
 * pattern is simply the pluralized, underscored item class name, with a
 * handful of naming exceptions (Focus -> Foci, Warstaff -> Quarterstaves,
 * UtilityFlask -> Charms) called out explicitly.
 *
 * Deliberately covers only the item classes this project already tracks in
 * categoryItemClasses.ts (equipment that rolls ordinary affixes) — not
 * gems, currency, maps, etc.
 */
export const ITEM_CLASS_TO_POE2DB_SLUG: Record<string, string> = {
  "One Hand Axe": "One_Hand_Axes",
  "One Hand Mace": "One_Hand_Maces",
  Spear: "Spears",
  "Two Hand Axe": "Two_Hand_Axes",
  "Two Hand Mace": "Two_Hand_Maces",
  Warstaff: "Quarterstaves",
  Talisman: "Talismans",
  Bow: "Bows",
  Crossbow: "Crossbows",
  Wand: "Wands",
  Sceptre: "Sceptres",
  Staff: "Staves",
  FishingRod: "Fishing_Rods",
  Helmet: "Helmets",
  "Body Armour": "Body_Armours",
  Gloves: "Gloves",
  Boots: "Boots",
  Quiver: "Quivers",
  Shield: "Shields",
  Focus: "Foci",
  Buckler: "Bucklers",
  Amulet: "Amulets",
  Belt: "Belts",
  Ring: "Rings",
  Jewel: "Jewels",
  LifeFlask: "Life_Flasks",
  ManaFlask: "Mana_Flasks",
  UtilityFlask: "Charms",
  Map: "Waystones",
};
