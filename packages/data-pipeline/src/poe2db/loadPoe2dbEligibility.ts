import { readFile } from "node:fs/promises";
import path from "node:path";
import { normalizePoe2dbText } from "./normalizePoe2dbText.js";
import { resolveTradeStatId, type TradeStatIndex } from "../matchStatIds.js";
import { ITEM_CLASS_TO_POE2DB_SLUG } from "./itemClassSlugs.js";

interface Poe2dbModEntry {
  text: string;
}

interface Poe2dbCategoryFile {
  pools: Record<string, Poe2dbModEntry[]>;
}

/**
 * Confirmed by directly comparing scraped output (Ring vs Belt pages): the
 * "breach_minion"/"breach_caster"/"breach_otherworldly" pools ("Genesis
 * Tree"/"Otherworldly" mods) are properly curated per item-type page by
 * poe2db itself — but individual entries' own `ring`/`belt` spawn tags are
 * *not* reliable for this specific mod family (RePoE and poe2db both carry
 * the same tag value, yet poe2db renders some entries on the opposite
 * page from what their own tag says — a "of the Taskmaster" mod tagged
 * "ring" is shown only on the Belt page, and vice versa for others).
 * Page placement, not the tag, is trusted here — everything else
 * (normal/corrupted/desecrated/essence) is left to the existing
 * spawn-weight-based paths, which don't have this problem.
 */
const POOLS_TO_TRUST_FROM_POE2DB = ["breach_minion", "breach_caster", "breach_otherworldly"];

/** Per RePoE item_class, the set of trade stat ids poe2db's page placement confirms are reachable via Genesis Tree / Otherworldly. Silently omits any item class whose page wasn't scraped or has no calculator (see poe2dbScrape.ts's console output for which). */
export async function loadPoe2dbGenesisTreeStatIds(
  rawCacheDir: string,
  statIndex: TradeStatIndex,
): Promise<Map<string, Set<string>>> {
  const byItemClass = new Map<string, Set<string>>();

  for (const [itemClass, slug] of Object.entries(ITEM_CLASS_TO_POE2DB_SLUG)) {
    const filePath = path.join(rawCacheDir, "poe2db", `${slug}.json`);
    let file: Poe2dbCategoryFile;
    try {
      file = JSON.parse(await readFile(filePath, "utf8")) as Poe2dbCategoryFile;
    } catch {
      continue;
    }

    const statIds = new Set<string>();
    for (const poolName of POOLS_TO_TRUST_FROM_POE2DB) {
      for (const entry of file.pools[poolName] ?? []) {
        const normalized = normalizePoe2dbText(entry.text);
        const resolved = resolveTradeStatId(statIndex, ["explicit", "implicit"], normalized);
        if (resolved) statIds.add(resolved.id);
      }
    }
    if (statIds.size > 0) byItemClass.set(itemClass, statIds);
  }

  return byItemClass;
}
