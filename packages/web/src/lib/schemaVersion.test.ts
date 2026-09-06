import { describe, expect, it } from "vitest";
import {
  CURRENT_QUERY_SNAPSHOT_VERSION,
  isQuerySnapshotShape,
  migrateQuerySnapshot,
  migrateQuerySnapshotFields,
  withCurrentSnapshotVersion,
} from "./schemaVersion";

describe("migrateQuerySnapshot", () => {
  it("upgrades a pre-versioning snapshot missing every optional field", () => {
    const ancient = { league: "Standard", steps: [{ kind: "category", categoryId: "weapon" }] };
    const result = migrateQuerySnapshot(ancient);
    expect(result).toEqual({
      league: "Standard",
      status: "securable",
      buyoutPrice: { currency: "" },
      enforceAffixCap: true,
      includeUniqueMods: false,
      steps: [{ kind: "category", categoryId: "weapon" }],
      v: CURRENT_QUERY_SNAPSHOT_VERSION,
    });
  });

  it("keeps real values already present, only defaulting what's missing", () => {
    const midLegacy = {
      league: "Standard",
      status: "any",
      buyoutPrice: { currency: "chaos" },
      enforceAffixCap: false,
      steps: [],
    };
    const result = migrateQuerySnapshot(midLegacy);
    expect(result).toMatchObject({
      league: "Standard",
      status: "any",
      buyoutPrice: { currency: "chaos" },
      enforceAffixCap: false,
      includeUniqueMods: false,
    });
  });

  it("passes an already-current snapshot through unchanged", () => {
    const current = withCurrentSnapshotVersion({
      league: "Standard",
      status: "securable",
      buyoutPrice: { currency: "" },
      enforceAffixCap: true,
      includeUniqueMods: true,
      steps: [],
    });
    expect(migrateQuerySnapshot(current)).toEqual(current);
  });

  it("rejects garbage instead of throwing", () => {
    expect(migrateQuerySnapshot({ foo: "bar" })).toBeNull();
    expect(migrateQuerySnapshot(null)).toBeNull();
    expect(migrateQuerySnapshot(undefined)).toBeNull();
    expect(migrateQuerySnapshot("not an object")).toBeNull();
    expect(migrateQuerySnapshot(42)).toBeNull();
  });

  it("rejects a snapshot with an invalid status value", () => {
    const badStatus = { league: "Standard", status: "not-a-real-status", steps: [] };
    expect(migrateQuerySnapshot(badStatus)).toBeNull();
  });

  it("rejects a step missing a `kind`", () => {
    const badStep = { league: "Standard", steps: [{ categoryId: "weapon" }] };
    expect(migrateQuerySnapshot(badStep)).toBeNull();
  });
});

describe("migrateQuerySnapshotFields", () => {
  it("stamps the current version onto the result even when nothing else changes", () => {
    const result = migrateQuerySnapshotFields({ league: "Standard", steps: [] }) as { v: number };
    expect(result.v).toBe(CURRENT_QUERY_SNAPSHOT_VERSION);
  });

  it("leaves extra fields on a superset object (like a SavedQuery record) untouched", () => {
    const record = { id: "abc", name: "My query", folderId: "f1", league: "Standard", steps: [] };
    const result = migrateQuerySnapshotFields(record) as Record<string, unknown>;
    expect(result.id).toBe("abc");
    expect(result.name).toBe("My query");
    expect(result.folderId).toBe("f1");
  });

  it("passes non-objects through unchanged", () => {
    expect(migrateQuerySnapshotFields(null)).toBeNull();
    expect(migrateQuerySnapshotFields("x")).toBe("x");
  });
});

describe("isQuerySnapshotShape", () => {
  it("accepts a well-formed snapshot", () => {
    expect(
      isQuerySnapshotShape({
        league: "Standard",
        status: "securable",
        buyoutPrice: { currency: "" },
        enforceAffixCap: true,
        includeUniqueMods: false,
        steps: [],
      }),
    ).toBe(true);
  });

  it("accepts a superset object with extra fields", () => {
    expect(
      isQuerySnapshotShape({
        league: "Standard",
        status: "securable",
        buyoutPrice: { currency: "" },
        enforceAffixCap: true,
        includeUniqueMods: false,
        steps: [],
        extra: "field",
        v: 1,
      }),
    ).toBe(true);
  });

  it("rejects a missing steps array", () => {
    expect(
      isQuerySnapshotShape({
        league: "Standard",
        status: "securable",
        buyoutPrice: { currency: "" },
        enforceAffixCap: true,
        includeUniqueMods: false,
      }),
    ).toBe(false);
  });
});
