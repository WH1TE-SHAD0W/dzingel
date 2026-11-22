# 0009. Run self-hosting as two unprivileged containers with one published port

- **Status:** Accepted
- **Date:** 2026-11-22
- **Source:** WH1TE-SHAD0W/dzingel#20 (AC3, AC5, AC7); NFR-04, NFR-09, SEC-04, SEC-05 in `context/requirements.md`; ADR 0007 (client IP header); `docker-compose.yml`, `api/Dockerfile`, `web/Dockerfile`, `web/nginx.conf`

## Context
Self-hosting is the primary target (`context/architecture.md`) and needs a `docker compose up`
that a friend group's operator can run. The API holds personal data and must not be reachable
except through NGINX, because only NGINX overwrites `X-Forwarded-For`, which the rate limiter keys on
(ADR 0007). The stock `nginx` image runs as root and listens on port 80, and a container running
as root widens the damage of any bug. TLS is out of scope for #20 (SEC-04 is guidance only).

## Decision
`web` (stock `nginx:alpine`, `USER nginx`, uid 101) is the only service with `ports:`; it listens on
8080 with its pid and temp paths under `/tmp`, and its `nginx.conf` overwrites
`X-Forwarded-For` with `$remote_addr`. `api` (`node:24-alpine`, `USER node`, uid 1000) has no
published port; it is an esbuild bundle of `api/src/server.ts` with dependencies installed in the
image. The SQLite file is on the named volume `dzingel-data` at `/data`. The API healthcheck calls
`/api/auth/me` and treats any HTTP response as healthy, with no new health route. The stack serves
plain HTTP; TLS termination is left to a proxy the operator adds. NGINX logs access to stdout with
`log_format private '$time_iso8601 $request_method $uri $status $request_time'`: no query string,
client IP, referer or user agent, because search terms in `?q=` can be quote-text fragments
(CLAUDE.md section 4, `context/security-and-privacy.md`). Found by the reviewer (BLOCK) against the
default `combined` format; fixed in commit eb7ff6a.

## Consequences
- Easy: one published port, no root in either container, no change to application routes.
- The `nginx.conf` is ours, not the image's: a base-image upgrade that changes default paths or
  the nginx user needs the config rechecked. `proxy_set_header X-Forwarded-For $remote_addr;` must
  stay; do not replace it with an appending form without superseding this record and ADR 0007.
- Behind another reverse proxy every client appears as that proxy's address, so they share one
  rate-limit bucket (see `docs/self-hosting.md`). The same happens on Docker Desktop, where the peer
  can be the bridge gateway.
- The health check says "server is up", not "database is usable". A real health route would be an
  API change and needs its own ticket.
- The bundle is built with the esbuild that ships with `tsx`; the Dockerfile looks for it in two
  places because npm may hoist it. If `tsx` changes, the build step may break.
- `BETTER_AUTH_SECRET` is required by compose, but its 32-character minimum is not enforced.
- The access log is minimal on purpose: debugging needs the path and status, not who asked or what
  they searched for. Do not switch to `$request`, `$args`, `$query_string`, `$remote_addr`,
  `$http_referer` or `$http_user_agent` in `log_format` without superseding this record; an operator
  who does so locally takes responsibility for that personal data (`docs/self-hosting.md`).
- The data volume is deleted by `docker compose down -v`; backup is the operator's job.

## Verification
Reported by `tester` (the documenter ran nothing):
- `npm run test:scripts`: `ℹ tests 112`, `ℹ pass 112`, `ℹ fail 0`; the new static tests are in
  `scripts/docker-compose-config.test.mjs`: 31 tests in 8 suites (39 by node's counter, which also
  counts suites).
- Docker 29.6.2 / Compose v5.3.1: both containers healthy; register, login, group and quote through
  NGINX worked; `api` has no published port (`PortBindings={}`); `id -u` 1000 (api) and 101 (web);
  Node v24; a missing secret makes compose refuse naming the variable; a forged `X-Forwarded-For`
  is discarded by NGINX (a stand-in upstream saw only the peer address).

Reported by the developer (Docker, real stack; not re-run by `tester`): after
`GET /api/quotes?group=1&q=secretterm` the web log showed `GET /api/quotes 401` and no query string
or IP (grep count 0).

Not verified: `npm test -w api` and typecheck (no `node_modules` in the worktree); a strict no-change
second `up`; the real API rate limiter behind the compose NGINX end to end (only the developer's
observation of 401 401 401 429 429).

## Alternatives considered
- **`nginxinc/nginx-unprivileged` image.** Not chosen: it adds a second image source to trust for
  little gain; the stock image works as `nginx` user with a small config of our own.
- **Publish the API port as well.** Rejected: a direct request would bypass NGINX and its header
  overwrite, so a client could forge `X-Forwarded-For` and evade the limiter (ADR 0007; #20 AC3).
- **Run the TypeScript with `tsx` in the image.** Not chosen: it needs the dev dependency tree in the
  runtime image; an esbuild bundle with production dependencies is smaller.
- **A dedicated `/api/health` route for the healthcheck.** Rejected for #20: it would change the API
  surface and `docs/api.md` for no behavioural need; any HTTP answer already proves the process serves.
- **Terminate TLS in the stack.** Out of scope (#20): it needs certificates and a domain; documented
  guidance only (SEC-04).
