export interface StatTier {
  tier: number;
  requiredLevel: number;
  min: number;
  max: number;
}

export interface StatTierGroup {
  source: string;
  tiers: StatTier[];
  /**
   * Present only when this source's tier ladder actually differs by item
   * type (e.g. a stat shared by an armour-only mod pool and an unrelated
   * weapon-only mod pool that happen to render with the same trade stat
   * id). When set, restrict display to a chosen category among these ids;
   * when absent, the group applies regardless of category.
   */
  categoryIds?: string[];
}

export interface TradeStatEntry {
  id: string;
  text: string;
  type: string;
  group: string;
  tierGroups?: StatTierGroup[];
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

/**
 * The trade site's seller-availability filter. Values are the literal
 * `status.option` strings the trade API expects — confirmed by decoding
 * real pathofexile.com/trade2 share links for each choice.
 */
export type StatusOption = "securable" | "available" | "online" | "onlineleague" | "any";

export const STATUS_OPTIONS: { id: StatusOption; label: string }[] = [
  { id: "securable", label: "Instant buyout" },
  { id: "available", label: "Instant buyout and in person" },
  { id: "online", label: "Online (in person)" },
  { id: "onlineleague", label: "Online in league (in person)" },
  { id: "any", label: "Any" },
];

/**
 * Currency ids for the trade site's Buyout Price filter (`trade_filters.price`),
 * taken from the official trade-filters.json. "" (real API id: null) is the
 * default "Exalted Orb Equivalent" normalization, not "no currency".
 */
export const PRICE_CURRENCY_OPTIONS: { id: string; text: string }[] = [
  { id: "", text: "Exalted Orb Equivalent" },
  { id: "exalted_divine", text: "Exalted or Divine Orbs" },
  { id: "aug", text: "Orb of Augmentation" },
  { id: "transmute", text: "Orb of Transmutation" },
  { id: "exalted", text: "Exalted Orb" },
  { id: "regal", text: "Regal Orb" },
  { id: "chaos", text: "Chaos Orb" },
  { id: "vaal", text: "Vaal Orb" },
  { id: "alch", text: "Orb of Alchemy" },
  { id: "divine", text: "Divine Orb" },
  { id: "annul", text: "Orb of Annulment" },
  { id: "mirror", text: "Mirror of Kalandra" },
];

export interface BuyoutPriceValue {
  currency: string;
  min?: number;
  max?: number;
}
