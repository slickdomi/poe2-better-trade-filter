import type { DerivedState } from "../state/derive";
import type { BuyoutPriceValue, MiscFilterGroup, StatusOption } from "../state/types";

const TRADE_GROUP_KEY: Record<MiscFilterGroup, string> = {
  itemFilters: "type_filters",
  equipmentFilters: "equipment_filters",
  reqFilters: "req_filters",
  miscFilters: "misc_filters",
};

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

  // Currency alone doesn't constrain anything — only include the filter once a bound is set.
  if (buyoutPrice && (buyoutPrice.min !== undefined || buyoutPrice.max !== undefined)) {
    const tradeFilters = (filters.trade_filters ??= { filters: {} });
    tradeFilters.filters.price = {
      option: buyoutPrice.currency || null,
      ...(buyoutPrice.min !== undefined ? { min: buyoutPrice.min } : {}),
      ...(buyoutPrice.max !== undefined ? { max: buyoutPrice.max } : {}),
    };
  }

  const payload: Record<string, unknown> = {
    status: { option: status },
    stats: [
      {
        type: "and",
        filters: derived.chosenStats.map((s) => {
          const value: { min?: number; max?: number } = {};
          if (s.min !== undefined) value.min = s.min;
          if (s.max !== undefined) value.max = s.max;
          return { id: s.statId, ...(Object.keys(value).length > 0 ? { value } : {}) };
        }),
      },
    ],
    filters,
  };
  if (derived.chosenItemName) payload.type = derived.chosenItemName;

  return payload;
}

async function gzipBase64Url(json: string): Promise<string> {
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  let binary = "";
  for (const byte of new Uint8Array(buf)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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
