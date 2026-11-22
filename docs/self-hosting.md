# Self-hosting with docker-compose

Source: WH1TE-SHAD0W/dzingel#20, NFR-04, NFR-09, SEC-04, SEC-05 (`context/requirements.md`),
ADR 0007, ADR 0009. Out of scope here: Docker Hub push (backlog E8), Watchtower, TLS termination.

## What runs

`docker-compose.yml` at the repo root builds and starts two containers:

| Service | Image | Role |
|---|---|---|
| `web` | `web/Dockerfile`: Astro build served by stock `nginx:alpine` | The **only** published port (`${WEB_PORT:-8080}` on the host, `8080` in the container). Serves the static site and proxies `/api/` to `http://api:8787` |
| `api` | `api/Dockerfile`: `node:24-alpine`, esbuild bundle of `api/src/server.ts` | Hono on port 8787, **no `ports:`**: reachable only from `web` over the compose network |

Both run as an unprivileged user (`api` as `node`, uid 1000; `web` as `nginx`, uid 101). `web` waits
for `api` to be healthy (`depends_on: condition: service_healthy`). The images contain no secrets,
no data and no external fonts or CDNs.

## Quick start

```sh
cp .env.example .env
# edit .env: set BETTER_AUTH_SECRET (see below)
docker compose up --build
```

Then open `http://localhost:8080`. Migrations run on boot and are idempotent (ADR 0006).

## Configuration

Set values in `.env` (read by compose) or in the shell environment. `.env` is for you only: never
commit it and never paste it into an issue.

| Variable | Default in compose | Notes |
|---|---|---|
| `BETTER_AUTH_SECRET` | none, **required** | Signs sessions. If unset (or empty), `docker compose up` refuses to start and the message names the variable; no value is printed. Use at least 32 random characters. Generate one with `openssl rand -base64 32`. **Compose does not check the length**: a shorter value starts fine and Better Auth only warns, so check it yourself. |
| `BETTER_AUTH_URL` | `http://localhost:8080` | Public origin of the site, passed to Better Auth as `baseURL`. Set it to the public `https://` origin when serving anywhere else. |
| `TRUSTED_ORIGINS` | `http://localhost:8080` | Comma-separated origins allowed to call cookie-bearing auth endpoints (logout needs a trusted `Origin`). Must contain the public origin users type into the browser, otherwise logout fails. |
| `WEB_PORT` | `8080` | Host port published by `web`. The container side is always 8080. |
| `DB_FILE` | fixed to `/data/dzingel.sqlite` | Set by compose on the `api` service, not read from `.env`. It points into the named volume; do not move it out of `/data` or the data stops being persistent. |

`PORT` is set to `8787` inside the `api` image and is not meant to be changed (NGINX and the
healthcheck use 8787).

## Reverse proxy and client IP (rate limiter)

The API's rate limiter (3 register/login requests per 10 s per client IP per path; ADR 0007) reads
the client IP from `X-Forwarded-For` on Node. The bundled NGINX config (`web/nginx.conf`) therefore
**overwrites** it:

```
proxy_set_header X-Forwarded-For $remote_addr;
```

It must stay `$remote_addr`, never `$proxy_add_x_forwarded_for` and never a pass-through of the
client's header. If a client-supplied value reached the API, the client could rotate values and
evade the limit. Reason: ADR 0007; ticket #20 AC7. The same file also sets `Host`, and
`X-Forwarded-Proto`.

Consequences when you add your own proxy in front (for TLS, below):

- NGINX then sees only **your proxy's address** as `$remote_addr`, so every client shares one rate-limit
  bucket per path and can lock each other out (ADR 0007: a single bucket). Your proxy must be the
  **sole entry point** to the stack and must itself set or overwrite its forwarding headers. Do not
  publish `WEB_PORT` on a public interface when a proxy in front is meant to be the only way in:
  bind it to loopback by editing the `ports:` mapping, for example `"127.0.0.1:8080:8080"`.
- On **Docker Desktop (Windows/macOS)** the peer address NGINX sees can be the Docker bridge
  gateway rather than the real client, so all clients may share one bucket there too. Observed by
  `tester`; a Linux Docker host is the intended target.
- The limiter's counters are in memory: per API process, reset on restart (ADR 0007).

## Data volume

The SQLite file lives in the named volume `dzingel-data`, mounted at `/data` in the `api`
container, file `/data/dzingel.sqlite`. Compose prefixes volume names with the project name (the
directory name by default), so list it with `docker volume ls`; it is typically
`<project>_dzingel-data`. Data survives `docker compose down` and `up`. **`docker compose down -v`
deletes the volume and all data.**

### Backup

Stop the API first so the file is consistent (SQLite may have a `-wal` file next to it), then copy
the volume out with a throwaway container:

```sh
docker compose stop api
docker run --rm -v <project>_dzingel-data:/data:ro -v "$PWD":/backup alpine \
  tar czf /backup/dzingel-backup.tgz -C /data .
docker compose start api
```

Store the archive somewhere private: it contains personal data about real people (SEC-05).

### Restore

```sh
docker compose stop api
docker run --rm -v <project>_dzingel-data:/data -v "$PWD":/backup alpine \
  sh -c "rm -f /data/dzingel.sqlite* && tar xzf /backup/dzingel-backup.tgz -C /data && chown -R 1000:1000 /data"
docker compose start api
```

The `chown` matters: the API runs as uid 1000 and could not write to files owned by root. These
recipes were written from the compose file and have **not** been run by `tester` (see
Verification below); try a restore on a scratch volume before you rely on it.

## HTTPS / TLS

The stack serves **plain HTTP on 8080** and does not terminate TLS (SEC-04; out of scope for #20).
For anything beyond localhost, put a TLS-terminating reverse proxy (Caddy, Traefik, an NGINX or HAProxy of your own, a tunnel)
in front of `web` and forward to `WEB_PORT`. Then:

1. Set `BETTER_AUTH_URL` and `TRUSTED_ORIGINS` to the public `https://` origin.
2. Make the proxy the only way in (see above) and have it send `Host`.
3. Redirect HTTP to HTTPS at that proxy.

Note: `context/architecture.md` describes NGINX "forcing HTTPS"; the shipped config does not, because
there is no certificate to force with. Enforcement lives in the proxy you add.

## Health checks

- `api`: runs `fetch('http://127.0.0.1:8787/api/auth/me')` inside the container and passes on **any
  HTTP response**. It means "the server is up", not "the database is healthy". There is no dedicated
  health route (ADR 0009).
- `web`: `wget` of `http://127.0.0.1:8080/`.

## Troubleshooting

- `required variable BETTER_AUTH_SECRET is missing a value ...`: set it in `.env`.
- Logout answers 403: `TRUSTED_ORIGINS` lacks the origin in the browser address bar.
- Many users get 429 on login: they share one bucket, see "Reverse proxy and client IP".
- The API is not reachable from the host: intended (#20 AC3). Use the web port.

## Verification

Reported by `tester` for #20 (the documenter ran nothing):

- `npm run test:scripts`: `ℹ tests 108`, `ℹ pass 108`, `ℹ fail 0`; 35 are new static tests in
  `scripts/docker-compose-config.test.mjs`.
- Runtime checks on Docker 29.6.2 / Compose v5.3.1: both containers healthy; register, login, group
  and quote through NGINX worked; `api` has no published port (`docker inspect` `PortBindings={}`);
  `id -u` is 1000 (api) and 101 (web); Node v24; a missing secret makes compose refuse and name
  the variable; a forged `X-Forwarded-For` is discarded by NGINX (a stand-in upstream saw only the
  peer address).
- Not verified: `npm test -w api` and typecheck (no `node_modules` in the worktree); a strict
  no-change second `up`; the real API rate limiter behind the compose NGINX end to end (only the
  developer's observation of 401 401 401 429 429); the backup and restore recipes above.
