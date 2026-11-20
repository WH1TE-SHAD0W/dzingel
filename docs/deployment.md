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

### Required before the API worker will work with authentication

1. **Secret:** `wrangler secret put BETTER_AUTH_SECRET` (in `api/`; at least 32 random characters).
   Without it the worker throws "BETTER_AUTH_SECRET is not set" on every request.
2. **Compatibility flag:** Better Auth needs Node APIs, so `api/wrangler.jsonc` must contain
   `"compatibility_flags": ["nodejs_compat"]`. **This is not yet in the file** — a human must add it
   (agents may not edit `api/`/config for this record). Source: Better Auth runtime requirement;
   issue #2.
3. **Migrations 0002-0004** are applied to the remote D1 database by `npm run migrate -w api`
   (also run by `npm run deploy:api`). They create the auth tables, `group_members` and
   `group_invites`.
4. **Recommended:** set `BETTER_AUTH_URL` (the public origin, e.g. `https://dzingel.example`) as a
   variable so Better Auth builds correct cookie/origin settings. Optionally set `TRUSTED_ORIGINS`
   (comma-separated extra origins). Auth requests arrive through the web worker's service binding,
   so confirm the `Origin` header reaches the API unchanged before relying on logout.

### Data caveat: existing groups become invisible

Migration 0003 adds `group_members` and `created_by` as empty/NULL. Groups and quotes that existed
before it have no members, so **nobody can see them** (`GET /api/groups` lists member groups only).
The data is not deleted. Whether and how to backfill (e.g. add a chosen user as member of each old
group) is a decision for a human; nothing in the code does it. Source: comment in
`api/migrations/0003_groups_membership.sql`, issue #3.

Deploying is an outward-facing action — agents must not run these without an explicit request.
