# PoE2 Better Trade Filter

A companion filter builder for the [Path of Exile 2 trade site](https://www.pathofexile.com/trade2). The official site lets you attach any modifier filter to any item category (e.g. a boots-only modifier to a sceptre search); this tool walks you through a locked-down pipeline — pick a category, then only modifiers that can actually roll on that category are selectable — with full undo, and a button that opens the equivalent search directly on the official trade site.

## How it works

- `packages/data-pipeline` fetches the official trade API's public `data/stats` / `data/items` / `data/filters` / `data/leagues` endpoints (no API key needed) and the [RePoE-fork](https://repoe-fork.github.io/poe2/) PoE2 data export (community-maintained, mined from game files), then cross-references them into a single `packages/web/src/data/filters.json` describing, per item category, which trade stat ids are eligible. It also scrapes poe2db.tw's per-item-type "Modifiers Calc" data (see below) for the handful of mods (Genesis Tree / Otherworldly) where RePoE's own data turned out unreliable.
- `packages/web` is a static React + TypeScript SPA that reads that file and builds the search step by step.
- The "open in official trade site" button builds the query and gzip/base64url-encodes it directly into a `pathofexile.com/trade2/search/poe2/{league}/{blob}` URL — the same mechanism the official site's own "search for similar items" link uses. No backend or server-side proxy is involved.

## Data sources & attribution

Game data ultimately belongs to Grinding Gear Games. This project only reads already-public data (GGG's own trade API, and RePoE-fork's published JSON export) — it does not extract anything from the game client itself.

## Running everything via Docker

Per project policy, nothing is installed or run on the host directly — everything goes through Docker.

```sh
# Refresh packages/web/src/data/filters.json from live sources (manual, on demand):
docker compose run --rm data-pipeline

# Start the dev server (http://localhost:5173):
docker compose up web
```

Optionally set `CONTACT_EMAIL=you@example.com` (passed as `-e CONTACT_EMAIL` to the `data-pipeline` run above) to have it sent in the trade API's `User-Agent` header, per GGG's developer policy of identifying API clients.

### Why poe2db.tw is also scraped

For most mods, RePoE-fork's `spawn_weights` data (matched against each base item's own tags) reliably determines which categories a mod can appear on — that's the primary path for everything in `filters.json`. One specific mod family doesn't follow that rule: "Genesis Tree"/"Otherworldly" mods (rings/belts/amulets dropping pre-rolled with mods normally restricted to other slots). RePoE's own tag for these turned out unreliable — verified directly: a "of the Taskmaster" mod (`+1 to Level of all Minion Skills`) is tagged `ring` in RePoE's data, but poe2db.tw's own independently-mined data shows the *identical* tag value while its site only ever displays that mod on the **Belt** page, never Ring — and this wasn't an isolated case, it was a near-total swap across the whole mod family.

Since poe2db.tw has no formal API, `packages/data-pipeline/src/poe2dbScrape.ts` (run automatically as part of `npm run fetch`, one HTTP request per item-type page, ~15s total) pulls the same `new ModsView({...})` JSON object a browser would render into the "Modifiers Calc" tab (see `src/poe2db/extractModsView.ts`) into `raw-cache/poe2db/*.json`. Only the `breach_minion`/`breach_caster`/`breach_otherworldly` pools from that data feed `filters.json` (`src/poe2db/loadPoe2dbEligibility.ts`) — poe2db's own per-page curation for those three pools is treated as ground truth in place of RePoE's tag, while everything else (normal affixes, Corrupted, Desecrated, Essence) still goes through the more reliable RePoE/spawn-weight path. Not every item type has this data at all — poe2db has no Modifiers Calc tab for Helmet/Body Armour/Gloves/Boots/Shield/Jewel/Map/FishingRod pages (confirmed directly, not a scraper bug), and only Ring/Belt/Amulet actually carry Genesis Tree/Otherworldly content among the item types this project covers.

## Deploying (GitHub Pages)

`.github/workflows/deploy.yml` builds `packages/web` (against the `filters.json` already committed to the repo — it does not re-run the data pipeline) and publishes it to GitHub Pages on every push to `main`.

One-time setup: in the repo's **Settings → Pages**, set **Source** to **GitHub Actions**. The workflow uses `actions/configure-pages` to compute the right Vite `--base` automatically — `/` when a custom domain is attached (Pages serves it from the domain root), or `/<repo-name>/` for the default `https://<owner>.github.io/<repo-name>/` URL. No manual flag to update either way, including if a custom domain is added or removed later.

## Known v1 limitations

- Only equipment categories that roll ordinary prefix/suffix modifiers are covered (see `packages/data-pipeline/src/categoryItemClasses.ts`) — gems, currency, relics, map fragments, etc. aren't mapped yet.
- Mods that grant more than one stat at once are skipped during the RePoE↔trade stat-id join (logged as "multi-stat mods skipped" when the pipeline runs) rather than guessed at.
- Dependencies respect a 14-day install cooldown (see `.npmrc`, https://cooldowns.dev/) as a supply-chain safety measure.
