import { describe, expect, it } from "vitest";
import { buildTradeQueryPayload } from "./tradeUrl";
import type { DerivedState } from "../state/derive";
import type { BuyoutPriceValue } from "../state/types";

function makeDerived(overrides: Partial<DerivedState> = {}): DerivedState {
  return {
    availableCategories: [],
    availableStats: [],
    chosenStats: [],
    statSections: [{ id: "default", type: "and", isDefault: true, stats: [] }],
    availableItemNames: [],
    relevantReqFilters: [],
    relevantEquipmentFilters: [],
    relevantMiscFilters: [],
    chosenMisc: [],
    prefixCount: 0,
    suffixCount: 0,
    ...overrides,
  };
}

describe("buildTradeQueryPayload — buyout price", () => {
  it("omits the price filter entirely when there's no currency and no bound (the untouched default state)", () => {
    const payload = buildTradeQueryPayload(makeDerived(), "securable", { currency: "" });
    expect(payload.filters as object).not.toHaveProperty("trade_filters");
  });

  // A specific currency is a real, sendable filter on its own — confirmed
  // against a real trade-site link with a currency chosen and no amount,
  // which encodes as bare `{"option":"exalted_divine"}`. Losing this case
  // (silently dropping a chosen currency just because no amount was typed)
  // was the actual bug reported and reproduced this session.
  it("includes the price filter for a chosen currency alone, with no min or max", () => {
    const payload = buildTradeQueryPayload(makeDerived(), "securable", { currency: "exalted_divine" });
    const filters = payload.filters as { trade_filters: { filters: { price: unknown } } };
    expect(filters.trade_filters.filters.price).toEqual({ option: "exalted_divine" });
  });

  it("omits the `option` key for the default currency ('' / Exalted Orb Equivalent), sending only min/max", () => {
    const buyoutPrice: BuyoutPriceValue = { currency: "", min: 5 };
    const payload = buildTradeQueryPayload(makeDerived(), "securable", buyoutPrice);
    const filters = payload.filters as { trade_filters: { filters: { price: unknown } } };
    expect(filters.trade_filters.filters.price).toEqual({ min: 5 });
  });

  it("includes an explicit `option` for a specific chosen currency", () => {
    const buyoutPrice: BuyoutPriceValue = { currency: "chaos", min: 5, max: 20 };
    const payload = buildTradeQueryPayload(makeDerived(), "securable", buyoutPrice);
    const filters = payload.filters as { trade_filters: { filters: { price: unknown } } };
    expect(filters.trade_filters.filters.price).toEqual({ option: "chaos", min: 5, max: 20 });
  });

  it("includes just a max with no min", () => {
    const buyoutPrice: BuyoutPriceValue = { currency: "", max: 100 };
    const payload = buildTradeQueryPayload(makeDerived(), "securable", buyoutPrice);
    const filters = payload.filters as { trade_filters: { filters: { price: unknown } } };
    expect(filters.trade_filters.filters.price).toEqual({ max: 100 });
  });
});

describe("buildTradeQueryPayload — other fields", () => {
  it("carries the chosen status option through", () => {
    const payload = buildTradeQueryPayload(makeDerived(), "any");
    expect(payload.status).toEqual({ option: "any" });
  });

  it("translates the chosen category into type_filters.category", () => {
    const payload = buildTradeQueryPayload(makeDerived({ chosenCategory: { id: "weapon.onemace", text: "One-Handed Mace" } }));
    const filters = payload.filters as { type_filters: { filters: { category: unknown } } };
    expect(filters.type_filters.filters.category).toEqual({ option: "weapon.onemace" });
  });

  it("carries the chosen item name through as `type`", () => {
    const payload = buildTradeQueryPayload(makeDerived({ chosenItemName: "Leaden Greathammer" }));
    expect(payload.type).toBe("Leaden Greathammer");
  });
});
