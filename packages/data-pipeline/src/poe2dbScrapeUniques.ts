import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripHtml } from "./poe2db/stripHtml.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, "../raw-cache/poe2db");
const OUT_FILE = path.join(OUT_DIR, "unique_items.json");

const CONTACT_EMAIL = process.env.CONTACT_EMAIL ?? "set-CONTACT_EMAIL-env-var@example.com";
const USER_AGENT = `Mozilla/5.0 (compatible; poe2-better-trade-filter/0.1; contact: ${CONTACT_EMAIL})`;

export interface Poe2dbUniqueItem {
  name: string;
  /** RePoE base-item `name` this unique is built on, e.g. "Leaden Greathammer". */
  typeLine: string;
  mods: string[];
}

const ITEM_HEADER_RE = /<span class="uniqueName">([^<]+)<\/span> <span class="uniqueTypeLine">([^<]+)<\/span>/g;
const MOD_RE = /<div class="(?:explicit|implicit)Mod">([\s\S]*?)<\/div>/g;

/**
 * poe2db's "Unique_item" page (https://poe2db.tw/us/Unique_item) lists every
 * published unique item's exact base type and full rolled mod text, all on
 * one page (~445 items, confirmed by count) — the only data source found
 * that maps a hardcoded unique item's mods back to its base type. RePoE
 * models some uniques' fixed mods via a pseudo base-item's `implicits` (see
 * repoe-base-items.json's "...Unique#"-suffixed entries) but not
 * consistently; several real uniques have no such entry at all, which is
 * what caused uniqueEligibility to miss valid categories for some unique-only
 * stats (e.g. "# Intelligence Requirement" resolving to Helmet but not the
 * Two Hand Mace unique "Chober Chaber" that also rolls it). This scrape
 * fills that gap; see poe2db/loadPoe2dbUniqueEligibility.ts for how it's used.
 *
 * Parsed with plain regex, not an HTML parser: item boundaries are found by
 * the `uniqueName`/`uniqueTypeLine` span pair poe2db renders for every item,
 * and each item's own explicit/implicit mod `<div>`s (confirmed to never
 * nest another `<div>`, so a non-greedy match safely stops at each div's own
 * close tag) are collected between one item's header and the next.
 */
function parseUniqueItems(html: string): Poe2dbUniqueItem[] {
  const headers: { name: string; typeLine: string; index: number }[] = [];
  for (const m of html.matchAll(ITEM_HEADER_RE)) {
    headers.push({ name: stripHtml(m[1]), typeLine: stripHtml(m[2]), index: m.index + m[0].length });
  }

  const items: Poe2dbUniqueItem[] = [];
  for (let i = 0; i < headers.length; i++) {
    const { name, typeLine, index } = headers[i];
    const end = i + 1 < headers.length ? headers[i + 1].index : html.length;
    const body = html.slice(index, end);
    const mods = [...body.matchAll(MOD_RE)].map((m) => stripHtml(m[1])).filter(Boolean);
    items.push({ name, typeLine, mods });
  }
  return items;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const url = "https://poe2db.tw/us/Unique_item";
  console.log(`fetching ${url}...`);
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  const html = await res.text();

  const items = parseUniqueItems(html);
  if (items.length < 100) {
    throw new Error(`only parsed ${items.length} unique items — page structure likely changed, aborting`);
  }

  await writeFile(OUT_FILE, JSON.stringify(items), "utf8");
  console.log(`parsed ${items.length} unique items -> ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
