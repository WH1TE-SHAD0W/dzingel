# Architecture

Source: [`proposal.md`](../proposal.md) — *Proposed Three-Tier Architectural Design*, *Proposed
Technology Stack*. Code references describe the repository as of this file's creation.

## Proposed (target) architecture — self-hosted

```
 Browser ──HTTPS──▶ [ NGINX container: Astro-built HTML/CSS ]
                          │  /api/*  (internal docker network only)
                          ▼
                    [ Hono container (TypeScript) ]
                          │
                          ▼
                    [ SQLite file — docker volume ]
```

- **Presentation tier:** Astro renders static HTML/CSS with minimal JavaScript, served by NGINX.
  Pages: login, admin settings, group management, rolling quote list, create/edit page, search bar
  on top, header with logo (+ settings icon for admins).
- **Application tier:** Hono (TypeScript). Authenticates users, assigns roles, authorises actions,
  validates input. Core operations: create, edit, share, search quotes. It is "the bridge between
  data and the browser".
- **Data tier:** SQLite — one file mapped as a docker volume. Tables: `users`, `quotes`, `groups`.
  No media storage. Known limitation: write concurrency.
- **Deployment:** docker-compose, each tier in its own isolated container. GitHub Actions builds
  containers on git tags and pushes to Docker Hub; Watchtower can auto-update.
- **Cloudflare CI/CD (decided 2026-11-20, epic #17):** GitHub Actions only *verifies* (install,
  typecheck, tests, web build on every PR and push to `main`) and holds **no Cloudflare secrets**.
  Deploys are done by **Cloudflare Workers Builds**: each worker is connected to the GitHub repo in
  the Cloudflare dashboard and deploys on push to `main`.
  - `dzingel-api` (root `api/`): deploy command applies remote D1 migrations, then `wrangler deploy`.
  - `dzingel` (root `web/`): `astro build`, then `wrangler deploy`.
  - The two builds are independent, so **API-before-web order is not enforced by the pipeline**.
    The web worker only needs `dzingel-api` to exist (service binding); a change that needs both
    sides at once must be made backward compatible, or the web build re-run after the API.
  - No production approval gate for now.
  - **Why Cloudflare-native tooling:** the human wants to gain hands-on experience with Cloudflare
    infrastructure (stated 2026-11-20). When a CI/CD choice is otherwise even, prefer the Cloudflare
    product (Workers Builds, D1, worker secrets) over a third-party or GitHub-side equivalent.
- **Why 3-tier:** standard cloud-native separation of concerns, horizontal scalability, and each
  tier can be replaced later (e.g. migrate the DB) without breaking the system.

## Current implementation — what the code does today

| Concern | Code | Notes |
|---|---|---|
| API | `api/src/app.ts` — `createApp(db)` builds the Hono app | Routes under `/api/*` |
| DB abstraction | `api/src/db.ts` — `Db { all, run }` | Keeps the app runtime-agnostic (NFR-08) |
| Self-host runtime | `api/src/server.ts` + `api/src/node-db.ts` | Node `@hono/node-server`, `node:sqlite`, file from `DB_FILE` (default `dzingel.sqlite`), port `PORT` (default 8787). Applies `0001_init.sql` on boot. |
| Cloudflare runtime | `api/src/worker.ts` + `api/src/d1-db.ts` | Worker bound to D1 database `dzingel`; `workers_dev: false` — only reachable via service binding |
| Frontend | `web/src/pages/index.astro` + `web/src/main.ts` | Single page; DOM built with `textContent` |
| Frontend → API | dev: Vite proxy `/api` → `localhost:8787` (`web/astro.config.mjs`); Cloudflare: `web/worker/index.ts` forwards `/api/*` to the API worker via service binding | In self-host, NGINX is meant to do this proxying |
| Schema | `api/migrations/0001_init.sql` | `groups`, `quotes` — **no `users` table yet** |

## Known divergences from the proposal (track as issues, do not silently resolve)

1. **Cloudflare Workers + D1 deployment exists** alongside the self-host path. The proposal lists
   cloud deployment as a *later stage*. The `Db` interface keeps both working — see
   `docs/adr/0002-*`. Any change must keep **both** `node-db.ts` and `d1-db.ts` working.
2. **No docker-compose / Dockerfiles / NGINX config** yet (NFR-04, SEC-05).
3. **No authentication, users or roles** yet (FR-01..FR-04, SEC-03). Every endpoint is currently
   open — treat that as the top security gap.
4. **Tests exist (Vitest, #1/#11); CI and automated deploys are planned** in epic #17: checks on
   GitHub Actions, deploys by Cloudflare Workers Builds instead of the proposal's tag-based Docker
   Hub builds (those stay with self-host packaging, E7). SEC-07 (Snyk, ZAP) is not in the pipeline
   yet.
5. `GET /api/quotes` searches **one group at a time**; the proposal's search bar implies searching
   "any past quotes" — clarify scope in the search ticket.

## Technology choices

| Tier | Choice | Reason given in proposal |
|---|---|---|
| Frontend | **Astro** | Very lightweight, minimal JavaScript |
| Backend | **Hono** (TypeScript) | Fast |
| Database | **SQLite** | One file, one SQL DB, simple; well-structured data, fast retrieval |
| CI/CD | **GitHub Actions**, Watchtower | Tag-based container builds to Docker Hub |
| CI/CD (Cloudflare) | **GitHub Actions** (checks only) + **Cloudflare Workers Builds** (deploy) | Decided 2026-11-20: keeps Cloudflare tokens out of GitHub (epic #17) |
| Security testing | **Snyk**, **OWASP ZAP** | SAST + DAST in the pipeline |
| Performance testing | **Locust** | Scripted load tests with summaries |
