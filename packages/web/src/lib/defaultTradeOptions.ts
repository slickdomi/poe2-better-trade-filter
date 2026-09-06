import { STATUS_OPTIONS, type BuyoutPriceValue, type StatusOption } from "../state/types";

/**
 * User-configured defaults for the "Show sellers" status and buyout price
 * fields, saved independently of each other (and independently of the saved
 * queries in savedQueries.ts, which snapshot a whole search). Applied
 * whenever the app opens with no shared link in the URL — see App.tsx's
 * blank-slate branch.
 */
const STATUS_KEY = "poe2-better-trade:default-status";
const BUYOUT_PRICE_KEY = "poe2-better-trade:default-buyout-price";

function isStatusOption(value: unknown): value is StatusOption {
  return typeof value === "string" && STATUS_OPTIONS.some((o) => o.id === value);
}

function isBuyoutPriceValue(value: unknown): value is BuyoutPriceValue {
  return !!value && typeof value === "object" && typeof (value as BuyoutPriceValue).currency === "string";
}

export function getDefaultStatus(): StatusOption | null {
  try {
    const raw = localStorage.getItem(STATUS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStatusOption(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function setDefaultStatus(status: StatusOption) {
  try {
    localStorage.setItem(STATUS_KEY, JSON.stringify(status));
  } catch {
    // localStorage unavailable (private mode, quota, etc.) — best-effort.
  }
}

export function getDefaultBuyoutPrice(): BuyoutPriceValue | null {
  try {
    const raw = localStorage.getItem(BUYOUT_PRICE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isBuyoutPriceValue(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function setDefaultBuyoutPrice(value: BuyoutPriceValue) {
  try {
    localStorage.setItem(BUYOUT_PRICE_KEY, JSON.stringify(value));
  } catch {
    // localStorage unavailable (private mode, quota, etc.) — best-effort.
  }
}
