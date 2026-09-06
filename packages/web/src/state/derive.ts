import type { FilterDef, FiltersData, MiscFilterGroup, MiscFilterValue, Step, TradeStatEntry } from "./types";

// Plain (bare) modifiers first, source-restricted variants after — rather
// than alphabetical, which would put "Desecrated"/"Fractured" ahead of
// "Explicit"/"Implicit".
const GROUP_DISPLAY_ORDER = ["Explicit", "Implicit", "Fractured", "Desecrated"];

function groupSortIndex(group: string): number {
  const index = GROUP_DISPLAY_ORDER.indexOf(group);
  return index === -1 ? GROUP_DISPLAY_ORDER.length : index;
}

export interface DerivedStatFilter {
  statId: string;
  text: string;
  group: string;
  tierGroups?: TradeStatEntry["tierGroups"];
  affixType?: TradeStatEntry["affixType"];
  min?: number;
  max?: number;
}

export interface DeriveOptions {
  /** Rare items are capped at 3 prefixes and 3 suffixes — hide stats that would exceed whichever cap is already full. */
  enforceAffixCap: boolean;
}

export interface DerivedMiscFilter {
  group: MiscFilterGroup;
  filterId: string;
  def: FilterDef;
  value: MiscFilterValue;
}

export interface DerivedState {
  chosenCategory?: { id: string; text: string };
  /** Categories still possible given whatever stats/misc filters are chosen so far. */
  availableCategories: { id: string; text: string }[];
  availableStats: TradeStatEntry[];
  chosenStats: DerivedStatFilter[];
  chosenItemName?: string;
  availableItemNames: string[];
  relevantReqFilters: FilterDef[];
  relevantEquipmentFilters: FilterDef[];
  relevantMiscFilters: FilterDef[];
  chosenMisc: DerivedMiscFilter[];
  prefixCount: number;
  suffixCount: number;
}

/**
 * Categories still compatible with the current selection each carry their
 * own list of applicable filter ids (computed in the data pipeline from
 * RePoE base-item data — e.g. a Ring never gets `str`/`ar`/`damage`, only a
 * Crossbow gets `reload_time`). Union across compatible categories so the
 * panel only tightens once a category is locked in or narrowed by stats,
 * same as `availableStats`.
 */
function narrowFilters(
  defs: FilterDef[],
  idsByCategory: Record<string, string[]>,
  categories: { id: string }[],
): FilterDef[] {
  const defsById = new Map(defs.map((d) => [d.id, d]));
  const relevantIds = new Set(categories.flatMap((c) => idsByCategory[c.id] ?? []));
  return [...relevantIds].map((id) => defsById.get(id)).filter((d): d is FilterDef => d !== undefined);
}

/**
 * Pure projection of the append-only `steps` list into what the UI needs.
 * Undo is just "drop the last step" (or slice to an earlier index) — this
 * function is re-run from scratch each time, so there's no separate history
 * bookkeeping to keep in sync.
 *
 * Steps are order-agnostic: a stat can be chosen before any category, in
 * which case `compatibleCategories` narrows to whichever categories can
 * still produce every chosen stat, and `availableStats` is the union of
 * those categories' eligible stats — so adding stats alone still narrows
 * what can be added next, without ever requiring a category to be locked
 * first.
 */
export function deriveState(steps: Step[], data: FiltersData, options: DeriveOptions): DerivedState {
  const statsById = new Map(data.stats.map((s) => [s.id, s]));

  const categoryStep = steps.find((s): s is Step & { kind: "category" } => s.kind === "category");
  const chosenCategory = categoryStep
    ? data.categories.find((c) => c.id === categoryStep.categoryId)
    : undefined;

  const chosenStatIds = steps
    .filter((s): s is Step & { kind: "stat" } => s.kind === "stat")
    .map((s) => s.statId);

  const compatibleCategories = chosenCategory
    ? [chosenCategory]
    : data.categories.filter((c) => {
        const eligible = data.eligibility[c.id] ?? [];
        return chosenStatIds.every((id) => eligible.includes(id));
      });

  const chosenStats: DerivedStatFilter[] = steps
    .filter((s): s is Step & { kind: "stat" } => s.kind === "stat")
    .map((s) => {
      const stat = statsById.get(s.statId);
      return {
        statId: s.statId,
        text: stat?.text ?? s.statId,
        group: stat?.group ?? "",
        tierGroups: stat?.tierGroups,
        affixType: stat?.affixType,
        min: s.min,
        max: s.max,
      };
    });

  const prefixCount = chosenStats.filter((s) => s.affixType === "prefix").length;
  const suffixCount = chosenStats.filter((s) => s.affixType === "suffix").length;

  const chosenStatIdSet = new Set(chosenStatIds);
  const eligibleStatIdUnion = new Set(compatibleCategories.flatMap((c) => data.eligibility[c.id] ?? []));
  const availableStats = [...eligibleStatIdUnion]
    .filter((id) => !chosenStatIdSet.has(id))
    .map((id) => statsById.get(id))
    .filter((s): s is TradeStatEntry => s !== undefined)
    .filter((s) => {
      if (!options.enforceAffixCap) return true;
      if (s.affixType === "prefix") return prefixCount < 3;
      if (s.affixType === "suffix") return suffixCount < 3;
      return true;
    })
    .sort((a, b) => groupSortIndex(a.group) - groupSortIndex(b.group) || a.text.localeCompare(b.text));

  const itemNameStep = steps.find((s): s is Step & { kind: "itemName" } => s.kind === "itemName");
  const availableItemNames = chosenCategory ? (data.itemNamesByCategory[chosenCategory.id] ?? []) : [];

  const relevantReqFilters = narrowFilters(data.reqFilters, data.reqFilterIdsByCategory, compatibleCategories);
  const relevantEquipmentFilters = narrowFilters(
    data.equipmentFilters,
    data.equipmentFilterIdsByCategory,
    compatibleCategories,
  );
  const relevantMiscFilters = narrowFilters(data.miscFilters, data.miscFilterIdsByCategory, compatibleCategories);

  const miscDefsById = new Map<string, FilterDef>();
  for (const def of [...data.itemFilters, ...data.reqFilters, ...data.miscFilters, ...data.equipmentFilters]) {
    miscDefsById.set(def.id, def);
  }
  const chosenMisc: DerivedMiscFilter[] = steps
    .filter((s): s is Step & { kind: "misc" } => s.kind === "misc")
    .map((s) => ({ group: s.group, filterId: s.filterId, def: miscDefsById.get(s.filterId)!, value: s.value }))
    .filter((m) => m.def !== undefined);

  return {
    chosenCategory,
    availableCategories: compatibleCategories,
    availableStats,
    chosenStats,
    chosenItemName: itemNameStep?.name,
    availableItemNames,
    relevantReqFilters,
    relevantEquipmentFilters,
    relevantMiscFilters,
    chosenMisc,
    prefixCount,
    suffixCount,
  };
}
