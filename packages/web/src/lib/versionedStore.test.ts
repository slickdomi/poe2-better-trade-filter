import { beforeEach, describe, expect, it } from "vitest";
import { readVersionedStore, writeVersionedStore, type VersionedStoreSpec } from "./versionedStore";

interface Widget {
  name: string;
  count: number;
}

function makeSpec(overrides: Partial<VersionedStoreSpec<Widget[]>> = {}): VersionedStoreSpec<Widget[]> {
  return {
    key: "test:widgets",
    currentVersion: 1,
    migrations: [],
    sanitize: (payload) => (Array.isArray(payload) ? (payload as Widget[]) : []),
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("readVersionedStore", () => {
  it("returns sanitize's fallback when nothing is stored", () => {
    expect(readVersionedStore(makeSpec())).toEqual([]);
  });

  it("returns sanitize's fallback for corrupt JSON instead of throwing", () => {
    localStorage.setItem("test:widgets", "{not valid json");
    expect(readVersionedStore(makeSpec())).toEqual([]);
  });

  it("round-trips data written through the envelope", () => {
    const spec = makeSpec();
    writeVersionedStore(spec, [{ name: "a", count: 1 }]);
    expect(readVersionedStore(spec)).toEqual([{ name: "a", count: 1 }]);
  });

  it("writes the envelope shape, not a bare value", () => {
    const spec = makeSpec();
    writeVersionedStore(spec, [{ name: "a", count: 1 }]);
    const raw = JSON.parse(localStorage.getItem("test:widgets")!);
    expect(raw).toEqual({ v: 1, data: [{ name: "a", count: 1 }] });
  });

  it("treats a bare (pre-envelope) value as version 0 and migrates it forward", () => {
    localStorage.setItem("test:widgets", JSON.stringify([{ name: "legacy" }]));
    const spec = makeSpec({
      currentVersion: 1,
      migrations: [(payload) => (payload as { name: string }[]).map((w) => ({ ...w, count: 0 }))],
    });
    expect(readVersionedStore(spec)).toEqual([{ name: "legacy", count: 0 }]);
  });

  it("walks multiple migrations in order", () => {
    localStorage.setItem("test:widgets", JSON.stringify({ v: 0, data: [{ name: "legacy" }] }));
    const spec = makeSpec({
      currentVersion: 2,
      migrations: [
        (payload) => (payload as { name: string }[]).map((w) => ({ ...w, count: 1 })),
        (payload) => (payload as Widget[]).map((w) => ({ ...w, count: w.count + 41 })),
      ],
    });
    expect(readVersionedStore(spec)).toEqual([{ name: "legacy", count: 42 }]);
  });

  it("stops walking (leaving sanitize to decide) if a migration is missing for the stored version", () => {
    localStorage.setItem("test:widgets", JSON.stringify({ v: 5, data: [{ name: "from-the-future" }] }));
    const spec = makeSpec({ currentVersion: 1, migrations: [] });
    // Nothing to migrate 5 -> 1 with, sanitize just gets the payload as-is.
    expect(readVersionedStore(spec)).toEqual([{ name: "from-the-future" }]);
  });

  it("survives a localStorage.getItem throwing (private-mode style failure)", () => {
    const original = localStorage.getItem;
    localStorage.getItem = () => {
      throw new Error("blocked");
    };
    try {
      expect(readVersionedStore(makeSpec())).toEqual([]);
    } finally {
      localStorage.getItem = original;
    }
  });
});
