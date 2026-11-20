# Requirements

Source: [`proposal.md`](../proposal.md). IDs are stable — cite them in issues, ADRs and tests.
Status reflects the code at the time this file was written (`api/src/app.ts`, `web/src/`).

Legend: ✅ implemented · 🟡 partial · ⬜ not started

## Functional requirements

| ID | Requirement | Proposal section | Status |
|---|---|---|---|
| FR-01 | Users **log in** through a login page and receive a designated **role**. | Presentation tier; Application tier | ⬜ |
| FR-02 | Actions are **authorised by role**; users only act within their permissions. | Application tier | ⬜ |
| FR-03 | Admin manages **user identities** (create / disable users, assign roles). | Actors | ⬜ |
| FR-04 | Admin has a **settings page** to adjust the server; a settings icon appears in the header when an admin is logged in. | Presentation tier | ⬜ |
| FR-05 | **Group management** for quote sharing (create groups, manage membership). | Presentation tier; Implementation objectives | 🟡 create/list groups only, no membership |
| FR-06 | Inside a group, a **rolling list of quotes**, newest first. | Presentation tier | ✅ |
| FR-07 | **Create** a quote with its situational **context**, through a validated form. | Application tier | ✅ |
| FR-08 | **Edit** an existing quote and its context on an edit page. | Presentation tier | 🟡 via browser `prompt()`, no edit page |
| FR-09 | **Share** quotes with a group. | Application tier ("create, edit, share and search") | 🟡 implicit via group, no membership |
| FR-10 | **Simple keyword search** across past quotes and their context, from a search bar at the top. | Presentation tier; Implementation objectives | ✅ (scoped to one group) |
| FR-11 | Header shows the **logo** (and the admin settings icon, see FR-04). | Presentation tier | 🟡 text title only |
| FR-12 | **Parental oversight** for users aged 7–17. | Users | ⬜ shape undefined |
| FR-13 | **Delete** a quote. *(Present in code; not explicitly in the proposal.)* | — | ✅ |

## Non-functional requirements

| ID | Requirement | Proposal section |
|---|---|---|
| NFR-01 | Memory footprint ≈ **200 MB** for the running stack. | Objectives; Security, Performance |
| NFR-02 | CPU ≈ **4 %** at **50 concurrent connections / 50 req/s**. | Objectives; Security, Performance |
| NFR-03 | Response latency target **100 ms**. | Security, Performance |
| NFR-04 | **Self-hostable** via docker-compose; each tier in its own container. | Architectural overview |
| NFR-05 | **Clean, accessible** UI usable by vulnerable and older users. | Presentation tier; Users |
| NFR-06 | **Polished design**. | Implementation objectives |
| NFR-07 | Minimal client JavaScript (Astro). | Proposed technology stack |
| NFR-08 | Each tier **replaceable** without breaking the others (e.g. DB migration). | Architectural overview |
| NFR-09 | **Open source** with a deployment guide. | Architectural overview |
| NFR-10 | CI/CD on **GitHub Actions**; git-tag builds push containers to Docker Hub; Watchtower suggested for updates. For the Cloudflare deployment: GitHub Actions runs the checks (no Cloudflare secrets in GitHub) and Cloudflare Workers Builds deploys both workers on push to `main` (decided 2026-11-20, epic #17). | Proposed technology stack; human decision |

## Security requirements

See [security-and-privacy.md](security-and-privacy.md) for detail.

| ID | Requirement |
|---|---|
| SEC-01 | **Frontend validation** of inputs. |
| SEC-02 | **Server-side validation** of every input (the form "has validation to provide security layer"). |
| SEC-03 | **Granular server-side authorisation** per user. |
| SEC-04 | **HTTPS forced** on every public route. |
| SEC-05 | NGINX in a docker network; backend reachable **only** on the internal network. |
| SEC-06 | All data stored on the host owner's machine (privacy). |
| SEC-07 | **Security audit on every CI/CD run** (Snyk SAST + OWASP ZAP DAST). |

## MVP scope

**In scope:** an MVP web app covering user management, quote management (create / edit / share /
search) and server management.

**Out of scope (for now):**

- Media uploads (no media or large files are stored at all).
- Cloud deployment as the primary target — privacy-first self-hosting comes first.
- Lifting the "2 menu bar" limitation and SQLite concurrency limits — left as upgrade paths.
- RAG search — a future enhancement.
