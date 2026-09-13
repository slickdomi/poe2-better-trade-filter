import type { QuerySnapshot, RegexSnapshot, TabId } from "../state/types";
import { gunzipBase64Url, gzipBase64Url } from "./gzipBase64";
import {
  migrateQuerySnapshot,
  migrateRegexSnapshot,
  withCurrentRegexSnapshotVersion,
  withCurrentSnapshotVersion,
} from "./schemaVersion";

/**
 * Everything a link carries: the open tab, plus each tab's own selection, so
 * a link reopens exactly what its sender was looking at — including the
 * options that generated a regex.
 *
 * Doesn't need to match the trade site's own query format (that's what
 * `tradeUrl.ts` is for) — this only has to round-trip our own app state, so
 * each tab's snapshot is gzipped and base64url-encoded into its own query
 * param. A link like this can sit in someone's bookmarks for months, long
 * past when its `v` (see schemaVersion.ts) stops matching the currently-
 * running app — that's exactly what the migrate functions on the read side
 * are for.
 */
export interface SharedState {
  tab: TabId;
  /** `null` while a tab is at its blank slate — left out of the URL, so it doesn't override the recipient's own defaults. */
  trade: QuerySnapshot | null;
  regex: RegexSnapshot | null;
}

/** Predates the Regex generator; kept for the Trade tab so links shared before it still open. */
const TRADE_PARAM = "f";
const REGEX_PARAM = "r";
/** Only written for a tab other than Trade, so a Trade link looks exactly like it always has. */
const TAB_PARAM = "tab";

export async function buildShareUrl(state: SharedState): Promise<string> {
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
  if (state.tab !== "trade") url.searchParams.set(TAB_PARAM, state.tab);
  if (state.trade) {
    url.searchParams.set(TRADE_PARAM, await gzipBase64Url(JSON.stringify(withCurrentSnapshotVersion(state.trade))));
  }
  if (state.regex) {
    url.searchParams.set(REGEX_PARAM, await gzipBase64Url(JSON.stringify(withCurrentRegexSnapshotVersion(state.regex))));
  }
  return url.toString();
}

async function readParam<T>(params: URLSearchParams, name: string, migrate: (raw: unknown) => T | null): Promise<T | null> {
  const encoded = params.get(name);
  if (!encoded) return null;
  try {
    return migrate(JSON.parse(await gunzipBase64Url(encoded)));
  } catch {
    return null;
  }
}

/** Reads, migrates, and validates the state encoded in the current URL. Never throws — a missing, corrupt, unmigratable, or foreign param just yields `null` (or the Trade tab) for that part. */
export async function readSharedState(): Promise<SharedState> {
  const params = new URLSearchParams(window.location.search);
  const [trade, regex] = await Promise.all([
    readParam(params, TRADE_PARAM, migrateQuerySnapshot),
    readParam(params, REGEX_PARAM, migrateRegexSnapshot),
  ]);
  return { tab: params.get(TAB_PARAM) === "regex" ? "regex" : "trade", trade, regex };
}

/** Adds a new browser-history entry for this state, so back/forward can step through it — call once state settles after a change, not on every keystroke. */
export async function pushSharedStateToHistory(state: SharedState): Promise<void> {
  const url = await buildShareUrl(state);
  window.history.pushState(null, "", url);
}
