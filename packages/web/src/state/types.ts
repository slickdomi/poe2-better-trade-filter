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

/**
 * Mirrors the trade API's stat-group boolean modes (these are literally the
 * wire values the API's own "type" field takes, confirmed against the trade
 * site's own stat-filter documentation and public trade-tool source):
 *  - "and": every filter must match — the always-present default section.
 *  - "not": none of the filters may match.
 *  - "count": at least/most N of the filters must match (the section's
 *    min/max), rather than requiring every one of them.
 *  - "if": each filter is optional, but if the item does have it, its value
 *    must still fall within that filter's own min/max.
 *  - "weight": a per-filter weighted sum must fall within the section's
 *    min/max — and each filter is *also* individually capped as though its
 *    own value alone made up the whole sum (the original, stricter version).
 *  - "weight2": same weighted-sum idea, without that individual cap — an
 *    item can pass on a strong single stat even if a lesser-weighted one
 *    would have failed alone.
 */
export type StatSectionType = "and" | "count" | "weight" | "weight2" | "not" | "if";

export type Step =
  | { kind: "category"; categoryId: string }
  | { kind: "stat"; statId: string; sectionId?: string; min?: number; max?: number; weight?: number }
  | { kind: "statSection"; sectionId: string; type: StatSectionType; min?: number; max?: number }
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

/**
 * Everything needed to reproduce a search exactly — the same bundle used by
 * both a saved query (see `SavedQuery`, which extends this with an id/name)
 * and a shareable link (see `lib/shareUrl.ts`).
 */
export interface QuerySnapshot {
  league: string;
  status: StatusOption;
  buyoutPrice: BuyoutPriceValue;
  enforceAffixCap: boolean;
  steps: Step[];
}
