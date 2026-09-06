import type { QuerySnapshot } from "../state/types";
import { gunzipBase64Url, gzipBase64Url } from "./gzipBase64";
import { migrateQuerySnapshot, withCurrentSnapshotVersion } from "./schemaVersion";

/**
 * Doesn't need to match the trade site's own query format (that's what
 * `tradeUrl.ts` is for) — this only has to round-trip our own app state, so
 * it's just a `QuerySnapshot` gzipped and base64url-encoded the same way,
 * carried in a query param rather than the path. A link like this can sit in
 * someone's bookmarks for months, long past when its `v` (see
 * schemaVersion.ts) stops matching the currently-running app — that's
 * exactly what `migrateQuerySnapshot` on the read side is for.
 */
const PARAM_NAME = "f";

export async function buildShareUrl(snapshot: QuerySnapshot): Promise<string> {
  const encoded = await gzipBase64Url(JSON.stringify(withCurrentSnapshotVersion(snapshot)));
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
  url.searchParams.set(PARAM_NAME, encoded);
  return url.toString();
}

/** Reads, migrates, and validates the filter encoded in the current URL, if any. Never throws — a missing, corrupt, unmigratable, or foreign `f` param just yields `null`. */
export async function readSharedQuery(): Promise<QuerySnapshot | null> {
  const encoded = new URLSearchParams(window.location.search).get(PARAM_NAME);
  if (!encoded) return null;
  try {
    const parsed: unknown = JSON.parse(await gunzipBase64Url(encoded));
    return migrateQuerySnapshot(parsed);
  } catch {
    return null;
  }
}

/** Adds a new browser-history entry for this state, so back/forward can step through it — call once state settles after a change, not on every keystroke. */
export async function pushQueryToHistory(snapshot: QuerySnapshot): Promise<void> {
  const url = await buildShareUrl(snapshot);
  window.history.pushState(null, "", url);
}
