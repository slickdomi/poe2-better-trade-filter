import type { QuerySnapshot, RegexSnapshot } from "../state/types";
import {
  isQuerySnapshotShape,
  isRegexSnapshotShape,
  migrateQuerySnapshotFields,
  migrateRegexSnapshotFields,
  withCurrentRegexSnapshotVersion,
  withCurrentSnapshotVersion,
} from "./schemaVersion";
import { readVersionedStore, writeVersionedStore, type VersionedStoreSpec } from "./versionedStore";

/** One saved entry — `S` is the snapshot shape of the tab it was saved from. */
export type SavedEntry<S extends object> = S & {
  id: string;
  name: string;
  savedAt: string;
  /** Which folder this lives in, or `null` for the top level. */
  folderId: string | null;
};

export type SavedQuery = SavedEntry<QuerySnapshot>;
export type SavedRegex = SavedEntry<RegexSnapshot>;

export interface SavedQueryFolder {
  id: string;
  name: string;
  /** Parent folder, or `null` for a top-level folder — nesting is unlimited. */
  parentId: string | null;
  createdAt: string;
}

/**
 * Which tab a store — and so an export file — belongs to. The Trade and
 * Regex generator tabs keep entirely separate pools (own localStorage keys,
 * own export files) that only share this implementation.
 */
export type SavedQueryKind = "trade" | "regex";

interface SavedQueryStoreSpec<S extends object> {
  kind: SavedQueryKind;
  queriesKey: string;
  foldersKey: string;
  exportFilePrefix: string;
  /** Walks one raw record's snapshot fields forward — see schemaVersion.ts. */
  migrateSnapshotFields: (raw: unknown) => unknown;
  isSnapshotShape: (value: unknown) => value is S;
  /** Copies exactly the snapshot's own fields off `input` (which also carries a name, folder, ...) and stamps its schema version. */
  toVersionedSnapshot: (input: S) => S & { v: number };
}

export interface SavedQueryStore<S extends object> {
  kind: SavedQueryKind;
  exportFilePrefix: string;
  /** Sorted newest-first so the most recently saved entry is always on top. */
  list: () => SavedEntry<S>[];
  listFolders: () => SavedQueryFolder[];
  save: (input: S & { name: string; folderId?: string | null }) => SavedEntry<S>;
  remove: (id: string) => void;
  rename: (id: string, name: string) => void;
  moveToFolder: (id: string, folderId: string | null) => void;
  createFolder: (name: string, parentId?: string | null) => SavedQueryFolder;
  renameFolder: (id: string, name: string) => void;
  /** Reparents a folder. Refuses (no-ops) a move that would nest a folder inside itself or one of its own subfolders. */
  moveFolderToFolder: (folderId: string, newParentId: string | null) => void;
  /** Deleting a folder never deletes its contents — subfolders and entries inside it move up to its own parent (or the top level) instead. */
  deleteFolder: (id: string) => void;
  exportToJson: () => string;
  /**
   * Imports entries/folders from a previously exported file. Runs every
   * record through the same migration + validation pipeline a normal
   * localStorage read does (so a file exported by an older app version
   * upgrades exactly the same way old localStorage data would), then always
   * imports additively — never overwrites or removes anything already saved
   * locally — so every imported folder and entry gets a freshly generated
   * id, with internal folderId/parentId references remapped to match. That
   * also means importing the same file twice (or a file exported from
   * another browser) just adds a second copy rather than colliding with
   * existing ids.
   */
  importFromJson: (json: string) => { foldersImported: number; queriesImported: number };
}

function isSavedQueryFolder(v: unknown): v is SavedQueryFolder {
  return !!v && typeof v === "object" && typeof (v as SavedQueryFolder).id === "string" && typeof (v as SavedQueryFolder).name === "string";
}

function sanitizeFolders(payload: unknown): SavedQueryFolder[] {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((f): unknown => ({ parentId: null, ...(f as Record<string, unknown>) }))
    .filter(isSavedQueryFolder);
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

/**
 * The export file's own version — independent of the stores' container
 * versions, since it bundles both into one file. Bump it (and add a branch
 * in importFromJson) only if the *wrapper* shape itself changes; a shape
 * change to a folder or entry record is instead handled by the exact same
 * migrate/validate pipeline reads already go through, so most schema
 * changes need no update here at all.
 */
const SAVED_QUERIES_EXPORT_VERSION = 1;

interface SavedQueriesExport<S extends object> {
  version: number;
  /** Absent from files exported before the Regex generator existed — those are all trade files. */
  kind?: SavedQueryKind;
  exportedAt: string;
  folders: SavedQueryFolder[];
  queries: SavedEntry<S>[];
}

const KIND_MISMATCH_MESSAGE: Record<SavedQueryKind, string> = {
  trade: "This file holds saved regexes — import it on the Regex generator tab instead.",
  regex: "This file holds saved trade queries — import it on the Trade tab instead.",
};

export function createSavedQueryStore<S extends object>(spec: SavedQueryStoreSpec<S>): SavedQueryStore<S> {
  /** A saved entry is a snapshot (see schemaVersion.ts for how that part migrates) plus id/name — checked here since a structural snapshot check alone doesn't require those. */
  function isSavedEntry(v: unknown): v is SavedEntry<S> {
    if (!spec.isSnapshotShape(v)) return false;
    const q = v as SavedEntry<S>;
    return typeof q.id === "string" && typeof q.name === "string";
  }

  /** Migrates the snapshot-shaped fields, then defaults `folderId` — the one entry-only field that predates folders — for anything still missing it. */
  function migrateRecord(raw: unknown): unknown {
    const migrated = spec.migrateSnapshotFields(raw);
    if (!migrated || typeof migrated !== "object") return migrated;
    return { folderId: null, ...migrated };
  }

  // See lib/versionedStore.ts for the migration convention these specs follow.
  const queriesStore: VersionedStoreSpec<SavedEntry<S>[]> = {
    key: spec.queriesKey,
    currentVersion: 1,
    migrations: [],
    sanitize(payload) {
      if (!Array.isArray(payload)) return [];
      return payload.map(migrateRecord).filter(isSavedEntry);
    },
  };

  const foldersStore: VersionedStoreSpec<SavedQueryFolder[]> = {
    key: spec.foldersKey,
    currentVersion: 1,
    migrations: [],
    sanitize: sanitizeFolders,
  };

  const readAll = () => readVersionedStore(queriesStore);
  const writeAll = (queries: SavedEntry<S>[]) => writeVersionedStore(queriesStore, queries);
  const readAllFolders = () => readVersionedStore(foldersStore);
  const writeAllFolders = (folders: SavedQueryFolder[]) => writeVersionedStore(foldersStore, folders);

  return {
    kind: spec.kind,
    exportFilePrefix: spec.exportFilePrefix,

    list: () => readAll().sort((a, b) => b.savedAt.localeCompare(a.savedAt)),

    listFolders: readAllFolders,

    save(input) {
      const entry = {
        ...spec.toVersionedSnapshot(input),
        id: crypto.randomUUID(),
        name: input.name,
        savedAt: new Date().toISOString(),
        folderId: input.folderId ?? null,
      } as SavedEntry<S>;
      writeAll([...readAll(), entry]);
      return entry;
    },

    remove(id) {
      writeAll(readAll().filter((q) => q.id !== id));
    },

    rename(id, name) {
      writeAll(readAll().map((q) => (q.id === id ? { ...q, name } : q)));
    },

    moveToFolder(id, folderId) {
      writeAll(readAll().map((q) => (q.id === id ? { ...q, folderId } : q)));
    },

    createFolder(name, parentId = null) {
      const folder: SavedQueryFolder = { id: crypto.randomUUID(), name, parentId, createdAt: new Date().toISOString() };
      writeAllFolders([...readAllFolders(), folder]);
      return folder;
    },

    renameFolder(id, name) {
      writeAllFolders(readAllFolders().map((f) => (f.id === id ? { ...f, name } : f)));
    },

    moveFolderToFolder(folderId, newParentId) {
      if (folderId === newParentId) return;
      const folders = readAllFolders();
      if (newParentId !== null && isFolderOrAncestor(folders, folderId, newParentId)) return;
      writeAllFolders(folders.map((f) => (f.id === folderId ? { ...f, parentId: newParentId } : f)));
    },

    deleteFolder(id) {
      const folders = readAllFolders();
      const folder = folders.find((f) => f.id === id);
      if (!folder) return;
      writeAllFolders(
        folders.filter((f) => f.id !== id).map((f) => (f.parentId === id ? { ...f, parentId: folder.parentId } : f)),
      );
      writeAll(readAll().map((q) => (q.folderId === id ? { ...q, folderId: folder.parentId } : q)));
    },

    exportToJson() {
      const data: SavedQueriesExport<S> = {
        version: SAVED_QUERIES_EXPORT_VERSION,
        kind: spec.kind,
        exportedAt: new Date().toISOString(),
        folders: readAllFolders(),
        queries: readAll(),
      };
      return JSON.stringify(data, null, 2);
    },

    importFromJson(json) {
      const parsed: unknown = JSON.parse(json);
      if (!parsed || typeof parsed !== "object") throw new Error("Not a valid saved-queries export file.");
      const data = parsed as Partial<SavedQueriesExport<S>>;
      if (typeof data.version === "number" && data.version > SAVED_QUERIES_EXPORT_VERSION) {
        throw new Error("This file was exported by a newer version of the app — update the app before importing it.");
      }
      if ((data.kind ?? "trade") !== spec.kind) throw new Error(KIND_MISMATCH_MESSAGE[spec.kind]);
      const foldersIn = sanitizeFolders(data.folders);
      const queriesIn = Array.isArray(data.queries) ? data.queries.map(migrateRecord).filter(isSavedEntry) : [];
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
      const newQueries: SavedEntry<S>[] = queriesIn.map((q) => ({
        ...q,
        id: crypto.randomUUID(),
        folderId: q.folderId ? (idMap.get(q.folderId) ?? null) : null,
      }));

      writeAllFolders([...readAllFolders(), ...newFolders]);
      writeAll([...readAll(), ...newQueries]);
      return { foldersImported: newFolders.length, queriesImported: newQueries.length };
    },
  };
}

export const tradeQueryStore = createSavedQueryStore<QuerySnapshot>({
  kind: "trade",
  queriesKey: "poe2-better-trade:saved-queries",
  foldersKey: "poe2-better-trade:saved-query-folders",
  exportFilePrefix: "poe2-better-trade-saved-queries",
  migrateSnapshotFields: migrateQuerySnapshotFields,
  isSnapshotShape: isQuerySnapshotShape,
  toVersionedSnapshot: (q) =>
    withCurrentSnapshotVersion({
      league: q.league,
      status: q.status,
      buyoutPrice: q.buyoutPrice,
      enforceAffixCap: q.enforceAffixCap,
      includeUniqueMods: q.includeUniqueMods,
      steps: q.steps,
    }),
});

export const regexQueryStore = createSavedQueryStore<RegexSnapshot>({
  kind: "regex",
  queriesKey: "poe2-better-trade:saved-regexes",
  foldersKey: "poe2-better-trade:saved-regex-folders",
  exportFilePrefix: "poe2-better-trade-saved-regexes",
  migrateSnapshotFields: migrateRegexSnapshotFields,
  isSnapshotShape: isRegexSnapshotShape,
  toVersionedSnapshot: (q) =>
    withCurrentRegexSnapshotVersion({
      enforceAffixCap: q.enforceAffixCap,
      includeUniqueMods: q.includeUniqueMods,
      steps: q.steps,
    }),
});
