import { readFile } from "node:fs/promises";
import path from "node:path";
import { normalizePoe2dbText } from "./normalizePoe2dbText.js";
import { resolveTradeStatId, type TradeStatIndex } from "../matchStatIds.js";
import type { RepoeBaseItemsFile } from "../types.js";
import type { Poe2dbUniqueItem } from "../poe2dbScrapeUniques.js";

/**
 * poe2db's scraped unique-item list (see poe2dbScrapeUniques.ts) is the only
 * data source found that reliably maps a hardcoded unique item's mods back
 * to its exact base type — RePoE's own "pseudo base-item implicits" path
 * for modeling unique mods (see buildEligibility.ts) only covers *some*
 * uniques, silently omitting others. This resolves each scraped unique's
 * mod text to a trade stat id and attributes it to that unique's base
 * item's `item_class`, filling in exactly the uniques RePoE's own data
 * misses (parse.ts unions this with the RePoE-derived uniqueStatIds, so
 * neither source needs to be complete on its own).
 */
export async function loadPoe2dbUniqueStatIds(
  rawCacheDir: string,
  statIndex: TradeStatIndex,
  baseItems: RepoeBaseItemsFile,
): Promise<Map<string, Set<string>>> {
  const byItemClass = new Map<string, Set<string>>();

  const filePath = path.join(rawCacheDir, "poe2db", "unique_items.json");
  let items: Poe2dbUniqueItem[];
  try {
    items = JSON.parse(await readFile(filePath, "utf8")) as Poe2dbUniqueItem[];
  } catch {
    return byItemClass;
  }

  const itemClassByBaseName = new Map<string, string>();
  for (const base of Object.values(baseItems)) {
    itemClassByBaseName.set(base.name, base.item_class);
  }

  for (const item of items) {
    const itemClass = itemClassByBaseName.get(item.typeLine);
    if (!itemClass) continue; // typeLine isn't a base this project tracks (e.g. gem, currency) — skip
    for (const modText of item.mods) {
      const normalized = normalizePoe2dbText(modText);
      const resolved = resolveTradeStatId(statIndex, ["explicit", "implicit"], normalized);
      if (!resolved) continue;
      let set = byItemClass.get(itemClass);
      if (!set) {
        set = new Set();
        byItemClass.set(itemClass, set);
      }
      set.add(resolved.id);
    }
  }

  return byItemClass;
}
