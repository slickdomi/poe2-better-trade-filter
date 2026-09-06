# PoE2 Better Trade Filter

A companion filter builder for the [Path of Exile 2 trade site](https://www.pathofexile.com/trade2). The official site lets you attach any modifier filter to any item category (e.g. a boots-only modifier to a sceptre search); this tool walks you through a locked-down pipeline — pick a category, then only modifiers that can actually roll on that category are selectable — with full undo, and a button that opens the equivalent search directly on the official trade site.

## How it works

- `packages/data-pipeline` fetches the official trade API's public `data/stats` / `data/items` / `data/filters` / `data/leagues` endpoints (no API key needed) and the [RePoE-fork](https://repoe-fork.github.io/poe2/) PoE2 data export (community-maintained, mined from game files), then cross-references them into a single `packages/web/src/data/filters.json` describing, per item category, which trade stat ids are eligible.
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

## Deploying (GitHub Pages)

`.github/workflows/deploy.yml` builds `packages/web` (against the `filters.json` already committed to the repo — it does not re-run the data pipeline) and publishes it to GitHub Pages on every push to `main`.

One-time setup: in the repo's **Settings → Pages**, set **Source** to **GitHub Actions**. The workflow uses `actions/configure-pages` to compute the right Vite `--base` automatically — `/` when a custom domain is attached (Pages serves it from the domain root), or `/<repo-name>/` for the default `https://<owner>.github.io/<repo-name>/` URL. No manual flag to update either way, including if a custom domain is added or removed later.

## Known v1 limitations

- Only equipment categories that roll ordinary prefix/suffix modifiers are covered (see `packages/data-pipeline/src/categoryItemClasses.ts`) — gems, currency, relics, map fragments, etc. aren't mapped yet.
- Mods that grant more than one stat at once are skipped during the RePoE↔trade stat-id join (logged as "multi-stat mods skipped" when the pipeline runs) rather than guessed at.
- Dependencies respect a 14-day install cooldown (see `.npmrc`, https://cooldowns.dev/) as a supply-chain safety measure.
