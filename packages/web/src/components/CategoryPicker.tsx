import type { FiltersData } from "../state/types";

/**
 * Section groupings, in display order — based on the official trade site's
 * own category tree (weapon.* nesting under "Any Weapon" > "Any
 * One-Handed/Two-Handed/Ranged/Caster Weapon", etc., captured from a live
 * pull of trade-filters.json), not poe2db's navigation menu, since that's
 * the authoritative structure for this data. Any category id not listed
 * here still renders, under a fallback "Other" group — this list just
 * needs to stay roughly in sync with categoryItemClasses.ts, not be a hard
 * source of truth.
 */
const CATEGORY_GROUPS: { label: string; ids: string[] }[] = [
  { label: "Weapons", ids: ["weapon"] },
  { label: "One-Handed Weapons", ids: ["weapon.onemelee", "weapon.oneaxe", "weapon.onemace", "weapon.spear"] },
  {
    label: "Two-Handed Weapons",
    ids: ["weapon.twomelee", "weapon.twoaxe", "weapon.twomace", "weapon.warstaff", "weapon.talisman"],
  },
  { label: "Ranged Weapons", ids: ["weapon.ranged", "weapon.bow", "weapon.crossbow"] },
  { label: "Caster Weapons", ids: ["weapon.caster", "weapon.wand", "weapon.sceptre", "weapon.staff"] },
  { label: "Armour", ids: ["armour", "armour.helmet", "armour.chest", "armour.gloves", "armour.boots"] },
  { label: "Off-hand", ids: ["armour.quiver", "armour.shield", "armour.focus", "armour.buckler"] },
  { label: "Jewellery", ids: ["accessory", "accessory.amulet", "accessory.ring"] },
  { label: "Belt", ids: ["accessory.belt"] },
  { label: "Jewels", ids: ["jewel"] },
  { label: "Flasks", ids: ["flask", "flask.life", "flask.mana", "flask.charm"] },
  { label: "Waystones", ids: ["map.waystone"] },
];

interface Props {
  categories: FiltersData["categories"];
  onSelect: (categoryId: string) => void;
}

export function CategoryPicker({ categories, onSelect }: Props) {
  const byId = new Map(categories.map((c) => [c.id, c]));

  const sections = CATEGORY_GROUPS.map((g) => ({
    label: g.label,
    items: g.ids.map((id) => byId.get(id)).filter((c): c is { id: string; text: string } => c !== undefined),
  })).filter((g) => g.items.length > 0);

  const groupedIds = new Set(CATEGORY_GROUPS.flatMap((g) => g.ids));
  const leftover = categories.filter((c) => !groupedIds.has(c.id));
  if (leftover.length > 0) sections.push({ label: "Other", items: leftover });

  return (
    <section>
      <h2>Item category</h2>
      {sections.map((s) => (
        <div key={s.label} className="category-section">
          <div className="category-section-label">{s.label}</div>
          <div className="category-grid">
            {s.items.map((c) => (
              <button key={c.id} type="button" onClick={() => onSelect(c.id)}>
                {c.text}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
