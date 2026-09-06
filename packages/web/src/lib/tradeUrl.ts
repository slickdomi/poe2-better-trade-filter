import type { DerivedState } from "../state/derive";
import type { BuyoutPriceValue, MiscFilterGroup, StatusOption } from "../state/types";
import { gzipBase64Url } from "./gzipBase64";

const TRADE_GROUP_KEY: Record<MiscFilterGroup, string> = {
  itemFilters: "type_filters",
  equipmentFilters: "equipment_filters",
  reqFilters: "req_filters",
  miscFilters: "misc_filters",
};

/**
 * Our `StatSectionType` values are deliberately the trade API's own literal
 * "type" strings (confirmed against the trade site's stat-filter
 * documentation and the query-building code of public trade tools —
 * awakened-poe-trade, PoE_Weighted_Search — not a decoded share link like
 * the rest of this file, since these boxes aren't reachable from the
 * default query this app starts with), so no translation table is needed
 * here — the internal type is sent through as-is.
 */
const WEIGHTED_TYPES = new Set<DerivedState["statSections"][number]["type"]>(["weight", "weight2"]);

function buildStatGroups(derived: DerivedState) {
  return derived.statSections
    .filter((section) => section.isDefault || section.stats.length > 0)
    .map((section) => {
      const isWeighted = WEIGHTED_TYPES.has(section.type);
      const filters = section.stats.map((s) => {
        const value: { min?: number; max?: number; weight?: number } = {};
        if (s.min !== undefined) value.min = s.min;
        if (s.max !== undefined) value.max = s.max;
        if (isWeighted && s.weight !== undefined) value.weight = s.weight;
        return { id: s.statId, ...(Object.keys(value).length > 0 ? { value } : {}) };
      });

      const group: Record<string, unknown> = { type: section.type, filters };
      if (section.type === "count" || isWeighted) {
        const value: { min?: number; max?: number } = {};
        if (section.min !== undefined) value.min = section.min;
        if (section.max !== undefined) value.max = section.max;
        group.value = value;
      }
      return group;
    });
}

/**
 * The official trade site encodes an entire search directly in the URL path
 * as base64url(gzip(JSON)) — confirmed by decoding a real
 * pathofexile.com/trade2/search/poe2/{league}/{blob} link:
 * gunzip(base64url-decode(blob)) yields exactly the query object below
 * (status/stats/filters, no wrapping, no server-issued search id). That
 * means the redirect can be built entirely client-side, no backend needed.
 *
 * `MiscFilterValue` (`{option}` or `{min,max}`) is deliberately stored in
 * the same shape the trade API expects for a filter's `value`, so each
 * chosen misc/equipment/req filter can be assigned straight through below.
 */
export function buildTradeQueryPayload(
  derived: DerivedState,
  status: StatusOption = "securable",
  buyoutPrice?: BuyoutPriceValue,
) {
  const filters: Record<string, { filters: Record<string, unknown> }> = {};

  for (const misc of derived.chosenMisc) {
    const groupKey = TRADE_GROUP_KEY[misc.group];
    const group = (filters[groupKey] ??= { filters: {} });
    group.filters[misc.filterId] = misc.value;
  }

  if (derived.chosenCategory) {
    const typeFilters = (filters.type_filters ??= { filters: {} });
    typeFilters.filters.category = { option: derived.chosenCategory.id };
  }

  // A specific chosen currency (e.g. "Exalted or Divine Orbs") IS a real,
  // sendable filter on its own — confirmed against a real trade-site link
  // with a currency chosen and no amount, which encodes as bare
  // `{"option":"exalted_divine"}`, no min/max at all. Only the *default*
  // currency ("" — our combobox's own id for "Exalted Orb Equivalent",
  // trade-filters.json's `option.options[0].id: null` in the filter
  // *definition*) is truly a no-op with no amount attached, so the filter
  // is built whenever there's a real currency OR a bound, and the default
  // currency's `option` key is left out entirely rather than sent as
  // literal `null` — every other optional `option`-style filter this app
  // builds already follows that "omit rather than send null/empty" rule
  // (see MiscFilterPanel's OptionField, which calls onRemove instead of
  // ever storing an empty option).
  if (buyoutPrice && (buyoutPrice.currency || buyoutPrice.min !== undefined || buyoutPrice.max !== undefined)) {
    const tradeFilters = (filters.trade_filters ??= { filters: {} });
    tradeFilters.filters.price = {
      ...(buyoutPrice.currency ? { option: buyoutPrice.currency } : {}),
      ...(buyoutPrice.min !== undefined ? { min: buyoutPrice.min } : {}),
      ...(buyoutPrice.max !== undefined ? { max: buyoutPrice.max } : {}),
    };
  }

  const payload: Record<string, unknown> = {
    status: { option: status },
    stats: buildStatGroups(derived),
    filters,
  };
  if (derived.chosenItemName) payload.type = derived.chosenItemName;

  return payload;
}

export async function buildTradeUrl(
  league: string,
  derived: DerivedState,
  status: StatusOption = "securable",
  buyoutPrice?: BuyoutPriceValue,
): Promise<string> {
  const payload = buildTradeQueryPayload(derived, status, buyoutPrice);
  const encoded = await gzipBase64Url(JSON.stringify(payload));
  return `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent(league)}/${encoded}`;
}
