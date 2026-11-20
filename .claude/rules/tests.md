---
paths:
  - "**/*.test.ts"
  - "api/test/**"
  - "web/test/**"
---

# Test guardrails

1. Test through the public surface: `createApp(nodeDb(":memory:"))` + `app.request(...)`.
2. One `describe` per issue (`describe("#12 search quotes", …)`), at least one `it` per acceptance
   criterion, named after the criterion.
3. **Synthetic data only** — `alex.dev@example.org`, "Test Crew", "synthetic quote 1". Never real
   quotes, names or chat excerpts.
4. Each test builds its own fresh in-memory DB; no shared mutable state, no files on disk, no network.
5. Cover the boundary values from `.claude/rules/api.md` (exactly-at and one-over limits) and the
   error statuses, not just the happy path.
