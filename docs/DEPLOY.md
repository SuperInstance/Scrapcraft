# Deploying Scrapcraft & linking superinstance.ai / superinstance.dev

This is the runbook for shipping a production build and pointing the two
public domains at **the latest production version**. It is written so the
domain flip is a known, repeatable procedure — not a one-off guess.

> **Status:** the repo currently has **no** hosting/domain wiring. The
> Cloudflare Worker (`cloudflare/`) is **API-only** — every non-`/api/v1/*`
> request returns a JSON health-check, so it does *not* serve the game.
> Linking the domains therefore requires a hosting decision (below) plus a
> `wrangler`/dashboard step run with Cloudflare account credentials.

---

## Architecture

Scrapcraft is two independently deployable pieces:

| Piece | What | Build / source |
|-------|------|----------------|
| **Frontend** | Static SPA — `index.html` + hashed JS chunks. `vite.config.js` sets `base: './'`, so it runs from any origin or sub-path. | `npm run build` → `dist/` |
| **API** | Cloudflare Worker: cloud saves (D1), assets (R2), semantic search (Vectorize), Workers AI, multiplayer (Durable Objects), Queues. | `cloudflare/` → `wrangler deploy` |

The frontend talks to the API only when a Worker URL is configured; with no
config it runs fully offline on built-in content (see `.env.example`). So the
frontend can go live **before** the Worker.

---

## Build the production frontend

```bash
npm ci
npm test           # 2294 + 51 + chips + voice — all green
npm run build      # → dist/  (self-contained, relative paths)
```

`scripts/deploy.sh` also snapshots each build into `releases/<timestamp>/`.

---

## Option A — Cloudflare Pages for the frontend  ★ recommended

Cleanest split: Pages serves the static game, the Worker serves `/api`.
"Latest production version" is guaranteed because Pages rebuilds the
**Production branch** (`main`) on every push and the custom domain always
tracks the latest Production deployment.

1. **Create the Pages project** (once), pointed at this repo:
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Production branch: `main`
2. **Attach the domains** (Pages → the project → Custom domains):
   - Add `superinstance.ai` and `superinstance.dev` (and `www.` if wanted).
   - Cloudflare provisions the certs and the CNAME automatically when the
     zones live on the same account.
3. **Point the game at the API** (optional, only for cloud features): set the
   Worker URL in-game (Settings → Advanced) or bake a default; the Worker is
   deployed separately (below) — e.g. as `api.superinstance.ai`.

SPA note: the game uses query params (`?brain=`, `?seed=`, `?observe=`), not
path routing, so no SPA-rewrite rule is required.

---

## Option B — Single Worker serves game **and** API

One deploy, one domain, no separate Pages project. Add a Static Assets
binding to `cloudflare/wrangler.toml`:

```toml
[assets]
directory = "../dist"
binding = "ASSETS"
# Assets are matched first; the Worker's fetch() runs only for non-asset paths.
# Do NOT enable a blanket SPA fallback, or "/api/*" would be shadowed by
# index.html. The API lives under /api/v1/* and simply falls through to the
# existing fetch handler in cloudflare/src/index.js.

[[routes]]
pattern = "superinstance.ai"
custom_domain = true

[[routes]]
pattern = "superinstance.dev"
custom_domain = true
```

Then, from `cloudflare/`:

```bash
npm run build            # (repo root) produce ../dist first
cd cloudflare
wrangler deploy          # publishes the Worker + attaches the custom domains
```

Trade-off: the game and API share an origin (no CORS needed) but also share a
deploy cadence. Prefer **Option A** unless you specifically want a single
origin.

---

## The Worker (API) — one-time resource setup

```bash
cd cloudflare
wrangler d1 create scrapcraft-db          # paste database_id into wrangler.toml
wrangler vectorize create scrapcraft-embeddings --dimensions=512 --metric=cosine
wrangler r2 bucket create scrapcraft-assets
wrangler queues create scrapcraft-tasks
# secrets (optional AI providers):
wrangler secret put ANTHROPIC_KEY         # + OPENAI_KEY, etc. as needed
wrangler deploy
```

---

## "Always the latest production version"

- **Option A:** the custom domain is bound to the Pages project's *Production*
  environment, which is the `main` branch. Merging to `main` ⇒ new Production
  deployment ⇒ the domain serves it automatically. No manual repoint.
- **Option B:** `wrangler deploy` from `main` replaces the live Worker; the
  custom-domain routes stay attached across deploys.

Either way, the domain follows `main` — so the release gate is simply
"merge to `main`."

---

## What still needs a human / credentials

Everything above that talks to Cloudflare (`wrangler …`, Pages project
creation, custom-domain attachment) needs the **Cloudflare account** for the
`superinstance.ai` / `superinstance.dev` zones. That access is **not**
available from an automated session by default (the Cloudflare connector was
offline when this doc was written), so the domain flip is a deliberate,
credentialed step taken **when prod is ready** — this runbook makes it a
copy-paste, not a discovery exercise.
