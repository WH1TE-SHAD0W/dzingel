# Proposed backlog

Derived from [`requirements.md`](requirements.md) and the gaps in [`architecture.md`](architecture.md).
This is a **seed list**, not the live backlog — the live backlog is **GitHub Issues** in the repository
behind `origin`. Ask the `issue-manager` agent to file these (`/ticket` or
"file epic E1 from context/backlog.md").

Once an item is filed, add its issue number here, e.g. `E1 → #3`.

## E1 — Authentication and roles  *(FR-01, FR-02, FR-03, SEC-03)* — priority: high
- [ ] `users` table + migration (both node:sqlite and D1)
- [ ] Login / logout endpoints with secure session cookie; password hashing
- [ ] Role model (`admin`, `user`) and an authorisation middleware for Hono
- [ ] Protect every existing `/api/*` route; 401/403 tests for each
- [ ] Login page (accessible form, clear error messages)
- [ ] First-run admin bootstrap for self-hosters

## E2 — Group membership and sharing  *(FR-05, FR-09)* — priority: high, depends on E1
- [ ] `group_members` table + migration
- [ ] Invite / add / remove members (admin or group owner)
- [ ] Scope all quote queries to groups the user belongs to

## E3 — Quote editing UX  *(FR-07, FR-08, FR-06, NFR-05, NFR-06)* — priority: medium
- [ ] Dedicated create/edit page replacing `prompt()` dialogs
- [ ] Delete with accessible confirmation; API returns 404 for unknown id
- [ ] Polished, accessible design pass (contrast, focus, font sizes, mobile)
- [ ] Logo in header (FR-11)

## E4 — Search  *(FR-10)* — priority: medium
- [ ] Decide: search within the current group vs across all the user's groups
- [ ] Search bar at top of the page, debounced, with an empty-state message

## E5 — Parental oversight  *(FR-12)* — priority: medium, needs design first
- [ ] Spike: define what oversight means (view-only access for a guardian? approval of new groups?)
- [ ] Record the decision as an ADR before implementation

## E6 — Admin settings  *(FR-03, FR-04)* — priority: medium, depends on E1
- [ ] Settings page + settings icon in header (admins only)
- [ ] User management UI (create, disable, reset password, assign role)

## E7 — Self-host packaging  *(NFR-04, NFR-09, SEC-04, SEC-05)* — priority: high
- [ ] Dockerfile for API (Node + node:sqlite, volume for DB file)
- [ ] Dockerfile for web (Astro build → NGINX), NGINX proxies `/api` to the API container
- [ ] `docker-compose.yml` with an internal network; only NGINX exposed
- [ ] HTTPS guidance (reverse proxy / certificates) in the deployment guide

## E8 — Testing and CI  *(NFR-10, SEC-07, testing strategy)* — priority: high
- [x] Add Vitest to `api`, first tests for existing group/quote endpoints → #1
- [ ] GitHub Actions: install, typecheck, test on every PR → #13 (under E9)
- [ ] Snyk + OWASP ZAP in the pipeline
- [ ] Tag-based container build and push to Docker Hub
- [ ] Locust performance script and a documented baseline against NFR-01..03

## E9 — CI/CD to Cloudflare  *(NFR-10)* — priority: high → epic #17
Decided 2026-11-20: GitHub Actions runs checks only, with no Cloudflare secrets; Cloudflare Workers
Builds deploys `dzingel-api` and `dzingel` on push to `main`; no production approval gate for now.
- [ ] Verify every PR with GitHub Actions (tests, typecheck, web build) → #13
- [ ] Cloudflare prerequisites: `nodejs_compat`, worker secret `BETTER_AUTH_SECRET`, connect both
      workers to the repo in Workers Builds (build token with D1 edit for migrations) → #14
- [ ] `dzingel-api` deploys via Workers Builds: remote D1 migrations, then `wrangler deploy` → #15
- [ ] `dzingel` deploys via Workers Builds, plus a post-deploy smoke check (`/` 200,
      `/api/auth/me` 401) → #16
Goal behind E9: the human wants hands-on experience with Cloudflare infrastructure (2026-11-20), so
Cloudflare-native tools are preferred where the choice is otherwise even.
