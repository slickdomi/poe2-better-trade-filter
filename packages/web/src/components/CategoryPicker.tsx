import { useEffect, useRef, useState } from "react";
import type { FiltersData } from "../state/types";
import { SlotIcon, type SlotIconName } from "./SlotIcon";

interface Category {
  id: string;
  text: string;
}

interface MenuGroup {
  /** Omitted for a single ungrouped run of entries (e.g. the off-hand slot). */
  label?: string;
  ids: string[];
}

interface Slot {
  key: string;
  label: string;
  icon: SlotIconName;
  /**
   * Where the slot sits on the doll, as percentages of the container —
   * traced off the in-game inventory screen so the layout reads as the
   * same picture. The container carries the screenshot's aspect ratio, so
   * these stay correct at any width.
   */
  box: { left: number; top: number; width: number; height: number };
  /**
   * Categories this slot offers. A slot that resolves to exactly one
   * available category picks it on click; anything more opens a menu.
   */
  menu: MenuGroup[];
  /** Too small to fit a readable caption — icon only, name via tooltip/aria-label. */
  compact?: boolean;
  /** Wider than it is tall (belt, charms) — caption sits beside the icon instead of under it. */
  wide?: boolean;
}

/**
 * The equipment slots, laid out as on the game's inventory screen. Category
 * ids come from the official trade site's own tree (see filters.json), so a
 * few land in visually surprising places — Talisman is grouped with
 * two-handed weapons there, and Focus/Buckler are `armour.*` despite being
 * off-hands. Ids that aren't listed on any slot fall through to the button
 * rows underneath (BOTTOM_GROUPS, plus an "Other" catch-all), which is where
 * everything that isn't worn on the body belongs.
 */
const SLOTS: Slot[] = [
  {
    key: "weapon",
    label: "Weapon",
    icon: "weapon",
    box: { left: 10.8, top: 3.8, width: 17.7, height: 46.6 },
    menu: [
      { label: "One-Handed", ids: ["weapon.oneaxe", "weapon.onemace", "weapon.spear", "weapon.onemelee"] },
      {
        label: "Two-Handed",
        ids: ["weapon.twoaxe", "weapon.twomace", "weapon.warstaff", "weapon.talisman", "weapon.twomelee"],
      },
      { label: "Ranged", ids: ["weapon.bow", "weapon.crossbow", "weapon.ranged"] },
      { label: "Caster", ids: ["weapon.wand", "weapon.sceptre", "weapon.staff", "weapon.caster"] },
      { ids: ["weapon"] },
    ],
  },
  {
    key: "offhand",
    label: "Off-hand",
    icon: "offhand",
    box: { left: 74.0, top: 3.8, width: 17.7, height: 46.6 },
    menu: [{ ids: ["armour.shield", "armour.buckler", "armour.focus", "armour.quiver"] }],
  },
  {
    key: "helmet",
    label: "Helmet",
    icon: "helmet",
    box: { left: 41.9, top: 3.8, width: 15.0, height: 19.9 },
    menu: [{ ids: ["armour.helmet"] }],
  },
  {
    key: "chest",
    label: "Body Armour",
    icon: "chest",
    box: { left: 41.9, top: 25.2, width: 15.0, height: 25.2 },
    menu: [{ ids: ["armour.chest"] }],
  },
  {
    key: "amulet",
    label: "Amulet",
    icon: "amulet",
    box: { left: 60.9, top: 25.7, width: 8.8, height: 11.8 },
    menu: [{ ids: ["accessory.amulet"] }],
    compact: true,
  },
  {
    key: "ring-left",
    label: "Ring",
    icon: "ring",
    box: { left: 30.2, top: 39.0, width: 9.1, height: 11.5 },
    menu: [{ ids: ["accessory.ring"] }],
    compact: true,
  },
  {
    key: "ring-right",
    label: "Ring",
    icon: "ring",
    box: { left: 60.9, top: 38.2, width: 8.8, height: 11.9 },
    menu: [{ ids: ["accessory.ring"] }],
    compact: true,
  },
  {
    key: "gloves",
    label: "Gloves",
    icon: "gloves",
    box: { left: 23.3, top: 52.0, width: 15.9, height: 19.1 },
    menu: [{ ids: ["armour.gloves"] }],
  },
  {
    key: "belt",
    label: "Belt",
    icon: "belt",
    box: { left: 41.9, top: 61.9, width: 15.0, height: 9.2 },
    menu: [{ ids: ["accessory.belt"] }],
    wide: true,
  },
  {
    key: "boots",
    label: "Boots",
    icon: "boots",
    box: { left: 61.5, top: 52.0, width: 15.9, height: 19.1 },
    menu: [{ ids: ["armour.boots"] }],
  },
  {
    key: "flask-life",
    label: "Life Flask",
    icon: "flask",
    box: { left: 26.2, top: 76.5, width: 8.5, height: 18.3 },
    menu: [{ ids: ["flask.life"] }],
    compact: true,
  },
  {
    key: "charm",
    label: "Charm",
    icon: "charm",
    box: { left: 37.6, top: 80.7, width: 27.9, height: 11.0 },
    menu: [{ ids: ["flask.charm"] }],
    wide: true,
  },
  {
    key: "flask-mana",
    label: "Mana Flask",
    icon: "flask",
    box: { left: 68.1, top: 76.5, width: 8.4, height: 18.3 },
    menu: [{ ids: ["flask.mana"] }],
    compact: true,
  },
];

/**
 * Categories with no equipment slot of their own, as plain button rows
 * below the doll. "Any Weapon" is the one deliberate duplicate — it also
 * sits at the bottom of the weapon slot's menu, but it belongs next to the
 * other catch-alls too, where you'd look for it without opening a slot.
 */
const BOTTOM_GROUPS: { label: string; ids: string[] }[] = [
  { label: "Other items", ids: ["jewel", "map.waystone", "map.tablet"] },
  { label: "Any category", ids: ["weapon", "armour", "accessory", "flask"] },
];

interface Props {
  categories: FiltersData["categories"];
  onSelect: (categoryId: string) => void;
}

export function CategoryPicker({ categories, onSelect }: Props) {
  const [openSlotKey, setOpenSlotKey] = useState<string | null>(null);
  const dollRef = useRef<HTMLDivElement>(null);
  const byId = new Map(categories.map((c) => [c.id, c]));

  // `categories` is the *still-available* set, which narrows as other
  // filters are picked — so a slot's menu is whatever of its ids survives,
  // and a slot with nothing left renders disabled rather than vanishing
  // (the doll should keep its shape).
  const slots = SLOTS.map((slot) => {
    const groups = slot.menu
      .map((g) => ({
        label: g.label,
        items: g.ids.map((id) => byId.get(id)).filter((c): c is Category => c !== undefined),
      }))
      .filter((g) => g.items.length > 0);
    return { slot, groups, count: groups.reduce((n, g) => n + g.items.length, 0) };
  });

  const openSlot = slots.find((s) => s.slot.key === openSlotKey);

  useEffect(() => {
    if (!openSlotKey) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenSlotKey(null);
    }
    function handleClickOutside(e: MouseEvent) {
      if (dollRef.current && !dollRef.current.contains(e.target as Node)) setOpenSlotKey(null);
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openSlotKey]);

  function handleSlotClick(entry: (typeof slots)[number]) {
    const only = entry.count === 1 ? entry.groups[0].items[0] : undefined;
    if (only) {
      setOpenSlotKey(null);
      onSelect(only.id);
    } else {
      setOpenSlotKey((current) => (current === entry.slot.key ? null : entry.slot.key));
    }
  }

  function handleMenuSelect(categoryId: string) {
    setOpenSlotKey(null);
    onSelect(categoryId);
  }

  const slottedIds = new Set(SLOTS.flatMap((s) => s.menu.flatMap((g) => g.ids)));
  const bottomSections = BOTTOM_GROUPS.map((g) => ({
    label: g.label,
    items: g.ids.map((id) => byId.get(id)).filter((c): c is Category => c !== undefined),
  })).filter((g) => g.items.length > 0);

  const groupedIds = new Set([...slottedIds, ...BOTTOM_GROUPS.flatMap((g) => g.ids)]);
  const leftover = categories.filter((c) => !groupedIds.has(c.id));
  if (leftover.length > 0) bottomSections.push({ label: "Other", items: leftover });

  return (
    <section className="category-picker">
      <h2>Item category</h2>

      <div className="equipment-doll" ref={dollRef}>
        {slots.map((entry) => {
          const { slot } = entry;
          const isOpen = openSlotKey === slot.key;
          const only = entry.count === 1 ? entry.groups[0].items[0] : undefined;
          // A slot standing in for exactly one category names that category
          // ("Body Armour"); one covering several keeps the slot's own name
          // and opens a menu.
          const caption = only ? only.text : slot.label;
          return (
            <button
              key={slot.key}
              type="button"
              className={[
                "doll-slot",
                slot.compact ? "doll-slot-compact" : "",
                slot.wide ? "doll-slot-wide" : "",
                isOpen ? "is-open" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{
                left: `${slot.box.left}%`,
                top: `${slot.box.top}%`,
                width: `${slot.box.width}%`,
                height: `${slot.box.height}%`,
              }}
              disabled={entry.count === 0}
              title={entry.count === 0 ? `${caption} — not available with the current filters` : caption}
              aria-label={caption}
              aria-haspopup={only ? undefined : "menu"}
              aria-expanded={only ? undefined : isOpen}
              onClick={() => handleSlotClick(entry)}
            >
              <SlotIcon name={slot.icon} />
              <span className="doll-slot-label">{caption}</span>
            </button>
          );
        })}

        {openSlot && (
          <div
            className={`doll-menu${openSlot.count > 8 ? " doll-menu-wide" : ""}`}
            role="menu"
            aria-label={openSlot.slot.label}
          >
            <div className="doll-menu-title">{openSlot.slot.label}</div>
            <div className="doll-menu-body">
              {openSlot.groups.map((g, i) => (
                <div key={g.label ?? `_${i}`} className="doll-menu-group">
                  {g.label && <div className="doll-menu-group-label">{g.label}</div>}
                  {g.items.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="menuitem"
                      className="doll-menu-item"
                      onClick={() => handleMenuSelect(c.id)}
                    >
                      {c.text}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {bottomSections.map((s) => (
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
