import type {
  FilterDef,
  FiltersData,
  MiscFilterGroup,
  MiscFilterValue,
  StatSectionType,
  StatTierGroup,
  Step,
  TradeStatEntry,
} from "./types";

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
  sectionId: string;
  weight?: number;
  /** Only ever rolls on Unique items — not part of the normal weighted-affix pool, so it doesn't count toward the 3/3 affix cap either. */
  isUniqueOnly: boolean;
}

/** An available-to-add modifier, same as a chosen one but without range/section/weight (those only exist once actually added). */
export interface DerivedAvailableStat extends TradeStatEntry {
  isUniqueOnly: boolean;
}

/** Every query has this implicit "all filters must match" section; it can't be renamed, retyped, or removed. */
export const DEFAULT_SECTION_ID = "default";

export interface DerivedStatSection {
  id: string;
  type: StatSectionType;
  isDefault: boolean;
  min?: number;
  max?: number;
  stats: DerivedStatFilter[];
}

export interface DeriveOptions {
  /** Rare items are capped at 3 prefixes and 3 suffixes — hide stats that would exceed whichever cap is already full. */
  enforceAffixCap: boolean;
  /** Off by default: Unique-only mods aren't rollable on a normal rare/magic item, so they'd otherwise just be noise in the modifier search. */
  includeUniqueMods: boolean;
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
  availableStats: DerivedAvailableStat[];
  chosenStats: DerivedStatFilter[];
  statSections: DerivedStatSection[];
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
 * Some stats' "Base" (or "Desecrated") tier ladder is really two-plus
 * unrelated item-type-specific mod pools sharing one displayed stat (e.g.
 * "+# to Level of all Minion Skills" is a separate, smaller-max armour pool
 * and a separate, larger-max weapon pool) — those groups carry a
 * `categoryIds` restriction from the data pipeline. Drop any group whose
 * restriction doesn't overlap what's still possible, so e.g. a chosen
 * Helmet only ever sees its own ladder, never a Weapon-only one.
 */
function relevantTierGroups(
  tierGroups: StatTierGroup[] | undefined,
  possibleCategoryIds: Set<string>,
): StatTierGroup[] | undefined {
  if (!tierGroups) return undefined;
  const filtered = tierGroups.filter(
    (g) => !g.categoryIds || g.categoryIds.some((id) => possibleCategoryIds.has(id)),
  );
  return filtered.length > 0 ? filtered : undefined;
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
        // Union with uniqueEligibility regardless of the "show unique
        // modifiers" toggle — that only controls what's *offered* going
        // forward, not whether an already-chosen unique-only stat (like
        // "# Intelligence Requirement", which never appears in the normal
        // per-category pool by design) still counts as compatible with a
        // category here.
        const eligible = data.eligibility[c.id] ?? [];
        const uniqueEligible = data.uniqueEligibility[c.id] ?? [];
        return chosenStatIds.every((id) => eligible.includes(id) || uniqueEligible.includes(id));
      });
  const possibleCategoryIds = new Set(compatibleCategories.map((c) => c.id));
  // Computed regardless of the "show unique modifiers" toggle: an already-chosen
  // unique-only stat still needs its badge even if the toggle is later switched
  // off, and it's cheap either way.
  const uniqueStatIdUnion = new Set(compatibleCategories.flatMap((c) => data.uniqueEligibility[c.id] ?? []));

  const sectionSteps = steps.filter((s): s is Step & { kind: "statSection" } => s.kind === "statSection");
  const sectionIdSet = new Set(sectionSteps.map((s) => s.sectionId));

  const chosenStats: DerivedStatFilter[] = steps
    .filter((s): s is Step & { kind: "stat" } => s.kind === "stat")
    .map((s) => {
      const stat = statsById.get(s.statId);
      // A section reference can go stale if its defining step was removed — fall back to the default section rather than dropping the stat.
      const sectionId = s.sectionId && sectionIdSet.has(s.sectionId) ? s.sectionId : DEFAULT_SECTION_ID;
      return {
        statId: s.statId,
        text: stat?.text ?? s.statId,
        group: stat?.group ?? "",
        tierGroups: relevantTierGroups(stat?.tierGroups, possibleCategoryIds),
        affixType: stat?.affixType,
        min: s.min,
        max: s.max,
        sectionId,
        weight: s.weight,
        isUniqueOnly: uniqueStatIdUnion.has(s.statId),
      };
    });

  const statSections: DerivedStatSection[] = [
    { id: DEFAULT_SECTION_ID, type: "and", isDefault: true, stats: [] },
    ...sectionSteps.map((s) => ({
      id: s.sectionId,
      type: s.type,
      isDefault: false,
      min: s.min,
      max: s.max,
      stats: [] as DerivedStatFilter[],
    })),
  ];
  const sectionById = new Map(statSections.map((sec) => [sec.id, sec]));
  for (const stat of chosenStats) {
    sectionById.get(stat.sectionId)!.stats.push(stat);
  }

  // Only the default (AND) group represents mods actually rolled on the item at
  // once — a stat parked in a Count/Not/If/Weighted group isn't necessarily
  // simultaneously present, so it shouldn't count against the 3/3 affix cap.
  const defaultGroupStats = chosenStats.filter((s) => s.sectionId === DEFAULT_SECTION_ID);
  const prefixCount = defaultGroupStats.filter((s) => s.affixType === "prefix").length;
  const suffixCount = defaultGroupStats.filter((s) => s.affixType === "suffix").length;

  const chosenStatIdSet = new Set(chosenStatIds);
  const itemNameStep = steps.find((s): s is Step & { kind: "itemName" } => s.kind === "itemName");
  const chosenItemName = itemNameStep?.name;

  /**
   * Most categories' base items all share one mod pool, so this is just the
   * category's own list. A handful (currently only Tablets) actually cover
   * several disjoint pools under one trade category with no per-type
   * sub-category to filter on — e.g. Breach and Ritual Tablets share the
   * "Tablet" category but can't roll each other's mods. For those, narrow
   * to whichever base names could still produce every stat chosen so far
   * (or to the explicitly chosen one), the same way `compatibleCategories`
   * narrows by category — so picking a Breach-only modifier makes every
   * other available modifier Breach-compatible too, without needing a real
   * trade-API category for "Breach Tablet".
   */
  let eligibleStatIdUnion: Set<string>;
  let availableItemNames: string[];
  if (compatibleCategories.length === 1) {
    const categoryId = compatibleCategories[0].id;
    const candidateNames = data.itemNamesByCategory[categoryId] ?? [];
    const namesWithData = candidateNames.filter((n) => data.eligibilityByItemName[n]);
    if (namesWithData.length > 0) {
      const compatibleNames = candidateNames.filter((n) => {
        if (chosenItemName) return n === chosenItemName;
        const eligible = data.eligibilityByItemName[n];
        return !eligible || chosenStatIds.every((id) => eligible.includes(id));
      });
      eligibleStatIdUnion = new Set(
        compatibleNames.flatMap((n) => data.eligibilityByItemName[n] ?? data.eligibility[categoryId] ?? []),
      );
      availableItemNames = compatibleNames;
    } else {
      eligibleStatIdUnion = new Set(data.eligibility[categoryId] ?? []);
      availableItemNames = candidateNames;
    }
  } else {
    eligibleStatIdUnion = new Set(compatibleCategories.flatMap((c) => data.eligibility[c.id] ?? []));
    availableItemNames = [];
  }
  if (options.includeUniqueMods) {
    for (const id of uniqueStatIdUnion) eligibleStatIdUnion.add(id);
  }

  const availableStats: DerivedAvailableStat[] = [...eligibleStatIdUnion]
    .filter((id) => !chosenStatIdSet.has(id))
    .map((id) => statsById.get(id))
    .filter((s): s is TradeStatEntry => s !== undefined)
    .filter((s) => {
      if (!options.enforceAffixCap) return true;
      if (s.affixType === "prefix") return prefixCount < 3;
      if (s.affixType === "suffix") return suffixCount < 3;
      return true;
    })
    .map((s) => ({ ...s, isUniqueOnly: uniqueStatIdUnion.has(s.id) }))
    .sort((a, b) => groupSortIndex(a.group) - groupSortIndex(b.group) || a.text.localeCompare(b.text));

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
    statSections,
    chosenItemName,
    availableItemNames,
    relevantReqFilters,
    relevantEquipmentFilters,
    relevantMiscFilters,
    chosenMisc,
    prefixCount,
    suffixCount,
  };
}
