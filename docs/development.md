# Development

## Prerequisites

- **Node.js 24+** — required for the built-in `node:sqlite` module used by `api/src/node-db.ts`.
- npm (workspaces).
- Optional: `wrangler` login for the Cloudflare deployment, `gh` for GitHub Issues.

## Layout

```
package.json          npm workspaces: api, web
api/                  Hono API (TypeScript)
  src/app.ts          createApp(db) — all routes
  src/db.ts           Db interface (all, run)
  src/node-db.ts      node:sqlite adapter (self-host / local dev)
  src/d1-db.ts        Cloudflare D1 adapter
  src/server.ts       Node entry point (port 8787)
  src/worker.ts       Cloudflare Worker entry point
  migrations/         SQL migrations (shared by node:sqlite and D1)
web/                  Astro frontend
  src/pages/          pages (.astro)
  src/main.ts         client script for the quote UI
  worker/index.ts     Cloudflare Worker forwarding /api/* to the API worker
context/              intent distilled from proposal.md
docs/                 this documentation
.claude/              Claude Code agents, skills, rules, hooks
```

## Run locally

```powershell
npm install
npm run dev:api     # http://localhost:8787  (creates dzingel.sqlite in api/)
npm run dev:web     # http://localhost:4321  (proxies /api to :8787)
```

Environment variables for the API: `PORT` (default `8787`), `DB_FILE` (default `dzingel.sqlite`).

## Checks

```powershell
npm run typecheck -w api
npm run typecheck -w web    # astro check — needs @astrojs/check installed
```

There is no test runner yet — adding Vitest is backlog item E8 (`context/backlog.md`).

## Migrations

- Files in `api/migrations/` are numbered `NNNN_description.sql`.
- `node-db.ts` currently executes only `0001_init.sql` on boot — a new migration needs the Node
  adapter updated to apply it too (tracked with the first schema-changing ticket).
- Cloudflare: `npm run migrate -w api` applies migrations to the remote D1 database.
- Never edit a migration that has been applied anywhere; add a new one.
