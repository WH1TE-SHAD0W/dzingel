# Security and privacy

Source: [`proposal.md`](../proposal.md) — *Security, Performance*, *Users*, *Security Testing*.

## Privacy stance

- **Privacy first.** The app targets self-hosters; *all data stays on the host owner's machine*.
  "100 % privacy" is achieved by self-hosting, not by a third-party cloud.
- Quotes are inside jokes **about real friends**, often including minors. Treat quote `text` and
  `context` as **personal data**:
  - never write them to logs, error messages or analytics;
  - never send them to an external service (no third-party fonts, CDNs, trackers or telemetry in
    the frontend);
  - never expose them across groups.
- Use only **synthetic** data in tests, fixtures, docs and screenshots (see the `pii-sanitizer` skill).

## Defence in depth (layers named in the proposal)

| Layer | Control | Req |
|---|---|---|
| Browser | Frontend validation (required, maxlength) — convenience only, never trusted | SEC-01 |
| API | Server-side validation of every field; **parameterised SQL only** | SEC-02 |
| API | Authentication, roles, **granular per-user authorisation** | SEC-03 |
| Transport | **HTTPS forced** on every public route | SEC-04 |
| Network | NGINX in a docker network; backend only reachable internally | SEC-05 |
| Pipeline | Security audit on **every CI/CD run** — Snyk (SAST/deps) + OWASP ZAP (DAST) | SEC-07 |

## Minors (7–17) and parental oversight

The proposal requires parental oversight because the app stores data of children. Until the feature
is designed (backlog epic E5), any change that touches user accounts must:

- not add public or anonymous access to quotes;
- not add any field that collects more personal data than needed (data minimisation);
- record the oversight question in the ticket rather than inventing a design.

## Current gaps (as of this file)

- No authentication — every `/api/*` route is open. Highest priority security gap.
- `DELETE /api/quotes/:id` returns `ok` even when nothing was deleted (no 404) and is unauthenticated.
- No security headers / CSP configured.
- No CI, so SEC-07 is not enforced.
