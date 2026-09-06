import type { QuerySnapshot, Step } from "../state/types";
import { gunzipBase64Url, gzipBase64Url } from "./gzipBase64";

/**
 * Doesn't need to match the trade site's own query format (that's what
 * `tradeUrl.ts` is for) — this only has to round-trip our own app state, so
 * it's just a `QuerySnapshot` gzipped and base64url-encoded the same way,
 * carried in a query param rather than the path.
 */
const PARAM_NAME = "f";

export async function buildShareUrl(snapshot: QuerySnapshot): Promise<string> {
  const encoded = await gzipBase64Url(JSON.stringify(snapshot));
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
  url.searchParams.set(PARAM_NAME, encoded);
  return url.toString();
}

function isStep(value: unknown): value is Step {
  return !!value && typeof value === "object" && typeof (value as Step).kind === "string";
}

function isQuerySnapshot(value: unknown): value is QuerySnapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as QuerySnapshot;
  return (
    typeof v.league === "string" &&
    typeof v.status === "string" &&
    typeof v.enforceAffixCap === "boolean" &&
    typeof v.buyoutPrice === "object" &&
    v.buyoutPrice !== null &&
    Array.isArray(v.steps) &&
    v.steps.every(isStep)
  );
}

/** Reads and validates the filter encoded in the current URL, if any. Never throws — a missing, corrupt, or foreign `f` param just yields `null`. */
export async function readSharedQuery(): Promise<QuerySnapshot | null> {
  const encoded = new URLSearchParams(window.location.search).get(PARAM_NAME);
  if (!encoded) return null;
  try {
    const parsed: unknown = JSON.parse(await gunzipBase64Url(encoded));
    return isQuerySnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Adds a new browser-history entry for this state, so back/forward can step through it — call once state settles after a change, not on every keystroke. */
export async function pushQueryToHistory(snapshot: QuerySnapshot): Promise<void> {
  const url = await buildShareUrl(snapshot);
  window.history.pushState(null, "", url);
}
