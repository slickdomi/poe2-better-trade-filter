import { STATUS_OPTIONS, type BuyoutPriceValue, type StatusOption } from "../state/types";
import { readVersionedStore, writeVersionedStore, type VersionedStoreSpec } from "./versionedStore";

/**
 * User-configured defaults for the "Show sellers" status and buyout price
 * fields, saved independently of each other (and independently of the saved
 * queries in savedQueries.ts, which snapshot a whole search). Applied
 * whenever the app opens with no shared link in the URL — see App.tsx's
 * blank-slate branch.
 */

function isStatusOption(value: unknown): value is StatusOption {
  return typeof value === "string" && STATUS_OPTIONS.some((o) => o.id === value);
}

function isBuyoutPriceValue(value: unknown): value is BuyoutPriceValue {
  return !!value && typeof value === "object" && typeof (value as BuyoutPriceValue).currency === "string";
}

// See lib/versionedStore.ts for the migration convention these specs follow.
const STATUS_STORE: VersionedStoreSpec<StatusOption | null> = {
  key: "poe2-better-trade:default-status",
  currentVersion: 1,
  migrations: [],
  sanitize: (payload) => (isStatusOption(payload) ? payload : null),
};

const BUYOUT_PRICE_STORE: VersionedStoreSpec<BuyoutPriceValue | null> = {
  key: "poe2-better-trade:default-buyout-price",
  currentVersion: 1,
  migrations: [],
  sanitize: (payload) => (isBuyoutPriceValue(payload) ? payload : null),
};

export function getDefaultStatus(): StatusOption | null {
  return readVersionedStore(STATUS_STORE);
}

export function setDefaultStatus(status: StatusOption) {
  writeVersionedStore(STATUS_STORE, status);
}

export function getDefaultBuyoutPrice(): BuyoutPriceValue | null {
  return readVersionedStore(BUYOUT_PRICE_STORE);
}

export function setDefaultBuyoutPrice(value: BuyoutPriceValue) {
  writeVersionedStore(BUYOUT_PRICE_STORE, value);
}
