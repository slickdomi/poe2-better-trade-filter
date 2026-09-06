import { readVersionedStore, writeVersionedStore, type VersionedStoreSpec } from "./versionedStore";

/** Which collapsible sections of the misc-filter panel remember their open/closed state across reloads. */
export type SectionId = "item" | "requirements" | "equipment" | "more";

type SectionMap = Partial<Record<SectionId, boolean>>;

const SECTION_IDS: SectionId[] = ["item", "requirements", "equipment", "more"];

function isSectionMap(value: unknown): value is SectionMap {
  return !!value && typeof value === "object";
}

// See lib/versionedStore.ts for the migration convention this spec follows.
const STORE: VersionedStoreSpec<SectionMap> = {
  key: "poe2-better-trade:collapsed-sections",
  currentVersion: 1,
  migrations: [],
  sanitize(payload) {
    if (!isSectionMap(payload)) return {};
    const result: SectionMap = {};
    for (const id of SECTION_IDS) {
      const value = (payload as Record<string, unknown>)[id];
      if (typeof value === "boolean") result[id] = value;
    }
    return result;
  },
};

export function getSectionOpen(id: SectionId, defaultOpen: boolean): boolean {
  const stored = readVersionedStore(STORE)[id];
  return typeof stored === "boolean" ? stored : defaultOpen;
}

export function setSectionOpen(id: SectionId, open: boolean) {
  writeVersionedStore(STORE, { ...readVersionedStore(STORE), [id]: open });
}
