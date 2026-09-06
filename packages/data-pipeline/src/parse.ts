import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTradeStatIndex, normalizeRepoeText, normalizeTradeText, resolveTradeStatId } from "./matchStatIds.js";
import {
  buildResidualMods,
  collectCoveredModIds,
  eligibleModIdsForItemClasses,
  flattenModsByBase,
  residualEligibleModIds,
} from "./buildEligibility.js";
import { buildPassthroughFilters } from "./equipmentFilters.js";
import { buildItemNamesByCategory } from "./itemNames.js";
import { CATEGORY_ITEM_CLASSES } from "./categoryItemClasses.js";
import { loadPoe2dbGenesisTreeStatIds } from "./poe2db/loadPoe2dbEligibility.js";
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
  StatTierGroup,
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
 * The same trade stat can be reachable from more than one independent mod
 * pool — a normal prefix/suffix roll, a corrupted-implicit addition, a base
 * implicit — each with its own tier ladder (compare the official site's
 * "Base Prefix/Suffix" vs "Corrupted" vs "Implicit" sections on a stat's
 * tooltip). Group by source first, then within each source apply the same
 * "most common RePoE mod `group`" dedupe as before, since a single source
 * can still contain unrelated pools that happen to share a generation_type.
 */
const SOURCE_ORDER = ["Base", "Implicit", "Corrupted", "Desecrated", "Essence", "Other"];

function sourceForMod(mod: RepoeMod): string {
  // domain "desecrated" mods (Abyssal Lich boss mods) are still ordinary
  // generation_type prefix/suffix rolls, but trade tracks them under their
  // own separate desecrated.stat_XXX id space (like fractured.stat_XXX) —
  // checked directly against a live pull rather than assumed. Route them
  // out before the generation_type switch so they never get merged into
  // the plain "Base" ladder.
  if (mod.domain === "desecrated") return "Desecrated";
  if (mod.generation_type === "essence") return "Essence";
  switch (mod.generation_type) {
    case "prefix":
    case "suffix":
      return "Base";
    case "corrupted":
      return "Corrupted";
    case "implicit":
      return "Implicit";
    default:
      return "Other";
  }
}

function buildTiersForGroup(mods: RepoeMod[]) {
  const counts = new Map<string, number>();
  for (const m of mods) counts.set(m.groups[0] ?? "", (counts.get(m.groups[0] ?? "") ?? 0) + 1);
  const [dominantGroup] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const filtered = mods.filter((m) => (m.groups[0] ?? "") === dominantGroup);

  const sorted = [...filtered].sort((a, b) => a.required_level - b.required_level);
  return {
    tiers: sorted.map((m, i) => ({
      tier: sorted.length - i,
      requiredLevel: m.required_level,
      min: m.stats[0].min,
      max: m.stats[0].max,
    })),
    generationType: filtered[0]?.generation_type,
  };
}

interface TierInfo {
  tierGroups: StatTierGroup[];
  affixType?: "prefix" | "suffix";
}

/**
 * Some trade stats are a single displayed id/text shared by more than one
 * unrelated RePoE mod pool — e.g. "+# to Level of all Minion Skills" is a
 * 3-tier armour-only ladder (max +3) AND a completely separate 5-tier
 * weapon-only ladder (max +5), which happen to share the same mod `groups[0]`
 * (so `buildTiersForGroup`'s own dedupe can't tell them apart) and the same
 * trade stat id (so naively merging every matching mod produces a
 * Frankenstein ladder no single item can actually roll — e.g. showing a
 * Helmet a req-level-78 weapon-only tier). `modIdsByCategory` (every
 * category's own eligible mod ids for this stat) lets us split a source's
 * mods into the distinct subsets different categories actually resolve to,
 * so each subset gets its own tier ladder scoped to just those categories.
 */
function buildTierGroups(modsForStat: Map<string, RepoeMod>, modIdsByCategory: Map<string, Set<string>>): TierInfo {
  const modIdsBySource = new Map<string, string[]>();
  for (const [modId, mod] of modsForStat) {
    const source = sourceForMod(mod);
    const list = modIdsBySource.get(source);
    if (list) list.push(modId);
    else modIdsBySource.set(source, [modId]);
  }

  const tierGroups: StatTierGroup[] = [];
  let affixType: "prefix" | "suffix" | undefined;

  function addGroup(source: string, modIds: string[], categoryIds?: string[]) {
    const { tiers, generationType } = buildTiersForGroup(modIds.map((id) => modsForStat.get(id)!));
    tierGroups.push({ source, tiers, ...(categoryIds ? { categoryIds } : {}) });
    // Desecrated mods still occupy a normal prefix/suffix slot (they just
    // come from a different source), so they count toward the 3/3 cap too.
    if ((source === "Base" || source === "Desecrated") && (generationType === "prefix" || generationType === "suffix")) {
      affixType = generationType;
    }
  }

  for (const [source, modIdsForSource] of modIdsBySource) {
    const sourceModIdSet = new Set(modIdsForSource);
    // Distinct subsets of this source's mods that different categories
    // resolve to — same subset key across categories means one shared
    // ladder; different keys mean genuinely different pools worth splitting.
    const subsetKeyToModIds = new Map<string, string[]>();
    const subsetKeyToCategories = new Map<string, string[]>();
    for (const [categoryId, catModIds] of modIdsByCategory) {
      const relevant = modIdsForSource.filter((id) => catModIds.has(id));
      if (relevant.length === 0) continue;
      const key = [...relevant].sort().join(",");
      if (!subsetKeyToModIds.has(key)) subsetKeyToModIds.set(key, relevant);
      const list = subsetKeyToCategories.get(key);
      if (list) list.push(categoryId);
      else subsetKeyToCategories.set(key, [categoryId]);
    }

    if (subsetKeyToModIds.size <= 1) {
      // No category-level split needed — either every category resolving
      // to this source shares the same mods, or this source isn't
      // category-tracked at all (untouched by the loop above, e.g. because
      // it only reached statCategoryModIds via a path that doesn't track
      // per-category — falls back to the full, un-split source pool).
      addGroup(source, [...sourceModIdSet]);
    } else {
      for (const [key, modIds] of subsetKeyToModIds) {
        addGroup(source, modIds, subsetKeyToCategories.get(key)!.sort());
      }
    }
  }
  tierGroups.sort((a, b) => SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source));

  return { tierGroups, affixType };
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

  // Mods mods_by_base.json has no entry for at all (e.g. domain "desecrated")
  // — matched instead via their own spawn_weights against each category's
  // bases. See residualEligibleModIds' doc comment for exactly what this
  // does and doesn't recover.
  const coveredModIds = collectCoveredModIds(tagKeyToModIds);
  const residualMods = buildResidualMods(mods, coveredModIds);
  console.log(`residual (non-mods_by_base) mods considered via spawn_weights: ${residualMods.length}`);

  // Genesis Tree / Otherworldly mods (rings/belts/etc. dropping pre-rolled
  // with normally-restricted mods): resolved from poe2db's scraped page
  // data, not RePoE's own spawn_weights tag — see loadPoe2dbEligibility.ts.
  const poe2dbGenesisStatIds = await loadPoe2dbGenesisTreeStatIds(RAW_CACHE_DIR, statIndex);
  console.log(`poe2db genesis-tree item classes with data: ${poe2dbGenesisStatIds.size}`);

  const categoryOptionText = new Map<string, string>();
  const typeFilters = tradeFilters.result.find((g) => g.id === "type_filters");
  const categoryFilter = typeFilters?.filters.find((f) => f.id === "category");
  for (const option of categoryFilter?.option?.options ?? []) {
    if (option.id) categoryOptionText.set(option.id, option.text);
  }

  const usedStatIds = new Set<string>();
  // The mod pool behind a stat is mostly shared across every category that
  // resolves to it, so mods are deduped by modId globally here...
  const statIdToMods = new Map<string, Map<string, RepoeMod>>();
  // ...but a handful of stats are actually two+ unrelated item-type-specific
  // pools sharing one displayed id/text (see buildTierGroups' doc comment),
  // so this also tracks exactly which mod ids each individual category
  // resolves to, letting buildTierGroups split those cases back apart.
  const statCategoryModIds = new Map<string, Map<string, Set<string>>>();
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

    const modIds = new Set([
      ...eligibleModIdsForItemClasses(repoeClasses, baseItems, tagKeyToModIds),
      ...residualEligibleModIds(repoeClasses, baseItems, residualMods),
    ]);
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
      const normalized = normalizeRepoeText(mod.text, mod.stats[0].min, mod.stats[0].max);
      const resolved = resolveTradeStatId(statIndex, bucketOrder, normalized);
      if (resolved) {
        statIds.add(resolved.id);
        usedStatIds.add(resolved.id);
        matched++;
        // Collected per pool (Base/Corrupted/Implicit) in buildTierGroups
        // below, not merged — each gets its own independent ladder.
        let modsForStat = statIdToMods.get(resolved.id);
        if (!modsForStat) {
          modsForStat = new Map();
          statIdToMods.set(resolved.id, modsForStat);
        }
        modsForStat.set(modId, mod);

        let modIdsByCategory = statCategoryModIds.get(resolved.id);
        if (!modIdsByCategory) {
          modIdsByCategory = new Map();
          statCategoryModIds.set(resolved.id, modIdsByCategory);
        }
        let categoryModIdSet = modIdsByCategory.get(categoryId);
        if (!categoryModIdSet) {
          categoryModIdSet = new Set();
          modIdsByCategory.set(categoryId, categoryModIdSet);
        }
        categoryModIdSet.add(modId);
      } else {
        unmatched++;
      }
    }

    // Genesis Tree / Otherworldly: union in poe2db's page-confirmed stat
    // ids for every item class this category maps to.
    for (const itemClass of repoeClasses) {
      const poe2dbIds = poe2dbGenesisStatIds.get(itemClass);
      if (!poe2dbIds) continue;
      for (const id of poe2dbIds) {
        statIds.add(id);
        usedStatIds.add(id);
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
        const { tierGroups, affixType } = modsForStat
          ? buildTierGroups(modsForStat, statCategoryModIds.get(e.id) ?? new Map())
          : { tierGroups: [], affixType: undefined };
        return {
          id: e.id,
          text: e.text,
          type: e.type,
          group: g.label,
          tierGroups: tierGroups.length > 0 ? tierGroups : undefined,
          affixType,
        };
      }),
  );

  // Desecrated mods already have their own tierGroup (via sourceForMod
  // above), built from their own mod entries — so unlike Fractured, this
  // doesn't reuse another group's tiers, it just relocates the group that's
  // already there onto its own separate desecrated.stat_XXX entry (trade
  // tracks these with a distinct id, same as fractured).
  const desecratedBucket = statIndex.get("desecrated");
  const desecratedAdditionsByCategory: Record<string, string[]> = {};
  for (const stat of [...stats]) {
    if (!stat.tierGroups) continue;
    // Almost always exactly one, but split like "Base" can be (see
    // buildTierGroups), so pull every "Desecrated" group, not just the first.
    const desecratedGroups = stat.tierGroups.filter((g) => g.source === "Desecrated");
    if (desecratedGroups.length === 0) continue;
    stat.tierGroups = stat.tierGroups.filter((g) => g.source !== "Desecrated");
    if (stat.tierGroups.length === 0) stat.tierGroups = undefined;

    const desecratedEntry = desecratedBucket?.get(normalizeTradeText(stat.text));
    if (!desecratedEntry) continue;

    stats.push({
      id: desecratedEntry.id,
      text: desecratedEntry.text,
      type: desecratedEntry.type,
      group: "Desecrated",
      tierGroups: desecratedGroups,
      affixType: stat.affixType,
    });
    for (const [categoryId, ids] of Object.entries(eligibility)) {
      if (ids.includes(stat.id)) {
        (desecratedAdditionsByCategory[categoryId] ??= []).push(desecratedEntry.id);
      }
    }
  }
  for (const [categoryId, ids] of Object.entries(desecratedAdditionsByCategory)) {
    eligibility[categoryId] = [...eligibility[categoryId], ...ids].sort();
  }

  // Fracturing doesn't change a mod's roll — it just locks whichever value
  // an already-rolled Base affix has — so any stat with a "Base" pool that
  // also has a same-worded entry in trade's separate `fractured` stat group
  // gets exposed as its own selectable "Fractured" variant, reusing the
  // Base tier ladder and eligible everywhere the Base version is.
  const fracturedBucket = statIndex.get("fractured");
  const fracturedAdditionsByCategory: Record<string, string[]> = {};
  for (const stat of [...stats]) {
    // A stat's "Base" pool can itself be split into item-type-scoped
    // variants (see buildTierGroups) — carry every variant over, each still
    // scoped to the same categoryIds, so Fractured doesn't collapse them.
    const baseGroups = stat.tierGroups?.filter((g) => g.source === "Base") ?? [];
    if (baseGroups.length === 0) continue;
    const fracturedEntry = fracturedBucket?.get(normalizeTradeText(stat.text));
    if (!fracturedEntry) continue;

    stats.push({
      id: fracturedEntry.id,
      text: fracturedEntry.text,
      type: fracturedEntry.type,
      group: "Fractured",
      tierGroups: baseGroups.map((g) => ({
        source: "Fractured",
        tiers: g.tiers,
        ...(g.categoryIds ? { categoryIds: g.categoryIds } : {}),
      })),
      affixType: stat.affixType,
    });
    for (const [categoryId, ids] of Object.entries(eligibility)) {
      if (ids.includes(stat.id)) {
        (fracturedAdditionsByCategory[categoryId] ??= []).push(fracturedEntry.id);
      }
    }
  }
  for (const [categoryId, ids] of Object.entries(fracturedAdditionsByCategory)) {
    eligibility[categoryId] = [...eligibility[categoryId], ...ids].sort();
  }

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
