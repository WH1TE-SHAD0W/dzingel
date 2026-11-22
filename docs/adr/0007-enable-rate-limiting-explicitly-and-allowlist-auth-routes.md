# 0007. Enable Better Auth rate limiting explicitly and allowlist the auth routes

- **Status:** Accepted
- **Date:** 2026-11-20
- **Source:** WH1TE-SHAD0W/dzingel#2 (AC1, AC3, AC4); epic WH1TE-SHAD0W/dzingel#11 review round 1; SEC-02, SEC-03 in `context/requirements.md`; extends ADR 0004; `api/src/auth.ts`, `api/src/app.ts`, `api/src/server.ts`, `api/src/worker.ts`

## Context
Review of epic #11 found three things ADR 0004 had assumed and the code did not deliver. (1) Better
Auth turns its rate limiter on only when `NODE_ENV` is `production` at load time; nothing sets that,
and Workers do not populate `process.env`, so login and register were effectively unthrottled.
(2) Only `/api/auth/sign-up/*` and `/api/auth/sign-in/*` were blocked; other Better Auth endpoints
(get-session, list-sessions, update-user, change-password, ...) were still reachable and could
return the session token or bypass our validation. (3) Better Auth disables its origin/CSRF checks
when `NODE_ENV` is `test` or `TEST` is truthy, so an environment variable could switch them off.
A rate limiter keyed by client IP is only as good as the IP header: a client can forge
`X-Forwarded-For` unless the proxy overwrites it.

## Decision
`createAuth` sets `rateLimit: { enabled: options.rateLimit ?? true, storage: "memory" }` (Better Auth
defaults: 3 requests per 10 s per IP per path for register/login, which dispatch to sign-up/sign-in;
100 per 10 s otherwise), forces `disableOriginCheck: false` and `disableCSRFCheck: false`, and takes
the client IP from `ipAddressHeaders`: `["x-forwarded-for"]` on Node, `["cf-connecting-ip"]` in the
Worker. `/api/auth/*` is an allowlist: only POST register, POST login, POST logout and GET me are
served, and every other path and method answers 404. `BETTER_AUTH_URL` is passed as `baseURL` on both
runtimes (optional). Invite accept/decline also require `application/json` with a JSON object body.

## Consequences
- Easy: brute-force of login is throttled by default; no raw Better Auth endpoint can leak or
  alter session data; tests cannot weaken the origin checks by environment.
- Hard / annoying: the store is in memory, so the limit is per Node process or per Workers isolate,
  best effort and not global, and resets on restart.
- NGINX must overwrite the header: `proxy_set_header X-Forwarded-For $remote_addr;`. If it passes a
  client value through, a client can rotate values and evade the limit. The NGINX config
  (`web/nginx.conf`, added in #20) includes this line (`docs/self-hosting.md`).
- A missing, multi-value or invalid IP header puts all such clients into one shared bucket per path,
  so they can lock each other out.
- Adding a new auth endpoint means adding an explicit route in `app.ts`; do not widen the catch-all
  or re-expose raw Better Auth routes without superseding this record. Do not remove the explicit
  `rateLimit`, `disableOriginCheck`, `disableCSRFCheck` settings.
- Tests that create many sessions quickly must pass `rateLimit: false` to the harness; the
  rate-limit tests use unique IPs because Better Auth's memory store is module-level.

## Verification
Reported by `tester` (re-run and confirmed by the supervisor): API "Test Files 9 passed (9) / Tests
353 passed (353)"; web "Test Files 6 passed (6) / Tests 232 passed (232)". Relevant API files:
`api/test/rate-limit.test.ts`, `api/test/auth-allowlist.test.ts`, `api/test/auth-origin.test.ts`.
Not covered by automated tests: behaviour behind a real NGINX or Cloudflare edge (header overwriting).
I (documenter) ran no tests.

## Alternatives considered
- **Leave Better Auth's default (production only):** rejected - nothing sets `NODE_ENV=production`
  and Workers have no `process.env`, so the limiter would never run.
- **Block only sign-up/sign-in (the 0004 approach):** rejected - a denylist misses every other
  Better Auth endpoint, including future ones added by library upgrades.
- **Shared store (database or KV) for global limits:** not chosen - adds a table or binding and a
  write per auth request; best-effort per-process limiting was accepted for now. Revisit if abuse
  is seen.
- **Trust `X-Forwarded-For` on Cloudflare:** rejected - `cf-connecting-ip` is set by the edge and
  cannot be forged by the client.
