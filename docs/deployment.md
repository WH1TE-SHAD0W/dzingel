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

Deploying is an outward-facing action — agents must not run these without an explicit request.
