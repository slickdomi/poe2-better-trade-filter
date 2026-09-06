/**
 * Generic versioned localStorage read/write, one level up from
 * schemaVersion.ts: that file versions a single QuerySnapshot's own fields;
 * this versions the *container* around a whole store (e.g. "saved queries
 * used to be one flat array" — if that container shape itself ever needs to
 * change, this is what lets an old one be walked forward instead of
 * discarded).
 *
 * Convention for changing one of these stores' container shape:
 *   1. Bump that store's `currentVersion`.
 *   2. Append a migration to its `migrations` array (index i upgrades
 *      version i -> i+1) that transforms the raw, not-yet-validated payload.
 *   3. Never remove an old migration — a browser's copy can be arbitrarily
 *      old.
 *   4. `sanitize` always runs last, on every read regardless of version —
 *      it's also the right place for a plain additive field default (e.g. a
 *      new field on one record of an array) that doesn't warrant a whole
 *      migration entry of its own, the same way this codebase already
 *      handled additive fields before this system existed.
 */
export interface VersionedStoreSpec<T> {
  key: string;
  currentVersion: number;
  /** migrations[i] upgrades payload version i -> i+1. Payload with no envelope at all (predates this system) starts at version 0 and *is* the payload. */
  migrations: Array<(payload: unknown) => unknown>;
  /** Runs after migration, on every read. Must handle `undefined` (nothing stored yet) and produce a safe fallback for anything unsalvageable rather than throw. */
  sanitize: (payload: unknown) => T;
}

interface Envelope {
  v: number;
  data: unknown;
}

function isEnvelope(value: unknown): value is Envelope {
  return !!value && typeof value === "object" && typeof (value as Envelope).v === "number" && "data" in (value as object);
}

export function readVersionedStore<T>(spec: VersionedStoreSpec<T>): T {
  let raw: string | null;
  try {
    raw = localStorage.getItem(spec.key);
  } catch {
    return spec.sanitize(undefined);
  }
  if (!raw) return spec.sanitize(undefined);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return spec.sanitize(undefined);
  }

  let version = 0;
  let payload: unknown = parsed;
  if (isEnvelope(parsed)) {
    version = parsed.v;
    payload = parsed.data;
  }

  while (version < spec.currentVersion) {
    const migrate = spec.migrations[version];
    if (!migrate) break; // no migration registered this far — sanitize below decides what to do with whatever shape is left
    payload = migrate(payload);
    version++;
  }

  return spec.sanitize(payload);
}

export function writeVersionedStore<T>(spec: Pick<VersionedStoreSpec<T>, "key" | "currentVersion">, data: T): void {
  try {
    localStorage.setItem(spec.key, JSON.stringify({ v: spec.currentVersion, data } satisfies Envelope));
  } catch {
    // localStorage unavailable (private mode, quota, etc.) — best-effort.
  }
}
