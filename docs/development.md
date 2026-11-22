# Development

## Prerequisites

- **Node.js 24+** — required for the built-in `node:sqlite` module used by `api/src/node-db.ts`.
- npm (workspaces).
- Optional: `wrangler` login for the Cloudflare deployment, `gh` for GitHub Issues.

## Layout

```
package.json          npm workspaces: api, web
docker-compose.yml    self-hosting stack (api + web); .env.example holds placeholders; see docs/self-hosting.md
scripts/              root Node scripts: smoke-check.mjs, with tests for it, the CI config and docker-compose-config.test.mjs
.github/workflows/    ci.yml (checks), smoke.yml (scheduled smoke check)
api/                  Hono API (TypeScript)
  src/app.ts          createApp(db, auth) — all routes
  src/auth.ts         createAuth() — Better Auth with the username plugin
  src/db.ts           Db interface (all, run)
  src/node-db.ts      node:sqlite adapter + ordered migration runner (self-host / local dev)
  src/d1-db.ts        Cloudflare D1 adapter
  src/server.ts       Node entry point (port 8787)
  src/worker.ts       Cloudflare Worker entry point
  migrations/         SQL migrations (shared by node:sqlite and D1)
  test/               Vitest API tests
web/                  Astro frontend
  src/pages/          /  /login  /register  /quotes/new  /quotes/edit?id=<quote id>
  src/components/     TopPanel (session check, group switcher, logout), QuoteFields
  src/scripts/        client scripts per page
  src/lib/            api client, form and quote-form helpers, group/session events
  src/main.ts         client script for the quote list (/)
  test/               Vitest web tests (test/dom: DOM tests)
  worker/index.ts     Cloudflare Worker forwarding /api/* to the API worker
  Dockerfile, nginx.conf   self-hosting web image (NGINX, port 8080)
api/Dockerfile        self-hosting API image (esbuild bundle of src/server.ts)
context/              intent distilled from proposal.md
docs/                 this documentation
.claude/              Claude Code agents, skills, rules, hooks
```

## Run locally

```powershell
npm install
$env:BETTER_AUTH_SECRET = "<at least 32 random characters>"
npm run dev:api     # http://localhost:8787  (creates dzingel.sqlite in api/)
npm run dev:web     # http://localhost:4321  (proxies /api to :8787)
```

Environment variables for the API:

| Variable | Default | Notes |
|---|---|---|
| `BETTER_AUTH_SECRET` | none — **required** | At least 32 characters (Better Auth warns on shorter ones). `server.ts` exits with an error if it is unset; the Worker throws on the first request. Generate with `openssl rand -base64 32`. Source: #2 AC8. |
| `TRUSTED_ORIGINS` | `http://localhost:4321` | Comma-separated origins allowed to call cookie-bearing auth endpoints (logout needs a trusted `Origin`). Set it to the public origin of the web app when serving anywhere else. |
| `BETTER_AUTH_URL` | unset (optional) | Public origin of the app; passed to Better Auth as `baseURL` (Node and Worker). |
| `PORT` | `8787` | |
| `DB_FILE` | `dzingel.sqlite` | |

## Checks

```powershell
npm run typecheck -w api
npm run typecheck -w web    # astro check (@astrojs/check is installed; runs in CI)
npm test -w api             # vitest run + typecheck of the test files
npm test -w web             # vitest run, including DOM tests (happy-dom, Astro container)
npm run test:scripts        # node --test "scripts/*.test.mjs": smoke check, CI/wrangler config
npm run smoke -- https://your-site.example   # read-only smoke check (or set PUBLIC_URL)
```

CI (`.github/workflows/ci.yml`) runs these checks plus the web build on every PR and push to `main`;
see `docs/deployment.md`. The smoke check exits 0 on pass, 1 on a failed check or network error and
2 on a missing or invalid URL.

**API tests** (`api/test/`, Vitest) build their own app per test with an in-memory database, so no
state is shared. `npm test -w api` also type-checks the test files through `api/tsconfig.test.json`;
`api/tsconfig.json` itself still includes only `src`. The app forces Better Auth's origin and CSRF
checks on, so they hold under `NODE_ENV=test`; `auth-origin.test.ts` still resets `NODE_ENV` to
exercise the library's own default path. The shared harness turns rate limiting off; `rate-limit.test.ts`
turns it on. Test fixtures are synthetic.
Tool choice per `context/testing-strategy.md`; set up in #1 and extended under epic #11.

**Web tests** (`web/test/`, Vitest): `lib.test.ts` and `validation.test.ts` cover the client logic
in `web/src/lib` (api client, form helpers; the client validation rules in
`web/src/lib/validation.ts` are pinned to the API's rules by tests). `web/test/dom/` holds DOM tests
(happy-dom plus the Astro container renders pages) for the page criteria of #6-#10: register, login,
top panel, add/edit quote and quote list. The DOM harness never reaches the real network; API
replies are stubbed. **Not testable there** and still to be checked by hand in a real browser: real
Tab order and focus trapping in `<dialog>`, Escape closing dialogs, autofocus on `showModal`,
visible focus styles and contrast.

For the test results reported by `tester` for this epic, see the Verification section of the ADRs
under `docs/adr/`.

## Migrations

- Files in `api/migrations/` are numbered `NNNN_description.sql`:
  `0001_init` (groups, quotes), `0002_auth` (Better Auth tables), `0003_groups_membership`
  (`group_members`, `created_by`), `0004_group_invites`.
- On boot `node-db.ts` creates a `schema_migrations` table and applies every `NNNN_*.sql` file not
  yet recorded in it, in filename order, each in its own transaction (rolled back on error).
  Re-running is a no-op. See ADR 0006.
- Cloudflare: `npm run migrate -w api` applies migrations to the remote D1 database using
  wrangler's own tracking.
- Never edit a migration that has been applied anywhere; add a new one.
