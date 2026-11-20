# Deployment

## Self-host — primary target (not yet packaged)

The proposal's target (`context/architecture.md`): docker-compose with

1. **web** — Astro build served by NGINX; the only exposed container; forces HTTPS; proxies `/api`
   to the API over an internal docker network.
2. **api** — Node + Hono (`api/src/server.ts`), SQLite file on a docker volume (`DB_FILE`).

Dockerfiles, NGINX config and `docker-compose.yml` do not exist yet — backlog epic **E7**. Until
then, a self-hoster can run `npm run dev:api` behind their own reverse proxy and serve `web/dist`.

## Cloudflare — current deployment

| Worker | Config | Role |
|---|---|---|
| `dzingel` | `web/wrangler.jsonc` | Serves `web/dist` as static assets; `/api/*` runs the worker, which forwards to `dzingel-api` via a **service binding** |
| `dzingel-api` | `api/wrangler.jsonc` | Hono on D1 database `dzingel`. `workers_dev: false`, `preview_urls: false` — **not** publicly reachable, only through the service binding |

```powershell
npm run deploy:api   # applies D1 migrations (remote), then deploys the API worker
npm run deploy:web   # astro build + deploy the web worker
```

These are the commands Workers Builds runs (see below). Run by hand only when the human asks.

### Pipeline overview

Source: #17 (epic), #13, #14, #15, #16, NFR-10, ADR 0008.

```
PR / push to main ──▶ GitHub Actions "CI" (checks only, no secrets)
push to main      ──▶ Cloudflare Workers Builds: dzingel-api  (migrate, then deploy)
                  ──▶ Cloudflare Workers Builds: dzingel      (astro build, then deploy)
daily / manual    ──▶ GitHub Actions "Smoke" (read-only GET checks of the public site)
```

- **GitHub Actions only checks.** It holds no Cloudflare credentials and has no deploy step
  (`.github/workflows/ci.yml`, `smoke.yml`; both use `permissions: contents: read`).
- **Cloudflare Workers Builds deploys** both workers on every push to `main`. There is no production
  approval gate. Reason: the maintainer wants hands-on Cloudflare experience, so Cloudflare-native
  tools are preferred when options are otherwise even (ADR 0008).
- **Workers Builds does not wait for GitHub Actions.** CI gates `main` only if the `CI` check is a
  required status check (branch protection, a human step in repository settings, after the workflow
  has run once). Until then a red CI run does not stop a deploy.

### CI (`.github/workflows/ci.yml`, #13)

Runs on `pull_request` and on push to `main`. Node 24, `npm ci` with the npm cache. Steps:
`npm run typecheck -w api`, `npm test -w api`, `npm run typecheck -w web` (`@astrojs/check` is now
installed: the decision for #13 AC4), `npm test -w web`, `npm run build -w web`,
`npm run test:scripts`. A concurrency group cancels superseded runs. Actions are pinned by full commit
SHA with the version in a comment (`actions/checkout` v7.0.1, `actions/setup-node` v7.1.0), #13 AC7.
When bumping an action, update the SHA and the comment together.

### One-time setup of Workers Builds (#14)

Human steps (repo and Cloudflare admin). Agents must not do these (`CLAUDE.md` section 1).

1. **Compatibility flag.** `api/wrangler.jsonc` contains `"compatibility_flags": ["nodejs_compat"]`
   (Better Auth needs Node APIs; #14 AC1, done).
2. **Connect the repository** to Workers Builds for both workers, production branch `main`.
3. **Build token permissions:** Workers Scripts edit for both workers, plus **D1 edit** for
   `dzingel-api` (remote migrations). The default token may lack D1 edit, so check the token screen.
4. **Runtime config in Cloudflare, not GitHub:** for `dzingel-api` set the secret
   `BETTER_AUTH_SECRET` (at least 32 random characters) and the variable `BETTER_AUTH_URL` (public
   origin, e.g. `https://dzingel.example`; `worker.ts` passes it to Better Auth as `baseURL`).
   Optionally `TRUSTED_ORIGINS` (comma-separated extra origins). Never commit these or paste them into
   issues. Auth requests arrive through the web worker's service binding, so confirm the `Origin`
   header reaches the API unchanged before relying on logout.
5. **No secret is stored in GitHub.** No Cloudflare token in GitHub secrets and no GitHub
   Environment (decided against, 2026-11-20).
6. **Repository variable `PUBLIC_URL`** (Settings, Secrets and variables, Variables): the public
   origin of the site, used only by the smoke check. It is a variable, not a secret.
7. **Make `CI` a required check on `main`** (branch protection).
8. **Decide on the data caveat below** before migration 0003 is first applied remotely (#14 AC6).

Migrations 0002-0004 are applied to the remote D1 database by `npm run migrate -w api` (also run by
`npm run deploy:api`). They create the auth tables, `group_members` and `group_invites`.

Recommended Workers Builds settings (from `developer`; **to be verified on the first build**, not yet
confirmed against a real build):

| | `dzingel-api` | `dzingel` |
|---|---|---|
| Root directory | `/` (repo root: the npm-workspaces lockfile is there) | `/` |
| Build command | empty, or `npm ci` if dependencies are not installed automatically | same |
| Deploy command | `npm run deploy:api` | `npm run deploy:web` |
| Production branch | `main` | `main` |
| Non-production branch builds | disabled | disabled or no deploy |
| Build watch paths | not restricted | default |
| Build token | Workers Scripts edit + D1 edit | Workers Scripts edit |

Notes:

- **Discrepancy with #14 AC2:** the ticket names root directories `api/` and `web/`. The repo root is
  recommended instead because of the root lockfile (#14 AC5). Fallback if Workers Builds rejects the
  repo-root layout (it checks the worker name against a wrangler config): root directory `api/` or
  `web/`, build command `cd .. && npm ci`, deploy command `cd .. && npm run deploy:api` (or
  `deploy:web`).
- On the first build, check that `wrangler d1 migrations apply --remote` does not wait for a prompt.
- The web build runs `astro build` twice (wrangler `build.command` and the deploy script). Harmless.

### API deploy (#15)

`npm run deploy:api` = `npm run migrate -w api && npm run deploy -w api`. Remote D1 migrations
apply first. **A failed migration stops the chain, so `wrangler deploy` never runs** (#15 AC3).
Build watch paths are deliberately **not** restricted for `dzingel-api`: it builds on every push to
`main`, so schema and code stay in lockstep (#15 AC1). Non-production branch builds are disabled
(the API has `preview_urls: false`). Do not add an `echo` of secrets or wrangler debug flags to the
commands (#15 AC5).

### Web deploy and deploy order (#16)

`npm run deploy:web` builds with Astro and deploys the `dzingel` worker.

**Deploy order is not enforced.** Workers Builds cannot make the web build wait for the API. The web
worker only needs `dzingel-api` to exist, because of the service binding. So a change that needs both
sides must be **backward compatible**, or the web build must be re-run after the API deploy finished.

### Smoke check (`scripts/smoke-check.mjs`, `.github/workflows/smoke.yml`, #16 option a)

A GitHub Actions job on `workflow_dispatch` and a daily schedule (06:17 UTC). No secrets. The base
URL comes from the repository variable `PUBLIC_URL`. Checks: `GET /` returns 200, and
`GET /api/auth/me` without a session returns 401 with a JSON body (proves the service binding).
GET only, no cookies, redirects not followed, 15 s timeout. It logs only check name, path and
status, never bodies. Exit codes: 0 pass, 1 a check or the network failed, 2 URL missing or invalid.
**The scheduled run fails until `PUBLIC_URL` is set.** Run it locally:

```powershell
npm run smoke -- https://your-site.example
$env:PUBLIC_URL = "https://your-site.example"; npm run smoke
```

### Failure cases (#14 AC8)

- **Missing secret or variable in Cloudflare, or insufficient build-token permission** (for example
  no D1 edit): the Workers Builds build fails (the migration or deploy command errors) and the
  previous deployment keeps serving.
- **`BETTER_AUTH_SECRET` missing at runtime:** the API worker throws "BETTER_AUTH_SECRET is not set"
  on every request, so every `/api` call fails and the smoke check fails (`/api/auth/me` is not a
  401 JSON).
- **`PUBLIC_URL` unset:** the smoke run fails with exit code 2.

### Rollback (#15 AC6)

Cloudflare dashboard: the worker, Deployments, pick an earlier version and roll back. Or from the
CLI: `wrangler rollback` (in `api/` or `web/`). Rollback changes only the worker code. **Migrations
are forward-only:** it does not undo schema changes, so a fix for a bad migration ships as a **new
numbered migration**. Never edit an applied one. Automatic rollback is out of scope.

### Rate limiting and client IP

Better Auth's rate limiter is always on (register/login: 3 requests per 10 s per IP per path; other
auth paths 100 per 10 s). Counters are in memory, so on Cloudflare they are **per isolate**, not
global: a best-effort limit. The client IP is read from `cf-connecting-ip` (`api/src/worker.ts`),
which Cloudflare's edge sets and the web worker's service-binding request keeps. If that header is
missing or invalid, all such clients share one bucket per path. Source: `api/src/auth.ts`, ADR 0007.

**Self-host behind NGINX:** the API reads `X-Forwarded-For` (Better Auth default, `server.ts`). NGINX
must **overwrite** it, not append: `proxy_set_header X-Forwarded-For $remote_addr;`. If it passes a
client-supplied value through, a client can rotate values and evade the limit. The NGINX config does
not exist yet (epic E7); it must include this line.

### Data caveat: existing groups become invisible

Migration 0003 adds `group_members` and `created_by` as empty/NULL. Groups and quotes that existed
before it have no members, so **nobody can see them** (`GET /api/groups` lists member groups only).
The data is not deleted. Whether and how to backfill (e.g. add a chosen user as member of each old
group) is a decision for a human; nothing in the code does it. Source: comment in
`api/migrations/0003_groups_membership.sql`, issue #3.

Deploying is an outward-facing action — agents must not run `npm run deploy:*` or apply remote migrations without an explicit request.
