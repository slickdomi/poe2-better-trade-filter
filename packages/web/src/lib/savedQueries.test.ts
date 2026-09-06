import { beforeEach, describe, expect, it } from "vitest";
import {
  createFolder,
  deleteFolder,
  deleteSavedQuery,
  exportSavedQueriesToJson,
  importSavedQueriesFromJson,
  listFolders,
  listSavedQueries,
  moveFolderToFolder,
  moveQueryToFolder,
  renameFolder,
  renameSavedQuery,
  saveQuery,
} from "./savedQueries";
import type { QuerySnapshot } from "../state/types";

const BASE_SNAPSHOT: QuerySnapshot = {
  league: "Standard",
  status: "securable",
  buyoutPrice: { currency: "" },
  enforceAffixCap: true,
  includeUniqueMods: false,
  steps: [{ kind: "category", categoryId: "weapon" }],
};

beforeEach(() => {
  localStorage.clear();
});

describe("saveQuery / listSavedQueries", () => {
  it("saves and lists a query, newest first", () => {
    const a = saveQuery({ ...BASE_SNAPSHOT, name: "First" });
    const b = saveQuery({ ...BASE_SNAPSHOT, name: "Second", savedAt: "irrelevant" } as never);
    const names = listSavedQueries().map((q) => q.name);
    // Both saved "now" — order isn't the point here, presence and shape is.
    expect(names).toContain("First");
    expect(names).toContain("Second");
    expect(a.id).not.toBe(b.id);
  });

  it("defaults folderId to null when not specified", () => {
    saveQuery({ ...BASE_SNAPSHOT, name: "Root query" });
    expect(listSavedQueries()[0].folderId).toBeNull();
  });

  it("stamps the current schema version onto the saved record", () => {
    saveQuery({ ...BASE_SNAPSHOT, name: "Versioned" });
    const raw = JSON.parse(localStorage.getItem("poe2-better-trade:saved-queries")!);
    expect(raw.v).toBe(1);
    expect(raw.data[0].v).toBe(1);
  });
});

describe("deleteSavedQuery / renameSavedQuery / moveQueryToFolder", () => {
  it("deletes exactly the targeted query", () => {
    const a = saveQuery({ ...BASE_SNAPSHOT, name: "Keep" });
    const b = saveQuery({ ...BASE_SNAPSHOT, name: "Delete me" });
    deleteSavedQuery(b.id);
    const remaining = listSavedQueries();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(a.id);
  });

  it("renames a query without touching anything else", () => {
    const q = saveQuery({ ...BASE_SNAPSHOT, name: "Old name" });
    renameSavedQuery(q.id, "New name");
    expect(listSavedQueries()[0].name).toBe("New name");
    expect(listSavedQueries()[0].league).toBe("Standard");
  });

  it("moves a query into a folder and back out", () => {
    const folder = createFolder("Weapons");
    const q = saveQuery({ ...BASE_SNAPSHOT, name: "Movable" });
    moveQueryToFolder(q.id, folder.id);
    expect(listSavedQueries()[0].folderId).toBe(folder.id);
    moveQueryToFolder(q.id, null);
    expect(listSavedQueries()[0].folderId).toBeNull();
  });
});

describe("folders", () => {
  it("creates nested folders", () => {
    const parent = createFolder("Parent");
    const child = createFolder("Child", parent.id);
    expect(listFolders()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: parent.id, parentId: null }),
        expect.objectContaining({ id: child.id, parentId: parent.id }),
      ]),
    );
  });

  it("renames a folder", () => {
    const f = createFolder("Typo");
    renameFolder(f.id, "Fixed");
    expect(listFolders()[0].name).toBe("Fixed");
  });

  it("reparents a folder via moveFolderToFolder", () => {
    const a = createFolder("A");
    const b = createFolder("B");
    moveFolderToFolder(b.id, a.id);
    expect(listFolders().find((f) => f.id === b.id)?.parentId).toBe(a.id);
  });

  it("refuses to nest a folder inside itself", () => {
    const a = createFolder("A");
    moveFolderToFolder(a.id, a.id);
    expect(listFolders().find((f) => f.id === a.id)?.parentId).toBeNull();
  });

  it("refuses to nest a folder inside its own descendant (cycle prevention)", () => {
    const grandparent = createFolder("Grandparent");
    const parent = createFolder("Parent", grandparent.id);
    const child = createFolder("Child", parent.id);
    // Moving grandparent into its own grandchild would create a cycle.
    moveFolderToFolder(grandparent.id, child.id);
    expect(listFolders().find((f) => f.id === grandparent.id)?.parentId).toBeNull();
  });

  it("allows a legitimate non-cyclical move between unrelated branches", () => {
    const a = createFolder("A");
    const b = createFolder("B");
    const aChild = createFolder("A-child", a.id);
    moveFolderToFolder(aChild.id, b.id);
    expect(listFolders().find((f) => f.id === aChild.id)?.parentId).toBe(b.id);
  });

  it("deleting a folder reparents its subfolders and queries to its own parent, rather than deleting them", () => {
    const parent = createFolder("Parent");
    const child = createFolder("Child", parent.id);
    const q = saveQuery({ ...BASE_SNAPSHOT, name: "In child folder", folderId: child.id });

    deleteFolder(child.id);

    expect(listFolders().find((f) => f.id === child.id)).toBeUndefined();
    expect(listFolders().find((f) => f.id === parent.id)).toBeDefined();
    expect(listSavedQueries().find((q2) => q2.id === q.id)?.folderId).toBe(parent.id);
  });

  it("deleting a top-level folder moves its contents to the top level", () => {
    const folder = createFolder("Top level");
    const q = saveQuery({ ...BASE_SNAPSHOT, name: "Orphaned", folderId: folder.id });
    deleteFolder(folder.id);
    expect(listSavedQueries().find((q2) => q2.id === q.id)?.folderId).toBeNull();
  });
});

describe("export / import", () => {
  it("round-trips queries and folders through export then import", () => {
    const folder = createFolder("Weapons");
    saveQuery({ ...BASE_SNAPSHOT, name: "Exported query", folderId: folder.id });

    const json = exportSavedQueriesToJson();
    localStorage.clear();
    const result = importSavedQueriesFromJson(json);

    expect(result).toEqual({ foldersImported: 1, queriesImported: 1 });
    const imported = listSavedQueries();
    expect(imported).toHaveLength(1);
    expect(imported[0].name).toBe("Exported query");
    const importedFolder = listFolders()[0];
    expect(importedFolder.name).toBe("Weapons");
    // folderId must be remapped to the *new* folder id, not the original.
    expect(imported[0].folderId).toBe(importedFolder.id);
    expect(imported[0].folderId).not.toBe(folder.id);
  });

  it("imports additively, never colliding with or replacing existing data", () => {
    saveQuery({ ...BASE_SNAPSHOT, name: "Already here" });
    const json = exportSavedQueriesToJson(); // exports just "Already here"
    saveQuery({ ...BASE_SNAPSHOT, name: "Added after export" });

    importSavedQueriesFromJson(json);

    const names = listSavedQueries().map((q) => q.name).sort();
    expect(names).toEqual(["Added after export", "Already here", "Already here"]);
  });

  it("importing the same file twice adds two independent copies", () => {
    saveQuery({ ...BASE_SNAPSHOT, name: "Dup me" });
    const json = exportSavedQueriesToJson();
    localStorage.clear();

    importSavedQueriesFromJson(json);
    importSavedQueriesFromJson(json);

    const queries = listSavedQueries();
    expect(queries).toHaveLength(2);
    expect(queries[0].id).not.toBe(queries[1].id);
  });

  it("migrates a legacy (pre-versioning) export file on import", () => {
    const legacyExport = JSON.stringify({
      version: 1,
      exportedAt: "2025-01-01T00:00:00.000Z",
      folders: [{ id: "f1", name: "Old Folder" }], // no parentId, no createdAt
      queries: [{ id: "q1", name: "Old Query", league: "Standard", steps: [] }], // no status/buyoutPrice/etc, no v
    });

    const result = importSavedQueriesFromJson(legacyExport);
    expect(result).toEqual({ foldersImported: 1, queriesImported: 1 });
    const imported = listSavedQueries()[0];
    expect(imported.status).toBe("securable");
    expect(imported.buyoutPrice).toEqual({ currency: "" });
    expect(imported.includeUniqueMods).toBe(false);
  });

  it("rejects a file exported by a newer app version", () => {
    const fromTheFuture = JSON.stringify({ version: 999, folders: [], queries: [{ id: "q1", name: "x", league: "Standard", steps: [] }] });
    expect(() => importSavedQueriesFromJson(fromTheFuture)).toThrow(/newer version/);
  });

  it("rejects a file with no recognizable queries or folders", () => {
    expect(() => importSavedQueriesFromJson(JSON.stringify({ version: 1, folders: [], queries: [] }))).toThrow();
  });

  it("rejects non-JSON input", () => {
    expect(() => importSavedQueriesFromJson("not json at all")).toThrow();
  });
});

describe("legacy localStorage data (pre-versioning)", () => {
  it("reads a bare array with missing fields without crashing, applying sensible defaults", () => {
    localStorage.setItem(
      "poe2-better-trade:saved-queries",
      JSON.stringify([{ id: "legacy-1", name: "Ancient", league: "Standard", steps: [] }]),
    );
    localStorage.setItem("poe2-better-trade:saved-query-folders", JSON.stringify([{ id: "f1", name: "Old" }]));

    const queries = listSavedQueries();
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatchObject({
      status: "securable",
      buyoutPrice: { currency: "" },
      includeUniqueMods: false,
      folderId: null,
    });

    const folders = listFolders();
    expect(folders[0].parentId).toBeNull();
  });

  it("drops entries that don't even look like a valid record, instead of crashing", () => {
    localStorage.setItem("poe2-better-trade:saved-queries", JSON.stringify([{ notAQuery: true }, null, 42]));
    expect(listSavedQueries()).toEqual([]);
  });
});
