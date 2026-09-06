import { describe, expect, it } from "vitest";
import { DEFAULT_SECTION_ID, deriveState } from "./derive";
import type { FiltersData, Step, TradeStatEntry } from "./types";

function stat(id: string, text: string, affixType?: TradeStatEntry["affixType"]): TradeStatEntry {
  return { id, text, type: "explicit", group: "Explicit", affixType };
}

/**
 * A small synthetic dataset shaped like the real one, mirroring the actual
 * "# Intelligence Requirement" scenario this session fixed: a unique-only
 * stat eligible on two categories (weapon.onemace, armour.helmet) that
 * never appears in either category's normal eligibility pool.
 */
function makeFiltersData(): FiltersData {
  return {
    generatedAt: "2026-01-01T00:00:00.000Z",
    leagues: [{ id: "Standard", text: "Standard" }],
    categories: [
      { id: "weapon.onemace", text: "One-Handed Mace" },
      { id: "weapon.twomace", text: "Two-Handed Mace" },
      { id: "armour.helmet", text: "Helmet" },
    ],
    stats: [
      stat("stat.prefix1", "+# to maximum Life", "prefix"),
      stat("stat.prefix2", "+# to Strength", "prefix"),
      stat("stat.prefix3", "+# to Armour", "prefix"),
      stat("stat.prefix4", "+# to Evasion Rating", "prefix"),
      stat("stat.suffix1", "+#% to Fire Resistance", "suffix"),
      stat("stat.suffix2", "+#% to Cold Resistance", "suffix"),
      stat("stat.suffix3", "+#% to Lightning Resistance", "suffix"),
      stat("stat.uniqueonly", "# Intelligence Requirement"),
    ],
    eligibility: {
      "weapon.onemace": [
        "stat.prefix1",
        "stat.prefix2",
        "stat.prefix3",
        "stat.prefix4",
        "stat.suffix1",
        "stat.suffix2",
        "stat.suffix3",
      ],
      "weapon.twomace": ["stat.prefix1", "stat.suffix1"],
      "armour.helmet": ["stat.prefix1", "stat.suffix1"],
    },
    uniqueEligibility: {
      "weapon.onemace": ["stat.uniqueonly"],
      "armour.helmet": ["stat.uniqueonly"],
    },
    eligibilityByItemName: {},
    itemNamesByCategory: {},
    itemFilters: [],
    reqFilters: [],
    reqFilterIdsByCategory: {},
    miscFilters: [],
    miscFilterIdsByCategory: {},
    equipmentFilters: [],
    equipmentFilterIdsByCategory: {},
  };
}

const NO_CAP = { enforceAffixCap: false, includeUniqueMods: false };
const WITH_UNIQUE = { enforceAffixCap: false, includeUniqueMods: true };
const WITH_CAP = { enforceAffixCap: true, includeUniqueMods: false };

describe("deriveState — categories", () => {
  it("with no steps, every category is available", () => {
    const derived = deriveState([], makeFiltersData(), NO_CAP);
    expect(derived.availableCategories.map((c) => c.id).sort()).toEqual([
      "armour.helmet",
      "weapon.onemace",
      "weapon.twomace",
    ]);
  });

  it("locks to exactly the chosen category", () => {
    const steps: Step[] = [{ kind: "category", categoryId: "weapon.twomace" }];
    const derived = deriveState(steps, makeFiltersData(), NO_CAP);
    expect(derived.chosenCategory?.id).toBe("weapon.twomace");
    expect(derived.availableCategories).toHaveLength(1);
  });

  it("narrows to categories that can produce a chosen normal stat, before any category is picked", () => {
    // stat.prefix2/prefix3 only exist on weapon.onemace in this fixture.
    const steps: Step[] = [{ kind: "stat", statId: "stat.prefix2" }];
    const derived = deriveState(steps, makeFiltersData(), NO_CAP);
    expect(derived.availableCategories.map((c) => c.id)).toEqual(["weapon.onemace"]);
  });

  // Regression test for the real bug fixed this session: choosing a
  // unique-only stat (never present in normal `eligibility`) used to empty
  // out `availableCategories` entirely instead of narrowing to the
  // categories that actually carry it via `uniqueEligibility`.
  it("narrows to categories via uniqueEligibility when a unique-only stat is chosen directly", () => {
    const steps: Step[] = [{ kind: "stat", statId: "stat.uniqueonly" }];
    const derived = deriveState(steps, makeFiltersData(), NO_CAP);
    expect(derived.availableCategories.map((c) => c.id).sort()).toEqual(["armour.helmet", "weapon.onemace"]);
    expect(derived.availableCategories.length).toBeGreaterThan(0);
  });

  it("marks a chosen unique-only stat's isUniqueOnly flag regardless of the includeUniqueMods toggle", () => {
    const steps: Step[] = [{ kind: "stat", statId: "stat.uniqueonly" }];
    const derived = deriveState(steps, makeFiltersData(), NO_CAP); // toggle OFF
    expect(derived.chosenStats[0].isUniqueOnly).toBe(true);
  });
});

describe("deriveState — availableStats", () => {
  it("offers exactly the chosen category's eligible stats, excluding unique-only ones by default", () => {
    const steps: Step[] = [{ kind: "category", categoryId: "weapon.twomace" }];
    const derived = deriveState(steps, makeFiltersData(), NO_CAP);
    const ids = derived.availableStats.map((s) => s.id).sort();
    expect(ids).toEqual(["stat.prefix1", "stat.suffix1"]);
  });

  it("excludes a unique-only stat from availableStats when includeUniqueMods is off", () => {
    const steps: Step[] = [{ kind: "category", categoryId: "armour.helmet" }];
    const derived = deriveState(steps, makeFiltersData(), NO_CAP);
    expect(derived.availableStats.map((s) => s.id)).not.toContain("stat.uniqueonly");
  });

  it("includes a unique-only stat in availableStats when includeUniqueMods is on, for a compatible category", () => {
    const steps: Step[] = [{ kind: "category", categoryId: "armour.helmet" }];
    const derived = deriveState(steps, makeFiltersData(), WITH_UNIQUE);
    const uniqueStat = derived.availableStats.find((s) => s.id === "stat.uniqueonly");
    expect(uniqueStat).toBeDefined();
    expect(uniqueStat?.isUniqueOnly).toBe(true);
  });

  it("never offers a unique-only stat for a category it isn't eligible for, even with the toggle on", () => {
    const steps: Step[] = [{ kind: "category", categoryId: "weapon.twomace" }];
    const derived = deriveState(steps, makeFiltersData(), WITH_UNIQUE);
    expect(derived.availableStats.map((s) => s.id)).not.toContain("stat.uniqueonly");
  });

  it("never re-offers an already-chosen stat", () => {
    const steps: Step[] = [
      { kind: "category", categoryId: "weapon.onemace" },
      { kind: "stat", statId: "stat.prefix1" },
    ];
    const derived = deriveState(steps, makeFiltersData(), NO_CAP);
    expect(derived.availableStats.map((s) => s.id)).not.toContain("stat.prefix1");
  });
});

describe("deriveState — affix cap", () => {
  it("counts prefixes and suffixes only within the default section", () => {
    const steps: Step[] = [
      { kind: "category", categoryId: "weapon.onemace" },
      { kind: "stat", statId: "stat.prefix1" },
      { kind: "stat", statId: "stat.prefix2" },
      { kind: "stat", statId: "stat.suffix1" },
    ];
    const derived = deriveState(steps, makeFiltersData(), NO_CAP);
    expect(derived.prefixCount).toBe(2);
    expect(derived.suffixCount).toBe(1);
  });

  it("a stat parked in a non-default section doesn't count toward the cap", () => {
    const steps: Step[] = [
      { kind: "category", categoryId: "weapon.onemace" },
      { kind: "statSection", sectionId: "s1", type: "count", min: 1 },
      { kind: "stat", statId: "stat.prefix1", sectionId: "s1" },
      { kind: "stat", statId: "stat.prefix2" }, // stays in the default section
    ];
    const derived = deriveState(steps, makeFiltersData(), NO_CAP);
    expect(derived.prefixCount).toBe(1);
  });

  it("hides further prefixes once 3 are chosen in the default section, with enforceAffixCap on", () => {
    const steps: Step[] = [
      { kind: "category", categoryId: "weapon.onemace" },
      { kind: "stat", statId: "stat.prefix1" },
      { kind: "stat", statId: "stat.prefix2" },
      { kind: "stat", statId: "stat.prefix3" },
    ];
    const derived = deriveState(steps, makeFiltersData(), WITH_CAP);
    expect(derived.availableStats.some((s) => s.affixType === "prefix")).toBe(false);
    // Suffixes are a separate cap — still offered.
    expect(derived.availableStats.some((s) => s.affixType === "suffix")).toBe(true);
  });

  it("does not hide further prefixes when enforceAffixCap is off", () => {
    const steps: Step[] = [
      { kind: "category", categoryId: "weapon.onemace" },
      { kind: "stat", statId: "stat.prefix1" },
      { kind: "stat", statId: "stat.prefix2" },
      { kind: "stat", statId: "stat.prefix3" },
    ];
    const derived = deriveState(steps, makeFiltersData(), NO_CAP);
    expect(derived.availableStats.some((s) => s.affixType === "prefix")).toBe(true);
  });
});

describe("deriveState — stat sections", () => {
  it("a stat referencing a stale/removed section falls back to the default section", () => {
    const steps: Step[] = [
      { kind: "category", categoryId: "weapon.onemace" },
      { kind: "stat", statId: "stat.prefix1", sectionId: "never-declared" },
    ];
    const derived = deriveState(steps, makeFiltersData(), NO_CAP);
    expect(derived.chosenStats[0].sectionId).toBe(DEFAULT_SECTION_ID);
  });

  it("always includes the default section even with no custom sections", () => {
    const derived = deriveState([], makeFiltersData(), NO_CAP);
    expect(derived.statSections).toHaveLength(1);
    expect(derived.statSections[0].isDefault).toBe(true);
  });

  it("places a stat into its declared custom section", () => {
    const steps: Step[] = [
      { kind: "category", categoryId: "weapon.onemace" },
      { kind: "statSection", sectionId: "s1", type: "not" },
      { kind: "stat", statId: "stat.prefix1", sectionId: "s1" },
    ];
    const derived = deriveState(steps, makeFiltersData(), NO_CAP);
    const customSection = derived.statSections.find((s) => s.id === "s1");
    expect(customSection?.stats.map((s) => s.statId)).toEqual(["stat.prefix1"]);
    expect(derived.statSections.find((s) => s.isDefault)?.stats).toHaveLength(0);
  });
});
