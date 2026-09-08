/**
 * Silhouettes for the equipment-doll category picker — one per gear slot on
 * the in-game inventory screen. Deliberately hand-drawn line art rather
 * than the game's own slot art, which isn't ours to redistribute; they only
 * need to be recognisable at ~40px, which is roughly how big the small
 * slots (ring, amulet, charm) get at the panel's normal width.
 *
 * All of them are stroke-only on a 24×24 grid and inherit `currentColor`,
 * so the slot button's own hover/disabled colors carry straight through.
 */

export type SlotIconName =
  | "weapon"
  | "offhand"
  | "helmet"
  | "chest"
  | "gloves"
  | "boots"
  | "belt"
  | "amulet"
  | "ring"
  | "flask"
  | "charm";

const PATHS: Record<SlotIconName, string[]> = {
  weapon: ["M12 2.2 14.4 6.6v6.9H9.6V6.6z", "M7.6 13.9h8.8", "M12 15.2v4.4", "M9.8 21.4h4.4"],
  offhand: ["M12 2.4 19.6 5.1v6.2c0 4.6-3.2 8.3-7.6 10.3-4.4-2-7.6-5.7-7.6-10.3V5.1z", "M12 6.4v11.2"],
  helmet: [
    "M5 13.2a7 7 0 0 1 14 0v4.4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z",
    "M12 12.4v7.2",
    "M7.2 12.6h3.2",
    "M13.6 12.6h3.2",
  ],
  chest: ["M8.6 2.8 12 5 15.4 2.8l4.1 2.5-1.7 3.5-1.4-.9v13.3H7.6V7.9l-1.4.9-1.7-3.5z", "M12 5v16.2"],
  gloves: [
    "M6.6 21.4v-8.6a1.8 1.8 0 0 1 1.8-1.8h7.2a1.8 1.8 0 0 1 1.8 1.8v8.6z",
    "M8.4 11V7.5a1.3 1.3 0 0 1 2.6 0V11",
    "M11 11V6.5a1.3 1.3 0 0 1 2.6 0V11",
    "M13.6 11V7.5a1.3 1.3 0 0 1 2.6 0V11",
    "M6.6 17.4h11.6",
  ],
  boots: [
    "M7.2 2.6h4.4v9.8c0 1.9 1 3.3 2.9 4.2l2.7 1.3c1.3.6 1.8 1.5 1.8 2.9v.6H7.2z",
    "M7.2 18.2h10.1",
  ],
  belt: ["M2.4 9.4h19.2v5.2H2.4z", "M8.8 7.2h6.4v9.6H8.8z", "M15.2 12h3.2"],
  amulet: ["M6 3.2c0 6.2 2.7 9.2 6 9.2s6-3 6-9.2", "m12 12.4 3.5 4.3-3.5 4.5-3.5-4.5z"],
  ring: ["M12 20.6a5.4 5.4 0 1 0 0-10.8 5.4 5.4 0 0 0 0 10.8z", "m12 3.2 3.1 3.3-3.1 3.3-3.1-3.3z"],
  flask: [
    "M9.4 2.8h5.2v4.4l3.6 8.2c.9 2-.5 4.4-2.7 4.4H8.5c-2.2 0-3.6-2.4-2.7-4.4l3.6-8.2z",
    "M7.3 13.6h9.4",
    "M9.4 5.2h5.2",
  ],
  charm: ["M12 2.4 19 9l-7 12.6L5 9z", "M12 2.4 9.4 9l2.6 12.6L14.6 9z", "M5 9h14"],
};

interface Props {
  name: SlotIconName;
}

export function SlotIcon({ name }: Props) {
  return (
    <svg
      className="slot-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
