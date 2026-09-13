import { describe, expect, it } from "vitest";
import { deriveState } from "../state/derive";
import type { FiltersData, Step, TradeStatEntry } from "../state/types";
import { buildRegex, numberRangePattern } from "./regex";

describe("numberRangePattern", () => {
  const bounds = [0, 1, 5, 9, 10, 11, 19, 20, 29, 30, 45, 99, 100, 101, 110, 120, 199, 200, 250, 999, 1000, 1234];

  it("matches exactly the whole numbers inside a closed range", () => {
    const mismatches: string[] = [];
    for (const min of bounds) {
      for (const max of bounds) {
        if (max < min) continue;
        const re = new RegExp(`^(?:${numberRangePattern(min, max)})$`);
        for (let n = 0; n <= 1300; n++) {
          if (re.test(String(n)) !== (n >= min && n <= max)) mismatches.push(`${min}-${max}: ${n}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("with no max, matches any number at or above min as a substring followed by text", () => {
    const mismatches: string[] = [];
    for (const min of bounds.filter((b) => b > 0)) {
      const re = new RegExp(`(?:${numberRangePattern(min, undefined)})%`);
      for (let n = 0; n <= 12000; n += n < 1300 ? 1 : 7) {
        if (re.test(`+${n}%`) !== n >= min) mismatches.push(`${min}+: ${n}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("with `.` for digits, matches exactly a rolled value in front of its roll range", () => {
    const mismatches: string[] = [];
    for (const min of bounds) {
      const open = min > 0 ? new RegExp(`(?:${numberRangePattern(min, undefined, ".")})\\(`) : null;
      const closed = bounds
        .filter((max) => max >= min)
        .map((max) => ({ max, re: new RegExp(`\\b(?:${numberRangePattern(min, max, ".")})\\(`) }));
      for (let n = 0; n <= 1300; n++) {
        for (const text of [`+${n}(0-9999) to Spirit`, `${n}(0-9999)% increased Spirit`, `Gain ${n}(0-9999) Life`]) {
          if (open && open.test(text) !== n >= min) mismatches.push(`${min}+: ${text}`);
          for (const { max, re } of closed) {
            if (re.test(text) !== (n >= min && n <= max)) mismatches.push(`${min}-${max}: ${text}`);
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("returns null when nothing is constrained or the range is empty", () => {
    expect(numberRangePattern(undefined, undefined)).toBeNull();
    expect(numberRangePattern(0, undefined)).toBeNull();
    expect(numberRangePattern(10, 5)).toBeNull();
  });

  it("stays compact", () => {
    expect(numberRangePattern(45, undefined)).toBe("(4[5-9]|[5-9]\\d|\\d{3})");
    expect(numberRangePattern(45, undefined, ".")).toBe("(4[5-9]|[5-9].|\\d..)");
    expect(numberRangePattern(40, 99)).toBe("[4-9]\\d");
    expect(numberRangePattern(30, 99, ".")).toBe("[3-9].");
  });
});

/** `tiers` as [min, max] rolls; left out, the stat has no tier data. */
function stat(id: string, text: string, tiers?: Array<[number, number]>): TradeStatEntry {
  return {
    id,
    text,
    type: "explicit",
    group: "Explicit",
    tierGroups: tiers && [
      { source: "Base", tiers: tiers.map(([min, max], i) => ({ tier: tiers.length - i, requiredLevel: 1, min, max })) },
    ],
  };
}

const LIFE_TIERS: Array<[number, number]> = [
  [10, 19],
  [20, 29],
  [30, 49],
  [50, 69],
  [70, 89],
  [90, 109],
  [110, 129],
];
const RESISTANCE_TIERS: Array<[number, number]> = [
  [6, 10],
  [11, 15],
  [16, 20],
  [21, 25],
  [26, 30],
  [31, 35],
  [36, 40],
  [41, 45],
];

const STATS = [
  stat("life", "# to maximum Life", LIFE_TIERS),
  stat("mana", "# to maximum Mana", LIFE_TIERS),
  stat("es_local", "# to maximum Energy Shield (Local)"),
  stat("es_increased", "#% increased Energy Shield", [
    [15, 26],
    [27, 42],
  ]),
  stat("fire", "#% to Fire Resistance", RESISTANCE_TIERS),
  stat("cold", "#% to Cold Resistance", RESISTANCE_TIERS),
  stat("crit", "#% increased Critical Hit Chance", [
    [10, 14],
    [15, 19],
  ]),
  stat("crit_spells", "#% increased Critical Hit Chance for Spells", [
    [27, 33],
    [34, 39],
  ]),
  stat("thorns", "# to # Physical Thorns damage"),
  stat("life_on_kill", "Gain # Life per enemy killed"),
  stat("mana_on_kill", "Gain # Mana per enemy killed"),
  stat("minion_levels", "# to Level of all Minion Skills", [
    [1, 1],
    [2, 2],
    [3, 3],
  ]),
];

function makeFiltersData(stats: TradeStatEntry[]): FiltersData {
  return {
    generatedAt: "2026-01-01T00:00:00.000Z",
    leagues: [{ id: "Standard", text: "Standard" }],
    categories: [{ id: "armour.helmet", text: "Helmet" }],
    stats,
    eligibility: { "armour.helmet": stats.map((s) => s.id) },
    uniqueEligibility: {},
    eligibilityByItemName: {},
    itemNamesByCategory: { "armour.helmet": ["Iron Hat"] },
    itemFilters: [],
    reqFilters: [],
    reqFilterIdsByCategory: {},
    miscFilters: [],
    miscFilterIdsByCategory: {},
    equipmentFilters: [],
    equipmentFilterIdsByCategory: {},
  };
}

const data = makeFiltersData(STATS);

function regexIn(filtersData: FiltersData, ...steps: Step[]) {
  const derived = deriveState([{ kind: "category", categoryId: "armour.helmet" }, ...steps], filtersData, {
    enforceAffixCap: false,
    includeUniqueMods: false,
  });
  return buildRegex(derived, filtersData);
}

function regexFor(...steps: Step[]) {
  return regexIn(data, ...steps);
}

/**
 * A stand-in for the in-game search box, as poe2.re relies on it:
 * space-separated terms (quotes keep one together) are ANDed, `!` negates a
 * term, and each term is tested case-insensitively against every line of
 * the item text on its own.
 */
function searchMatches(search: string, itemLines: string[]): boolean {
  return (search.match(/"[^"]*"|\S+/g) ?? []).every((raw) => {
    let term = raw.replace(/^"|"$/g, "");
    const negate = term.startsWith("!");
    if (negate) term = term.slice(1);
    const re = new RegExp(term, "i");
    return itemLines.some((line) => re.test(line)) !== negate;
  });
}

describe("buildRegex", () => {
  it("is empty when no modifier or base type is chosen", () => {
    expect(regexFor()).toEqual({ regex: "", warnings: [] });
  });

  it("quotes a term only when it contains a space", () => {
    expect(regexFor({ kind: "stat", statId: "fire", min: 30 }).regex).not.toContain('"');
    expect(regexFor({ kind: "itemName", name: "Iron Hat" }).regex).toBe('"iron hat"');
  });

  it("matches a modifier's minimum value, reading past the roll range the game prints after it", () => {
    const { regex, warnings } = regexFor({ kind: "stat", statId: "life", min: 45 });
    expect(warnings).toEqual([]);
    expect(searchMatches(regex, ["+45(30-49) to maximum Life"])).toBe(true);
    expect(searchMatches(regex, ["+120(110-129) to maximum Life"])).toBe(true);
    expect(searchMatches(regex, ["+44(30-49) to maximum Life"])).toBe(false);
    expect(searchMatches(regex, ["+80(70-89) to maximum Mana"])).toBe(false);
  });

  it("never mistakes a bound of the roll range for the rolled value", () => {
    const { regex } = regexFor({ kind: "stat", statId: "fire", min: 30 });
    expect(searchMatches(regex, ["+31(31-35)% to Fire Resistance"])).toBe(true);
    expect(searchMatches(regex, ["+29(26-30)% to Fire Resistance"])).toBe(false);
    expect(searchMatches(regex, ["+29(26-35)% to Fire Resistance"])).toBe(false);
  });

  it("uses the modifier's known rolls to shorten the number, and a short slice of text", () => {
    // No resistance tier rolls past 45, so "30 or more" only has to cover two digits.
    expect(regexFor({ kind: "stat", statId: "fire", min: 30 }).regex).toBe("[3-9].\\(.*fir");
  });

  it("drops a bound every possible roll already satisfies", () => {
    const { regex } = regexFor({ kind: "stat", statId: "fire", min: 5, max: 60 });
    expect(regex).not.toContain("\\(");
    expect(searchMatches(regex, ["+8(6-10)% to Fire Resistance"])).toBe(true);
  });

  it("matches a value with or without a printed range when the tiers don't say which", () => {
    const { regex } = regexFor({ kind: "stat", statId: "es_local", min: 30 });
    expect(searchMatches(regex, ["+35(30-40) to maximum Energy Shield"])).toBe(true);
    expect(searchMatches(regex, ["+35 to maximum Energy Shield"])).toBe(true);
    expect(searchMatches(regex, ["+29(20-35) to maximum Energy Shield"])).toBe(false);
    expect(searchMatches(regex, ["Energy Shield: 120"])).toBe(false);
    expect(searchMatches(regex, ["35(27-42)% increased Energy Shield"])).toBe(false);
  });

  it("matches a value from fixed tiers, which the game prints without a range", () => {
    const { regex } = regexFor({ kind: "stat", statId: "minion_levels", min: 2 });
    expect(searchMatches(regex, ["+2 to Level of all Minion Skills"])).toBe(true);
    expect(searchMatches(regex, ["+3 to Level of all Minion Skills"])).toBe(true);
    expect(searchMatches(regex, ["+1 to Level of all Minion Skills"])).toBe(false);
  });

  it("enforces a max exactly", () => {
    const { regex, warnings } = regexFor({ kind: "stat", statId: "life", max: 50 });
    expect(warnings).toEqual([]);
    expect(searchMatches(regex, ["+45(30-49) to maximum Life"])).toBe(true);
    expect(searchMatches(regex, ["+10(10-19) to maximum Life"])).toBe(true);
    expect(searchMatches(regex, ["+55(50-69) to maximum Life"])).toBe(false);
    expect(searchMatches(regex, ["+115(110-129) to maximum Life"])).toBe(false);
  });

  it("enforces a max exactly on a value without tier data", () => {
    const { regex } = regexFor({ kind: "stat", statId: "life_on_kill", max: 5 });
    expect(searchMatches(regex, ["Gain 4 Life per enemy killed"])).toBe(true);
    expect(searchMatches(regex, ["Gain 15 Life per enemy killed"])).toBe(false);
    expect(searchMatches(regex, ["Gain 4 Mana per enemy killed"])).toBe(false);
  });

  it("uses a short unique slice of the text rather than all of it", () => {
    const { regex } = regexFor({ kind: "stat", statId: "thorns" });
    expect(regex.length).toBeLessThan("# to # physical thorns damage".length / 2);
    expect(searchMatches(regex, ["Adds 4(3-5) to 7(6-8) Physical Thorns damage"])).toBe(true);
    expect(searchMatches(regex, ["Physical Damage: 10-20"])).toBe(false);
  });

  it("anchors to the end of the line to tell a modifier from a longer one containing it", () => {
    const { regex, warnings } = regexFor({ kind: "stat", statId: "crit", min: 12 });
    expect(warnings).toEqual([]);
    expect(regex).toContain("$");
    expect(searchMatches(regex, ["12(10-14)% increased Critical Hit Chance"])).toBe(true);
    expect(searchMatches(regex, ["30(27-33)% increased Critical Hit Chance for Spells"])).toBe(false);
  });

  it("requires every modifier of the default group", () => {
    const { regex } = regexFor({ kind: "stat", statId: "life", min: 45 }, { kind: "stat", statId: "fire", min: 30 });
    expect(searchMatches(regex, ["+50(50-69) to maximum Life", "+31(31-35)% to Fire Resistance"])).toBe(true);
    expect(searchMatches(regex, ["+50(50-69) to maximum Life", "+29(26-30)% to Fire Resistance"])).toBe(false);
    expect(searchMatches(regex, ["+31(31-35)% to Fire Resistance"])).toBe(false);
  });

  it("excludes the modifiers of a Not group", () => {
    const { regex } = regexFor(
      { kind: "stat", statId: "life" },
      { kind: "statSection", sectionId: "g1", type: "not" },
      { kind: "stat", statId: "thorns", sectionId: "g1" },
      { kind: "stat", statId: "crit_spells", sectionId: "g1" },
    );
    expect(searchMatches(regex, ["+50(50-69) to maximum Life"])).toBe(true);
    expect(searchMatches(regex, ["+50(50-69) to maximum Life", "Adds 1(1-2) to 2(2-3) Physical Thorns damage"])).toBe(false);
    expect(searchMatches(regex, ["+50(50-69) to maximum Life", "30(27-33)% increased Critical Hit Chance for Spells"])).toBe(false);
    expect(searchMatches(regex, ["+50(50-69) to maximum Life", "12(10-14)% increased Critical Hit Chance"])).toBe(true);
  });

  it("matches any modifier of a Count group, or all of them once its min covers every one", () => {
    const section: Step = { kind: "statSection", sectionId: "g1", type: "count" };
    const members: Step[] = [
      { kind: "stat", statId: "fire", sectionId: "g1" },
      { kind: "stat", statId: "cold", sectionId: "g1" },
    ];
    const anyOf = regexFor(section, ...members).regex;
    expect(searchMatches(anyOf, ["+20(16-20)% to Cold Resistance"])).toBe(true);
    expect(searchMatches(anyOf, ["+20(16-20) to maximum Life"])).toBe(false);

    const allOf = regexFor({ ...section, min: 2 }, ...members).regex;
    expect(searchMatches(allOf, ["+20(16-20)% to Cold Resistance"])).toBe(false);
    expect(searchMatches(allOf, ["+20(16-20)% to Cold Resistance", "+20(16-20)% to Fire Resistance"])).toBe(true);
  });

  it("writes a value pattern shared across an any-of group only once", () => {
    const { regex } = regexFor(
      { kind: "statSection", sectionId: "g1", type: "count" },
      { kind: "stat", statId: "fire", sectionId: "g1", min: 30 },
      { kind: "stat", statId: "cold", sectionId: "g1", min: 30 },
    );
    expect(regex.match(/\[3-9\]/g)).toHaveLength(1);
    expect(searchMatches(regex, ["+31(31-35)% to Cold Resistance"])).toBe(true);
    expect(searchMatches(regex, ["+31(31-35)% to Fire Resistance"])).toBe(true);
    expect(searchMatches(regex, ["+25(21-25)% to Cold Resistance"])).toBe(false);
  });

  it("warns when a Count group asks for something between one and all", () => {
    const { warnings } = regexFor(
      { kind: "statSection", sectionId: "g1", type: "count", min: 2 },
      { kind: "stat", statId: "fire", sectionId: "g1" },
      { kind: "stat", statId: "cold", sectionId: "g1" },
      { kind: "stat", statId: "life", sectionId: "g1" },
    );
    expect(warnings).toEqual([expect.stringMatching(/Count group/)]);
  });

  it("leaves out groups a regex can't express, with a warning", () => {
    const { regex, warnings } = regexFor(
      { kind: "stat", statId: "life" },
      { kind: "statSection", sectionId: "g1", type: "weight" },
      { kind: "stat", statId: "fire", sectionId: "g1", weight: 2 },
    );
    expect(searchMatches(regex, ["+50(50-69) to maximum Life"])).toBe(true);
    expect(warnings).toEqual([expect.stringMatching(/Weighted sum groups/)]);
  });

  it("warns when no slice of a modifier's text sets it apart from another", () => {
    const clashData = makeFiltersData([...STATS, stat("life_percent", "#% to maximum Life", LIFE_TIERS)]);
    const { regex, warnings } = regexIn(clashData, { kind: "stat", statId: "life", min: 45 });
    expect(searchMatches(regex, ["+50(50-69) to maximum Life"])).toBe(true);
    expect(warnings).toEqual([expect.stringContaining('"#% to maximum Life"')]);
  });

  describe("modifiers only set apart by text on both sides of their value", () => {
    const minionData = makeFiltersData([
      ...STATS,
      stat("minion_life", "Minions have #% increased maximum Life", [
        [10, 15],
        [16, 20],
      ]),
      stat("minion_speed", "Minions have #% increased Attack and Cast Speed", [
        [5, 8],
        [9, 12],
      ]),
      stat("minion_movement", "Minions have #% increased Movement Speed", [[5, 10]]),
      stat("life_increased", "#% increased maximum Life", [[3, 8]]),
      stat("attack_cast_speed", "#% increased Attack and Cast Speed", [[4, 9]]),
    ]);

    it("matches them with two short slices instead of their whole text", () => {
      const { regex, warnings } = regexIn(
        minionData,
        { kind: "stat", statId: "minion_speed" },
        { kind: "stat", statId: "minion_life" },
      );
      expect(warnings).toEqual([]);
      expect(regex.length).toBeLessThan('"% increased attack and cast speed$" "% increased maximum life$"'.length / 2);

      const minionItem = ["Minions have 10(9-12)% increased Attack and Cast Speed", "Minions have 18(16-20)% increased maximum Life"];
      expect(searchMatches(regex, minionItem)).toBe(true);
      expect(searchMatches(regex, ["8(4-9)% increased Attack and Cast Speed", "6(3-8)% increased maximum Life"])).toBe(false);
      expect(searchMatches(regex, [minionItem[0], "Minions have 7(5-10)% increased Movement Speed"])).toBe(false);
    });

    it("keeps the value between the two slices when a min applies", () => {
      const { regex } = regexIn(minionData, { kind: "stat", statId: "minion_life", min: 18 });
      expect(searchMatches(regex, ["Minions have 18(16-20)% increased maximum Life"])).toBe(true);
      expect(searchMatches(regex, ["Minions have 16(16-20)% increased maximum Life"])).toBe(false);
      expect(searchMatches(regex, ["18(3-20)% increased maximum Life"])).toBe(false);
    });
  });

  it("leaves out disabled modifiers", () => {
    const { regex } = regexFor({ kind: "stat", statId: "life", min: 45 }, { kind: "stat", statId: "fire", min: 30, disabled: true });
    expect(searchMatches(regex, ["+50(50-69) to maximum Life"])).toBe(true);
    expect(regexFor({ kind: "stat", statId: "fire", min: 30, disabled: true })).toEqual({ regex: "", warnings: [] });
  });

  it("ignores a range on a modifier with several values, with a warning", () => {
    const { regex, warnings } = regexFor({ kind: "stat", statId: "thorns", min: 5 });
    expect(searchMatches(regex, ["Adds 1(1-2) to 2(2-3) Physical Thorns damage"])).toBe(true);
    expect(warnings).toEqual([expect.stringMatching(/more than one value/)]);
  });
});
