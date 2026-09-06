import { STATUS_OPTIONS, type QuerySnapshot, type Step } from "../state/types";

/**
 * ============================================================================
 * MIGRATION PLAN for QuerySnapshot — read this before changing its shape.
 * ============================================================================
 *
 * A `QuerySnapshot` (league/status/buyoutPrice/enforceAffixCap/
 * includeUniqueMods/steps) is the one payload this app persists in three
 * independent places, all indefinitely long-lived from the app's point of
 * view:
 *   - a saved query in localStorage (lib/savedQueries.ts)
 *   - the `?f=` param driving share links AND browser back/forward
 *     (lib/shareUrl.ts) — this one can outlive the app by months, sitting in
 *     someone's bookmarks or chat history
 *   - the saved-queries export/import file (lib/savedQueries.ts)
 *
 * Every one of those now stamps a `v` schema-version number alongside the
 * snapshot, so a newer app version can recognize exactly how old a given
 * blob is and walk it forward, instead of either crashing on an unexpected
 * shape or silently misinterpreting stale fields. Data with no `v` at all —
 * everything that already exists, saved before this system was introduced —
 * is treated as version 0.
 *
 * When you change QuerySnapshot's shape (add/rename/restructure a field on
 * QuerySnapshot itself, or on `Step`):
 *   1. Bump CURRENT_QUERY_SNAPSHOT_VERSION by 1.
 *   2. Append one function to QUERY_SNAPSHOT_MIGRATIONS (its index is the
 *      version it upgrades FROM — the migration at index 1 turns a v1
 *      payload into a v2 one). It receives the raw, still-untyped object
 *      and returns the upgraded one; add/rename/drop fields as needed.
 *   3. Never edit, renumber, or delete an existing migration once it has
 *      shipped — a browser can be arbitrarily far behind, and it needs the
 *      whole chain intact to catch up from whatever version it's stuck at.
 *   4. Prefer losing one field or one step over rejecting the whole record.
 *      `migrateQuerySnapshot` only returns `null` when nothing usable is
 *      left after migrating — losing a single filter a user saved months
 *      ago is a much smaller failure than silently deleting their whole
 *      saved query.
 *   5. If a `Step` kind is removed entirely, filter those steps out inside
 *      the migration rather than leaving them for `isQuerySnapshotShape` to
 *      reject the whole snapshot over.
 *
 * The exact same idea, applied to the *container* each of these payloads
 * lives in (e.g. "saved queries used to be a flat array"), is
 * lib/versionedStore.ts — that one versions the array/object wrapper around
 * a list of these; this file versions one snapshot's own fields.
 */
export const CURRENT_QUERY_SNAPSHOT_VERSION = 1;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Migration = (raw: any) => any;

/**
 * migrations[i] upgrades a payload from version i to i+1.
 *
 * v0 -> v1: this system's own bootstrap migration. `status`, `buyoutPrice`,
 * `enforceAffixCap`, and `includeUniqueMods` were each added to QuerySnapshot
 * at different points before this versioning existed, so plenty of
 * already-persisted v0 data predates one or more of them — default exactly
 * as the app itself already defaults them (see App.tsx/usePipeline.ts).
 * `league` and `steps` were there from the start and are left unmodified.
 */
export const QUERY_SNAPSHOT_MIGRATIONS: Migration[] = [
  (raw) => ({
    status: "securable",
    buyoutPrice: { currency: "" },
    enforceAffixCap: true,
    includeUniqueMods: false,
    ...raw,
  }),
];

function isStep(value: unknown): value is Step {
  return !!value && typeof value === "object" && typeof (value as Step).kind === "string";
}

function isStatusOption(value: unknown): boolean {
  return typeof value === "string" && STATUS_OPTIONS.some((o) => o.id === value);
}

/** Structural check for a bare QuerySnapshot. A superset object (a SavedQuery record, an export file's wrapper) passes too — extra fields never fail a structural check — so callers needing more (an `id`, a `name`) still add their own check on top. */
export function isQuerySnapshotShape(value: unknown): value is QuerySnapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as QuerySnapshot;
  return (
    typeof v.league === "string" &&
    isStatusOption(v.status) &&
    typeof v.enforceAffixCap === "boolean" &&
    typeof v.includeUniqueMods === "boolean" &&
    typeof v.buyoutPrice === "object" &&
    v.buyoutPrice !== null &&
    Array.isArray(v.steps) &&
    v.steps.every(isStep)
  );
}

/**
 * Walks `raw` through every migration between its own `v` (0 if absent) and
 * `CURRENT_QUERY_SNAPSHOT_VERSION`, then stamps the current version back on.
 * Works on any object that *contains* QuerySnapshot's fields, not just an
 * exact QuerySnapshot — a SavedQuery record's extra id/name/folderId, or an
 * export file's own wrapper fields, pass through a migration untouched
 * unless that migration specifically reaches in to change them. Returns
 * `raw` unchanged if it isn't an object at all (shape validation downstream
 * will reject it).
 */
export function migrateQuerySnapshotFields(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = raw;
  let version = typeof data.v === "number" ? data.v : 0;
  while (version < CURRENT_QUERY_SNAPSHOT_VERSION) {
    const migrate = QUERY_SNAPSHOT_MIGRATIONS[version];
    if (!migrate) break; // no migration registered this far — shape validation below will reject it if it's genuinely incompatible
    data = migrate(data);
    version++;
  }
  return { ...data, v: CURRENT_QUERY_SNAPSHOT_VERSION };
}

/** Migrates then validates as a bare snapshot — what share-link decoding needs. Never throws; returns `null` for anything unmigratable or invalid. */
export function migrateQuerySnapshot(raw: unknown): QuerySnapshot | null {
  const migrated = migrateQuerySnapshotFields(raw);
  return isQuerySnapshotShape(migrated) ? migrated : null;
}

/** Stamps the current version onto a freshly-built snapshot at the point it's about to be serialized (saved, shared, or exported) — a snapshot built by the running app is by definition already current-shape, so this needs no migration, just the label. */
export function withCurrentSnapshotVersion<T extends object>(snapshot: T): T & { v: number } {
  return { ...snapshot, v: CURRENT_QUERY_SNAPSHOT_VERSION };
}
