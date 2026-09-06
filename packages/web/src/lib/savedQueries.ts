import type { QuerySnapshot } from "../state/types";

export interface SavedQuery extends QuerySnapshot {
  id: string;
  name: string;
  savedAt: string;
}

const STORAGE_KEY = "poe2-better-trade:saved-queries";

function readAll(): SavedQuery[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Queries saved before these filters existed default to "securable" (instant buyout),
    // no buyout price constraint, and unique-only modifiers hidden.
    return parsed.map((q) => ({
      status: "securable",
      buyoutPrice: { currency: "" },
      includeUniqueMods: false,
      ...q,
    }));
  } catch {
    return [];
  }
}

function writeAll(queries: SavedQuery[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queries));
  } catch {
    // localStorage unavailable (private mode, quota, etc.) — saves are best-effort.
  }
}

/** Sorted newest-first so the most recently saved query is always on top. */
export function listSavedQueries(): SavedQuery[] {
  return readAll().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function saveQuery(input: QuerySnapshot & { name: string }): SavedQuery {
  const query: SavedQuery = {
    id: crypto.randomUUID(),
    name: input.name,
    savedAt: new Date().toISOString(),
    league: input.league,
    status: input.status,
    buyoutPrice: input.buyoutPrice,
    enforceAffixCap: input.enforceAffixCap,
    includeUniqueMods: input.includeUniqueMods,
    steps: input.steps,
  };
  writeAll([...readAll(), query]);
  return query;
}

export function deleteSavedQuery(id: string) {
  writeAll(readAll().filter((q) => q.id !== id));
}

export function renameSavedQuery(id: string, name: string) {
  writeAll(readAll().map((q) => (q.id === id ? { ...q, name } : q)));
}
