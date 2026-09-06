/** Which collapsible sections of the misc-filter panel remember their open/closed state across reloads. */
export type SectionId = "item" | "requirements" | "equipment" | "more";

const STORAGE_KEY = "poe2-better-trade:collapsed-sections";

function readAll(): Partial<Record<SectionId, boolean>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Partial<Record<SectionId, boolean>>) : {};
  } catch {
    return {};
  }
}

export function getSectionOpen(id: SectionId, defaultOpen: boolean): boolean {
  const stored = readAll()[id];
  return typeof stored === "boolean" ? stored : defaultOpen;
}

export function setSectionOpen(id: SectionId, open: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readAll(), [id]: open }));
  } catch {
    // localStorage unavailable (private mode, quota, etc.) — best-effort.
  }
}
