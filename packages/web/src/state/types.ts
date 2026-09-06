export interface StatTier {
  tier: number;
  requiredLevel: number;
  min: number;
  max: number;
}

export interface TradeStatEntry {
  id: string;
  text: string;
  type: string;
  group: string;
  tiers?: StatTier[];
  affixType?: "prefix" | "suffix";
}

export type FilterDef =
  | { id: string; text: string; minMax: true }
  | { id: string; text: string; options: { id: string; text: string }[] };

export interface FiltersData {
  generatedAt: string;
  leagues: { id: string; text: string }[];
  categories: { id: string; text: string }[];
  stats: TradeStatEntry[];
  eligibility: Record<string, string[]>;
  itemNamesByCategory: Record<string, string[]>;
  itemFilters: FilterDef[];
  reqFilters: FilterDef[];
  reqFilterIdsByCategory: Record<string, string[]>;
  miscFilters: FilterDef[];
  miscFilterIdsByCategory: Record<string, string[]>;
  equipmentFilters: FilterDef[];
  equipmentFilterIdsByCategory: Record<string, string[]>;
}

export type MiscFilterGroup = "itemFilters" | "equipmentFilters" | "reqFilters" | "miscFilters";
export type MiscFilterValue = { option: string } | { min?: number; max?: number };

export type Step =
  | { kind: "category"; categoryId: string }
  | { kind: "stat"; statId: string; min?: number; max?: number }
  | { kind: "itemName"; name: string }
  | { kind: "misc"; group: MiscFilterGroup; filterId: string; value: MiscFilterValue };
