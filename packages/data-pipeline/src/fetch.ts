import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAW_CACHE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../raw-cache");

// GGG's developer policy asks API clients to identify themselves; set your
// own contact when refreshing data (`CONTACT_EMAIL=you@example.com npm run fetch`).
const CONTACT_EMAIL = process.env.CONTACT_EMAIL ?? "set-CONTACT_EMAIL-env-var@example.com";
const TRADE_HEADERS = { "User-Agent": `OAuth poe2-better-trade/0.1 (contact: ${CONTACT_EMAIL})` };

interface Source {
  name: string;
  url: string;
  headers?: Record<string, string>;
}

const SOURCES: Source[] = [
  { name: "trade-stats", url: "https://www.pathofexile.com/api/trade2/data/stats", headers: TRADE_HEADERS },
  { name: "trade-items", url: "https://www.pathofexile.com/api/trade2/data/items", headers: TRADE_HEADERS },
  { name: "trade-filters", url: "https://www.pathofexile.com/api/trade2/data/filters", headers: TRADE_HEADERS },
  { name: "trade-leagues", url: "https://www.pathofexile.com/api/trade2/data/leagues", headers: TRADE_HEADERS },
  { name: "repoe-item-classes", url: "https://repoe-fork.github.io/poe2/item_classes.json" },
  { name: "repoe-base-items", url: "https://repoe-fork.github.io/poe2/base_items.json" },
  { name: "repoe-mods", url: "https://repoe-fork.github.io/poe2/mods.json" },
  { name: "repoe-mods-by-base", url: "https://repoe-fork.github.io/poe2/mods_by_base.json" },
  { name: "repoe-tags", url: "https://repoe-fork.github.io/poe2/tags.json" },
];

async function fetchSource(source: Source): Promise<void> {
  const res = await fetch(source.url, { headers: source.headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${source.name} (${source.url}): ${res.status} ${res.statusText}`);
  }
  const body = await res.text();
  JSON.parse(body); // fail fast if the response isn't valid JSON
  await writeFile(path.join(RAW_CACHE_DIR, `${source.name}.json`), body, "utf8");
  console.log(`fetched ${source.name} (${(body.length / 1024).toFixed(0)} KB)`);
}

async function main() {
  await mkdir(RAW_CACHE_DIR, { recursive: true });
  // Sequential on purpose: polite to both hosts' rate limits.
  for (const source of SOURCES) {
    await fetchSource(source);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
