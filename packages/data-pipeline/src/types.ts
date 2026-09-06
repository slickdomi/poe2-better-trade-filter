export interface RepoeBaseItem {
  name: string;
  item_class: string;
  tags: string[];
  implicits: string[];
  requirements: { level: number; strength: number; dexterity: number; intelligence: number } | null;
  properties: Record<string, unknown> | null;
}

export type RepoeBaseItemsFile = Record<string, RepoeBaseItem>;

export interface RepoeMod {
  text: string;
  domain: string;
  generation_type: string;
  required_level: number;
  groups: string[];
  stats: { id: string; min: number; max: number }[];
}

export type RepoeModsFile = Record<string, RepoeMod>;

// entry.mods: generationType -> groupName -> modId -> requiredLevel
export interface RepoeModsByBaseEntry {
  bases: string[];
  mods: Record<string, Record<string, Record<string, number>>>;
  conditional_mods: unknown;
}

// category label -> tag-combo key (base.tags.join(",")) -> entry
export type RepoeModsByBaseFile = Record<string, Record<string, RepoeModsByBaseEntry>>;

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
  /** Which affix slot this stat's rollable mod pool occupies, when it has one (some stats are implicit/corrupted-only). */
  affixType?: "prefix" | "suffix";
}

export interface TradeStatGroup {
  id: string;
  label: string;
  entries: { id: string; text: string; type: string }[];
}

/** A trade-filters.json filter, passed through almost verbatim. */
export type FilterDef =
  | { id: string; text: string; minMax: true }
  | { id: string; text: string; options: { id: string; text: string }[] };

export interface RawFilterDef {
  id: string;
  text: string;
  minMax?: true;
  option?: { options: { id: string | null; text: string }[] };
}

export interface RawFilterGroup {
  id: string;
  filters: RawFilterDef[];
}

export interface FiltersOutput {
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
