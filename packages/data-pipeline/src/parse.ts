import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTradeStatIndex, normalizeRepoeText, resolveTradeStatId } from "./matchStatIds.js";
import { eligibleModIdsForItemClasses, flattenModsByBase } from "./buildEligibility.js";
import { buildPassthroughFilters } from "./equipmentFilters.js";
import { buildItemNamesByCategory } from "./itemNames.js";
import { CATEGORY_ITEM_CLASSES } from "./categoryItemClasses.js";
import {
  equipmentFilterIdsForCategory,
  MISC_FILTER_IDS_NEVER_APPLICABLE,
  miscFilterIdsForCategory,
  reqFilterIdsForCategory,
} from "./categoryFilterScoping.js";
import type {
  FiltersOutput,
  RawFilterGroup,
  RepoeBaseItemsFile,
  RepoeMod,
  RepoeModsByBaseFile,
  RepoeModsFile,
  StatTier,
  TradeStatEntry,
  TradeStatGroup,
} from "./types.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW_CACHE_DIR = path.resolve(HERE, "../raw-cache");
const OUTPUT_PATH = path.resolve(HERE, "../../web/src/data/filters.json");

async function loadJson<T>(name: string): Promise<T> {
  const raw = await readFile(path.join(RAW_CACHE_DIR, `${name}.json`), "utf8");
  return JSON.parse(raw) as T;
}

/**
 * Different mod pools (a normal prefix/suffix ladder, an essence-only
 * variant, a unique-only fixed mod, ...) can normalize to identical trade
 * stat text. RePoE's `groups` field is the game's own "these are mutually
 * exclusive tiers of one another" key, so picking the most common group
 * among the collected mods filters out that cross-pool noise before
 * building the ladder.
 */
interface TierInfo {
  tiers: StatTier[];
  affixType?: "prefix" | "suffix";
}

function buildTierInfo(mods: RepoeMod[]): TierInfo {
  if (mods.length === 0) return { tiers: [] };
  const counts = new Map<string, number>();
  for (const m of mods) {
    const key = m.groups[0] ?? "";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const [dominantGroup] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const filtered = mods.filter((m) => (m.groups[0] ?? "") === dominantGroup);

  const sorted = [...filtered].sort((a, b) => a.required_level - b.required_level);
  const tiers = sorted.map((m, i) => ({
    tier: sorted.length - i,
    requiredLevel: m.required_level,
    min: m.stats[0].min,
    max: m.stats[0].max,
  }));
  // A mod group is a single prefix or suffix by design, so every tier in
  // the (already deduped-to-one-group) list shares the same generation_type.
  const generationType = filtered[0]?.generation_type;
  const affixType = generationType === "prefix" || generationType === "suffix" ? generationType : undefined;
  return { tiers, affixType };
}

async function main() {
  const [tradeStats, tradeFilters, tradeLeagues, baseItems, mods, modsByBase] = await Promise.all([
    loadJson<{ result: TradeStatGroup[] }>("trade-stats"),
    loadJson<{ result: RawFilterGroup[] }>("trade-filters"),
    loadJson<{ result: { id: string; text: string }[] }>("trade-leagues"),
    loadJson<RepoeBaseItemsFile>("repoe-base-items"),
    loadJson<RepoeModsFile>("repoe-mods"),
    loadJson<RepoeModsByBaseFile>("repoe-mods-by-base"),
  ]);

  const statIndex = buildTradeStatIndex(tradeStats.result);
  const tagKeyToModIds = flattenModsByBase(modsByBase);
  const statTextById = new Map(tradeStats.result.flatMap((g) => g.entries).map((e) => [e.id, e.text]));

  const categoryOptionText = new Map<string, string>();
  const typeFilters = tradeFilters.result.find((g) => g.id === "type_filters");
  const categoryFilter = typeFilters?.filters.find((f) => f.id === "category");
  for (const option of categoryFilter?.option?.options ?? []) {
    if (option.id) categoryOptionText.set(option.id, option.text);
  }

  const usedStatIds = new Set<string>();
  // Tiers are a property of the stat itself, not of a category, so we
  // dedupe by modId across every category that resolves to the same trade
  // stat id.
  const statIdToMods = new Map<string, Map<string, RepoeMod>>();
  const eligibility: Record<string, string[]> = {};
  const reqFilterIdsByCategory: Record<string, string[]> = {};
  const equipmentFilterIdsByCategory: Record<string, string[]> = {};
  const categories: { id: string; text: string }[] = [];
  let matched = 0;
  let unmatched = 0;
  let skippedMultiStat = 0;

  for (const [categoryId, repoeClasses] of Object.entries(CATEGORY_ITEM_CLASSES)) {
    const text = categoryOptionText.get(categoryId);
    if (!text) {
      console.warn(`category "${categoryId}" not found in trade data/filters, skipping`);
      continue;
    }
    categories.push({ id: categoryId, text });

    const modIds = eligibleModIdsForItemClasses(repoeClasses, baseItems, tagKeyToModIds);
    const statIds = new Set<string>();

    for (const modId of modIds) {
      const mod = mods[modId];
      if (!mod || !mod.text) continue;
      // mods_by_base.json's per-base-tag entries include a "unique" bucket:
      // mods hardcoded onto specific unique items, not a rollable tier
      // ladder. `domain` isn't a reliable "is this a normal mod" signal
      // (jewels' normal suffix/prefix mods are domain "misc", not "item"),
      // so generation_type is the only safe exclusion here.
      if (mod.generation_type === "unique") continue;
      if (mod.stats.length !== 1) {
        skippedMultiStat++;
        continue;
      }
      const isImplicit = mod.generation_type === "implicit";
      const bucketOrder = isImplicit ? ["implicit", "explicit"] : ["explicit", "implicit"];
      const normalized = normalizeRepoeText(mod.text);
      const resolved = resolveTradeStatId(statIndex, bucketOrder, normalized);
      if (resolved) {
        statIds.add(resolved.id);
        usedStatIds.add(resolved.id);
        matched++;
        // Tier ladders only make sense for the actual rollable crafting
        // pool (prefix/suffix). Corrupted-implicit and base-implicit mods
        // are fixed, single-value additions from a different pool that
        // happens to share the same stat text and mod `group` — mixing
        // them in produces a nonsensical, non-monotonic "ladder".
        if (mod.generation_type === "prefix" || mod.generation_type === "suffix") {
          let modsForStat = statIdToMods.get(resolved.id);
          if (!modsForStat) {
            modsForStat = new Map();
            statIdToMods.set(resolved.id, modsForStat);
          }
          modsForStat.set(modId, mod);
        }
      } else {
        unmatched++;
      }
    }

    eligibility[categoryId] = [...statIds].sort();
    reqFilterIdsByCategory[categoryId] = reqFilterIdsForCategory(repoeClasses, baseItems);
    const hasSpiritStat = [...statIds].some((id) => /Spirit/.test(statTextById.get(id) ?? ""));
    equipmentFilterIdsByCategory[categoryId] = equipmentFilterIdsForCategory(
      repoeClasses,
      baseItems,
      categoryId,
      hasSpiritStat,
    );
  }

  console.log(
    `stat matching: ${matched} matched, ${unmatched} unmatched, ${skippedMultiStat} multi-stat mods skipped`,
  );

  const stats: TradeStatEntry[] = tradeStats.result.flatMap((g) =>
    g.entries
      .filter((e) => usedStatIds.has(e.id))
      .map((e) => {
        const modsForStat = statIdToMods.get(e.id);
        const { tiers, affixType } = modsForStat ? buildTierInfo([...modsForStat.values()]) : { tiers: [], affixType: undefined };
        return {
          id: e.id,
          text: e.text,
          type: e.type,
          group: g.label,
          tiers: tiers.length > 0 ? tiers : undefined,
          affixType,
        };
      }),
  );

  const itemNamesByCategory = buildItemNamesByCategory(CATEGORY_ITEM_CLASSES, baseItems);
  const itemFilters = buildPassthroughFilters(tradeFilters.result, "type_filters", ["rarity", "ilvl", "quality"]);
  const reqFilters = buildPassthroughFilters(tradeFilters.result, "req_filters");
  const miscFilters = buildPassthroughFilters(tradeFilters.result, "misc_filters").filter(
    (f) => !MISC_FILTER_IDS_NEVER_APPLICABLE.includes(f.id),
  );
  const equipmentFilters = buildPassthroughFilters(tradeFilters.result, "equipment_filters");

  const miscFilterIds = miscFilters.map((f) => f.id);
  const miscFilterIdsByCategory: Record<string, string[]> = {};
  for (const categoryId of Object.keys(CATEGORY_ITEM_CLASSES)) {
    miscFilterIdsByCategory[categoryId] = miscFilterIdsForCategory(miscFilterIds, categoryId);
  }

  const output: FiltersOutput = {
    generatedAt: new Date().toISOString(),
    leagues: tradeLeagues.result.map((l) => ({ id: l.id, text: l.text })),
    categories,
    stats,
    eligibility,
    itemNamesByCategory,
    itemFilters,
    reqFilters,
    reqFilterIdsByCategory,
    miscFilters,
    miscFilterIdsByCategory,
    equipmentFilters,
    equipmentFilterIdsByCategory,
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(output), "utf8");
  console.log(`wrote ${OUTPUT_PATH} (${categories.length} categories, ${stats.length} stats)`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
