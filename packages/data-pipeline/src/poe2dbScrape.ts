import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractModsViewCalls } from "./poe2db/extractModsView.js";
import { ITEM_CLASS_TO_POE2DB_SLUG } from "./poe2db/itemClassSlugs.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, "../raw-cache/poe2db");

const CONTACT_EMAIL = process.env.CONTACT_EMAIL ?? "set-CONTACT_EMAIL-env-var@example.com";
const USER_AGENT = `Mozilla/5.0 (compatible; poe2-better-trade-filter/0.1; contact: ${CONTACT_EMAIL})`;

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

interface RawModEntry {
  Name: string;
  Level: string | number;
  ModGenerationTypeID: string | number;
  ModFamilyList: string[];
  str: string;
  spawn_no: string[];
}

interface NormalizedModEntry {
  name: string;
  level: number;
  modGenerationTypeId: number;
  modFamily: string[];
  text: string;
  spawnTags: string[];
}

function normalizeEntry(e: RawModEntry): NormalizedModEntry {
  return {
    name: e.Name,
    level: Number(e.Level),
    modGenerationTypeId: Number(e.ModGenerationTypeID),
    modFamily: e.ModFamilyList ?? [],
    text: stripHtml(e.str ?? ""),
    spawnTags: e.spawn_no ?? [],
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** poe2db.tw has no formal API — this pulls the same `new ModsView({...})` JSON blob a browser would render into the "Modifiers Calc" tab, per item-type page. See src/poe2db/extractModsView.ts for how. */
async function scrapeOne(itemClass: string, slug: string): Promise<void> {
  const url = `https://poe2db.tw/us/${slug}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  const html = await res.text();

  const calls = extractModsViewCalls(html) as Record<string, unknown>[];
  if (calls.length === 0) {
    console.warn(`  no ModsView data found for ${itemClass} (${slug})`);
    return;
  }
  const data = calls[0];

  const pools: Record<string, NormalizedModEntry[]> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!Array.isArray(value) || value.length === 0) continue;
    const first = value[0];
    if (!first || typeof first !== "object" || !("Name" in first)) continue; // skip non-mod-pool fields (baseitem, config, gen, opt, ...)
    pools[key] = (value as RawModEntry[]).map(normalizeEntry);
  }

  const output = {
    itemClass,
    slug,
    fetchedAt: new Date().toISOString(),
    pools,
  };

  await writeFile(path.join(OUT_DIR, `${slug}.json`), JSON.stringify(output), "utf8");
  const poolSummary = Object.entries(pools)
    .map(([k, v]) => `${k}:${v.length}`)
    .join(" ");
  console.log(`  ${itemClass} (${slug}) -> ${poolSummary}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const entries = Object.entries(ITEM_CLASS_TO_POE2DB_SLUG);
  console.log(`scraping ${entries.length} item-class pages from poe2db.tw...`);
  for (const [itemClass, slug] of entries) {
    try {
      await scrapeOne(itemClass, slug);
    } catch (err) {
      console.error(`  FAILED ${itemClass} (${slug}):`, err instanceof Error ? err.message : err);
    }
    await delay(500); // polite pacing, one request per half-second
  }
  console.log(`done. Output in ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
