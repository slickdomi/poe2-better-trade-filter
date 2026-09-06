import type { QuerySnapshot } from "../state/types";
import { isQuerySnapshotShape, migrateQuerySnapshotFields, withCurrentSnapshotVersion } from "./schemaVersion";
import { readVersionedStore, writeVersionedStore, type VersionedStoreSpec } from "./versionedStore";

export interface SavedQuery extends QuerySnapshot {
  id: string;
  name: string;
  savedAt: string;
  /** Which folder this lives in, or `null` for the top level. */
  folderId: string | null;
}

export interface SavedQueryFolder {
  id: string;
  name: string;
  /** Parent folder, or `null` for a top-level folder — nesting is unlimited. */
  parentId: string | null;
  createdAt: string;
}

function isSavedQueryFolder(v: unknown): v is SavedQueryFolder {
  return !!v && typeof v === "object" && typeof (v as SavedQueryFolder).id === "string" && typeof (v as SavedQueryFolder).name === "string";
}

/** A SavedQuery is a QuerySnapshot (see schemaVersion.ts for how that part migrates) plus id/name/steps — checked here since a structural QuerySnapshot check alone doesn't require those. */
function isSavedQuery(v: unknown): v is SavedQuery {
  if (!isQuerySnapshotShape(v)) return false;
  const q = v as SavedQuery;
  return typeof q.id === "string" && typeof q.name === "string";
}

/** Migrates the QuerySnapshot-shaped fields, then defaults `folderId` — the one SavedQuery-only field that predates folders — for anything still missing it. */
function migrateSavedQueryRecord(raw: unknown): unknown {
  const migrated = migrateQuerySnapshotFields(raw);
  if (!migrated || typeof migrated !== "object") return migrated;
  return { folderId: null, ...migrated };
}

// See lib/versionedStore.ts for the migration convention these specs follow.
const QUERIES_STORE: VersionedStoreSpec<SavedQuery[]> = {
  key: "poe2-better-trade:saved-queries",
  currentVersion: 1,
  migrations: [],
  sanitize(payload) {
    if (!Array.isArray(payload)) return [];
    return payload.map(migrateSavedQueryRecord).filter(isSavedQuery);
  },
};

const FOLDERS_STORE: VersionedStoreSpec<SavedQueryFolder[]> = {
  key: "poe2-better-trade:saved-query-folders",
  currentVersion: 1,
  migrations: [],
  sanitize(payload) {
    if (!Array.isArray(payload)) return [];
    return payload
      .map((f): unknown => ({ parentId: null, ...(f as Record<string, unknown>) }))
      .filter(isSavedQueryFolder);
  },
};

function readAll(): SavedQuery[] {
  return readVersionedStore(QUERIES_STORE);
}

function writeAll(queries: SavedQuery[]) {
  writeVersionedStore(QUERIES_STORE, queries);
}

function readAllFolders(): SavedQueryFolder[] {
  return readVersionedStore(FOLDERS_STORE);
}

function writeAllFolders(folders: SavedQueryFolder[]) {
  writeVersionedStore(FOLDERS_STORE, folders);
}

/** Sorted newest-first so the most recently saved query is always on top. */
export function listSavedQueries(): SavedQuery[] {
  return readAll().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function listFolders(): SavedQueryFolder[] {
  return readAllFolders();
}

export function saveQuery(input: QuerySnapshot & { name: string; folderId?: string | null }): SavedQuery {
  const query: SavedQuery = withCurrentSnapshotVersion({
    id: crypto.randomUUID(),
    name: input.name,
    savedAt: new Date().toISOString(),
    folderId: input.folderId ?? null,
    league: input.league,
    status: input.status,
    buyoutPrice: input.buyoutPrice,
    enforceAffixCap: input.enforceAffixCap,
    includeUniqueMods: input.includeUniqueMods,
    steps: input.steps,
  });
  writeAll([...readAll(), query]);
  return query;
}

export function deleteSavedQuery(id: string) {
  writeAll(readAll().filter((q) => q.id !== id));
}

export function renameSavedQuery(id: string, name: string) {
  writeAll(readAll().map((q) => (q.id === id ? { ...q, name } : q)));
}

export function moveQueryToFolder(id: string, folderId: string | null) {
  writeAll(readAll().map((q) => (q.id === id ? { ...q, folderId } : q)));
}

export function createFolder(name: string, parentId: string | null = null): SavedQueryFolder {
  const folder: SavedQueryFolder = { id: crypto.randomUUID(), name, parentId, createdAt: new Date().toISOString() };
  writeAllFolders([...readAllFolders(), folder]);
  return folder;
}

export function renameFolder(id: string, name: string) {
  writeAllFolders(readAllFolders().map((f) => (f.id === id ? { ...f, name } : f)));
}

/** True if `ancestorId` is `folderId` itself or one of its ancestors, walking up via `parentId`. */
function isFolderOrAncestor(folders: SavedQueryFolder[], folderId: string, ancestorId: string): boolean {
  let current: string | null = ancestorId;
  const byId = new Map(folders.map((f) => [f.id, f]));
  while (current !== null) {
    if (current === folderId) return true;
    current = byId.get(current)?.parentId ?? null;
  }
  return false;
}

/** Reparents a folder. Refuses (no-ops) a move that would nest a folder inside itself or one of its own subfolders. */
export function moveFolderToFolder(folderId: string, newParentId: string | null) {
  if (folderId === newParentId) return;
  const folders = readAllFolders();
  if (newParentId !== null && isFolderOrAncestor(folders, folderId, newParentId)) return;
  writeAllFolders(folders.map((f) => (f.id === folderId ? { ...f, parentId: newParentId } : f)));
}

/** Deleting a folder never deletes its contents — subfolders and queries inside it move up to its own parent (or the top level) instead. */
export function deleteFolder(id: string) {
  const folders = readAllFolders();
  const folder = folders.find((f) => f.id === id);
  if (!folder) return;
  writeAllFolders(
    folders.filter((f) => f.id !== id).map((f) => (f.parentId === id ? { ...f, parentId: folder.parentId } : f)),
  );
  writeAll(readAll().map((q) => (q.folderId === id ? { ...q, folderId: folder.parentId } : q)));
}

/**
 * The export file's own version — independent of QUERIES_STORE/FOLDERS_STORE's
 * container versions, since it bundles both into one file. Bump it (and add
 * a branch in importSavedQueriesFromJson) only if the *wrapper* shape itself
 * changes; a shape change to a folder or query record is instead handled by
 * the exact same migrateSavedQueryRecord/isSavedQuery pipeline reads already
 * go through, so most schema changes need no update here at all.
 */
const SAVED_QUERIES_EXPORT_VERSION = 1;

interface SavedQueriesExport {
  version: number;
  exportedAt: string;
  folders: SavedQueryFolder[];
  queries: SavedQuery[];
}

export function exportSavedQueriesToJson(): string {
  const data: SavedQueriesExport = {
    version: SAVED_QUERIES_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    folders: readAllFolders(),
    queries: readAll(),
  };
  return JSON.stringify(data, null, 2);
}

/**
 * Imports queries/folders from a previously exported file. Runs every
 * record through the same migration + validation pipeline a normal
 * localStorage read does (so a file exported by an older app version
 * upgrades exactly the same way old localStorage data would), then always
 * imports additively — never overwrites or removes anything already saved
 * locally — so every imported folder and query gets a freshly generated id,
 * with internal folderId/parentId references remapped to match. That also
 * means importing the same file twice (or a file exported from another
 * browser) just adds a second copy rather than colliding with existing ids.
 */
export function importSavedQueriesFromJson(json: string): { foldersImported: number; queriesImported: number } {
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== "object") throw new Error("Not a valid saved-queries export file.");
  const data = parsed as Partial<SavedQueriesExport>;
  if (typeof data.version === "number" && data.version > SAVED_QUERIES_EXPORT_VERSION) {
    throw new Error("This file was exported by a newer version of the app — update the app before importing it.");
  }
  const foldersIn = Array.isArray(data.folders)
    ? data.folders.map((f): unknown => ({ parentId: null, ...(f as unknown as Record<string, unknown>) })).filter(isSavedQueryFolder)
    : [];
  const queriesIn = Array.isArray(data.queries) ? data.queries.map(migrateSavedQueryRecord).filter(isSavedQuery) : [];
  if (foldersIn.length === 0 && queriesIn.length === 0) {
    throw new Error("No saved queries or folders found in this file.");
  }

  const idMap = new Map<string, string>();
  for (const f of foldersIn) idMap.set(f.id, crypto.randomUUID());

  const newFolders: SavedQueryFolder[] = foldersIn.map((f) => ({
    id: idMap.get(f.id)!,
    name: f.name,
    parentId: f.parentId ? (idMap.get(f.parentId) ?? null) : null,
    createdAt: f.createdAt ?? new Date().toISOString(),
  }));
  const newQueries: SavedQuery[] = queriesIn.map((q) => ({
    ...q,
    id: crypto.randomUUID(),
    folderId: q.folderId ? (idMap.get(q.folderId) ?? null) : null,
  }));

  writeAllFolders([...readAllFolders(), ...newFolders]);
  writeAll([...readAll(), ...newQueries]);
  return { foldersImported: newFolders.length, queriesImported: newQueries.length };
}
