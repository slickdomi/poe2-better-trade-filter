import { describe, expect, it } from "vitest";
import { fuzzyFilter, fuzzyScore } from "./fuzzySearch";

const LABELS = [
  "#% increased Damage",
  "Minions deal #% increased Damage",
  "Minions have #% increased maximum Life",
  "# to maximum Life",
  "#% increased Attack Speed",
];

const search = (query: string, labels = LABELS) => fuzzyFilter(labels, query, (label) => label);

describe("fuzzyFilter", () => {
  it("finds text containing every word of the query, in any order and only partly typed", () => {
    expect(search("dam minion")).toEqual(["Minions deal #% increased Damage"]);
    expect(search("minion dam")).toEqual(["Minions deal #% increased Damage"]);
    expect(search("max life")).toEqual(["# to maximum Life", "Minions have #% increased maximum Life"]);
  });

  it("drops text missing any word of the query", () => {
    expect(search("minion speed")).toEqual([]);
    expect(search("dam minion")).not.toContain("#% increased Damage");
  });

  it("matches letters skipped within a single word", () => {
    expect(search("dmg")).toEqual(["#% increased Damage", "Minions deal #% increased Damage"]);
    expect(search("atk spd")).toEqual(["#% increased Attack Speed"]);
  });

  it("ranks whole words, then word starts, then matches inside a word, then skipped letters", () => {
    expect(search("ice", ["Increased Price", "Ice Nova", "Icebound"])).toEqual(["Ice Nova", "Icebound", "Increased Price"]);
    expect(fuzzyScore("ice", "Ice Nova")!).toBeGreaterThan(fuzzyScore("ice", "Icebound")!);
    expect(fuzzyScore("ice", "Icebound")!).toBeGreaterThan(fuzzyScore("ice", "Price")!);
    expect(fuzzyScore("ice", "Price")!).toBeGreaterThan(fuzzyScore("ice", "Increased")!);
  });

  it("prefers the shorter, more specific text between equally good matches", () => {
    expect(search("life")).toEqual(["# to maximum Life", "Minions have #% increased maximum Life"]);
  });

  it("returns everything, in its original order, for a blank query", () => {
    expect(search("")).toEqual(LABELS);
    expect(search("   ")).toEqual(LABELS);
  });
});
