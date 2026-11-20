# Testing strategy

Source: [`proposal.md`](../proposal.md) — *Proposed Testing and Evaluation*, *Objectives*.

| Kind | Tooling | When | Target |
|---|---|---|---|
| **Functional / unit** | Vitest against `createApp(db)` with an in-memory `node:sqlite` DB (API) and happy-dom + Astro container (web) | Every GitHub Actions run (PRs and pushes to `main`, #13) — Cloudflare deploys only what passed on `main` | Core features: managing groups and quotes |
| **Security — static** | Snyk audit | Every CI/CD run | No high/critical findings |
| **Security — dynamic** | OWASP ZAP baseline scan against a running stack | Every CI/CD run (end-to-end) | No high findings |
| **Performance** | Locust scripts with summaries | Before release / on demand | NFR-01..03: ~200 MB, ~4 % CPU @ 50 concurrent, 100 ms latency |

## Conventions

- Test the API through `createApp(db)` + `app.request(...)` — no network, no real DB file.
- Use `nodeDb(":memory:")` so the real migration SQL runs in every test.
- One test per acceptance criterion of the ticket, named after the criterion, citing the issue
  number in the `describe` block (e.g. `describe("#12 search quotes", …)`).
- **Synthetic data only** (e.g. group "Test Crew", quote "synthetic quote 1",
  `alex.dev@example.org`). Never paste real quotes from a real group.
- Both DB adapters must stay behaviourally equal; when a test depends on SQL dialect behaviour,
  note whether D1 behaves the same.
