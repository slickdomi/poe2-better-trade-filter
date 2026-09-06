import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FiltersOutput } from "./types.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILTERS_PATH = path.resolve(HERE, "../../web/src/data/filters.json");
const TRADE_ITEMS_PATH = path.resolve(HERE, "../raw-cache/trade-items.json");

interface CheckContext {
  data: FiltersOutput;
  /** Every base-type name the live trade site's own item catalog lists — see the item-names check below. */
  validItemNames: Set<string>;
}

type Check = (ctx: CheckContext) => string[] | void;

/**
 * Assertion checks against the generated filters.json — not a unit-test
 * framework (deliberately: this project takes on no new dependencies for
 * this), just a script that fails loudly (non-zero exit) when the pipeline's
 * output violates an invariant we've verified by hand at some point. Run via
 * `npm run check` (data-pipeline), or automatically at the end of `npm run
 * fetch`. Each check returns a list of human-readable failure messages; an
 * empty/undefined return means it passed.
 */
const checks: Record<string, Check> = {
  "every eligibility/uniqueEligibility/eligibilityByItemName id resolves to a real stat"({ data }) {
    const statIds = new Set(data.stats.map((s) => s.id));
    const failures: string[] = [];
    for (const [source, byKey] of [
      ["eligibility", data.eligibility],
      ["uniqueEligibility", data.uniqueEligibility],
      ["eligibilityByItemName", data.eligibilityByItemName],
    ] as const) {
      for (const [key, ids] of Object.entries(byKey)) {
        for (const id of ids) {
          if (!statIds.has(id)) failures.push(`${source}["${key}"] references unknown stat id "${id}"`);
        }
      }
    }
    return failures;
  },

  "uniqueEligibility never overlaps eligibility for the same category"({ data }) {
    const failures: string[] = [];
    for (const [categoryId, uniqueIds] of Object.entries(data.uniqueEligibility)) {
      const normalIds = new Set(data.eligibility[categoryId] ?? []);
      for (const id of uniqueIds) {
        if (normalIds.has(id)) {
          failures.push(`"${id}" is in both eligibility and uniqueEligibility for "${categoryId}"`);
        }
      }
    }
    return failures;
  },

  "every category has at least one eligible modifier (normal or unique)"({ data }) {
    const failures: string[] = [];
    for (const cat of data.categories) {
      const count = (data.eligibility[cat.id]?.length ?? 0) + (data.uniqueEligibility[cat.id]?.length ?? 0);
      if (count === 0) failures.push(`category "${cat.id}" (${cat.text}) has zero eligible modifiers`);
    }
    return failures;
  },

  "category and stat counts haven't collapsed"({ data }) {
    const failures: string[] = [];
    if (data.categories.length < 30) failures.push(`only ${data.categories.length} categories (expected >= 30)`);
    if (data.stats.length < 900) failures.push(`only ${data.stats.length} stats (expected >= 900)`);
    return failures;
  },

  // Regression guard for the bug fixed by scraping poe2db's unique-item list:
  // RePoE's own data only modeled *some* uniques' hardcoded mods (via an
  // optional pseudo-base-item entry), so "# Intelligence Requirement"
  // resolved to Helmet but silently missed the real One- and Two-Handed Mace
  // uniques ("Mjölner"/"Chober Chaber") that also roll it — confirmed live
  // against the official trade site before this fix. If this regresses, the
  // poe2db unique-item scrape/merge is broken again.
  "unique-only Intelligence Requirement covers the confirmed weapon + armour bases"({ data }) {
    const stat = data.stats.find((s) => s.text === "# Intelligence Requirement");
    if (!stat) return [`could not find the "# Intelligence Requirement" stat at all`];
    const expectedCategories = ["weapon.onemace", "weapon.twomace", "armour.helmet"];
    return expectedCategories
      .filter((categoryId) => !data.uniqueEligibility[categoryId]?.includes(stat.id))
      .map((categoryId) => `"${stat.id}" missing from uniqueEligibility["${categoryId}"]`);
  },

  // Regression guard for the (separate, earlier) poe2db Genesis Tree /
  // Otherworldly integration — confirms the scrape->merge pipeline for that
  // feature is still wired up, using one specific stat spot-checked by hand.
  "poe2db Genesis Tree mods still reach Ring eligibility"({ data }) {
    const stat = data.stats.find((s) => s.text === "# to maximum number of Elemental Infusions");
    if (!stat) return [`could not find the "# to maximum number of Elemental Infusions" stat at all`];
    if (!data.eligibility["accessory.ring"]?.includes(stat.id)) {
      return [`"${stat.id}" missing from eligibility["accessory.ring"]`];
    }
  },

  // Regression guard for the fix that filters itemNamesByCategory against the
  // live trade catalog: RePoE marks 200+ base items "released" (dev-only
  // "[DNT]" placeholders, retired bases, etc.) that were never actually
  // obtainable in PoE2 — "Anima Quarterstaff" was the one spotted live in the
  // item-name picker. If this regresses, buildItemNamesByCategory stopped
  // filtering against trade-items.json again.
  "itemNamesByCategory only lists base types the live trade catalog actually has"({ data, validItemNames }) {
    const failures: string[] = [];
    for (const [categoryId, names] of Object.entries(data.itemNamesByCategory)) {
      for (const name of names) {
        if (!validItemNames.has(name)) failures.push(`itemNamesByCategory["${categoryId}"] has stray base "${name}"`);
      }
    }
    return failures;
  },
};

async function main() {
  const raw = await readFile(FILTERS_PATH, "utf8");
  const data = JSON.parse(raw) as FiltersOutput;
  const tradeItems = JSON.parse(await readFile(TRADE_ITEMS_PATH, "utf8")) as {
    result: { entries: { type?: string }[] }[];
  };
  const validItemNames = new Set(tradeItems.result.flatMap((g) => g.entries.flatMap((e) => (e.type ? [e.type] : []))));
  const ctx: CheckContext = { data, validItemNames };

  let failedCount = 0;
  for (const [name, check] of Object.entries(checks)) {
    const failures = check(ctx) ?? [];
    if (failures.length === 0) {
      console.log(`  ok  ${name}`);
    } else {
      failedCount++;
      console.log(`FAIL  ${name}`);
      for (const f of failures.slice(0, 10)) console.log(`        - ${f}`);
      if (failures.length > 10) console.log(`        ... and ${failures.length - 10} more`);
    }
  }

  if (failedCount > 0) {
    console.error(`\n${failedCount} check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log(`\nall checks passed.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
