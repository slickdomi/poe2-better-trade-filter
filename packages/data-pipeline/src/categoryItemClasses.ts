/**
 * Maps the official trade site's `type_filters.category` option ids
 * (pathofexile.com/api/trade2/data/filters) to RePoE `item_class` names
 * (repoe-fork.github.io/poe2/item_classes.json). There is no shared source
 * for this join — both sides were inspected by hand against a live data
 * pull and the mapping recorded here.
 *
 * v1 intentionally only covers equipment slots that roll normal
 * prefix/suffix modifiers (weapons, armour, accessories, jewels, flasks,
 * waystones). Categories left out (gems, cards, currency, relics, map
 * fragments, etc.) simply won't appear in the generated category picker
 * until someone extends this map.
 *
 * Claw, Dagger, One/Two Hand Sword, and Flail are omitted even though
 * RePoE marks their bases `release_state: "released"` and some base names
 * do appear in a live trade-items.json pull — per direct confirmation
 * these weapon types aren't actually obtainable in the current PoE2
 * Early Access build yet. Re-add them once they ship.
 *
 * FishingRod is omitted too — it's a real, tradeable item, just an easter
 * egg rather than something anyone filters trade for.
 */
export const CATEGORY_ITEM_CLASSES: Record<string, string[]> = {
  "weapon.oneaxe": ["One Hand Axe"],
  "weapon.onemace": ["One Hand Mace"],
  "weapon.spear": ["Spear"],
  "weapon.onemelee": ["One Hand Axe", "One Hand Mace", "Spear"],
  "weapon.twoaxe": ["Two Hand Axe"],
  "weapon.twomace": ["Two Hand Mace"],
  "weapon.warstaff": ["Warstaff"],
  "weapon.twomelee": ["Two Hand Axe", "Two Hand Mace", "Warstaff"],
  "weapon.talisman": ["Talisman"],
  "weapon.bow": ["Bow"],
  "weapon.crossbow": ["Crossbow"],
  "weapon.ranged": ["Bow", "Crossbow"],
  "weapon.wand": ["Wand"],
  "weapon.sceptre": ["Sceptre"],
  "weapon.staff": ["Staff"],
  "weapon.caster": ["Wand", "Sceptre", "Staff"],
  "weapon": [
    "One Hand Axe", "One Hand Mace", "Spear",
    "Two Hand Axe", "Two Hand Mace", "Warstaff", "Talisman",
    "Bow", "Crossbow", "Wand", "Sceptre", "Staff",
  ],
  "armour.helmet": ["Helmet"],
  "armour.chest": ["Body Armour"],
  "armour.gloves": ["Gloves"],
  "armour.boots": ["Boots"],
  "armour.quiver": ["Quiver"],
  "armour.shield": ["Shield"],
  "armour.focus": ["Focus"],
  "armour.buckler": ["Buckler"],
  "armour": ["Helmet", "Body Armour", "Gloves", "Boots", "Quiver", "Shield", "Focus", "Buckler"],
  "accessory.amulet": ["Amulet"],
  "accessory.belt": ["Belt"],
  "accessory.ring": ["Ring"],
  "accessory": ["Amulet", "Belt", "Ring"],
  "jewel": ["Jewel", "AbyssJewel"],
  "flask.life": ["LifeFlask"],
  "flask.mana": ["ManaFlask"],
  "flask.charm": ["UtilityFlask"],
  "flask": ["LifeFlask", "ManaFlask", "UtilityFlask"],
  "map.waystone": ["Map"],
};
