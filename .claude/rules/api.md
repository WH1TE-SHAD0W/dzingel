---
paths:
  - "api/src/**"
---

# API module guardrails (Hono)

When modifying or generating code in `api/src/`:

1. **Runtime-neutral handlers.** `app.ts` and anything it imports depend only on the `Db`
   interface (`db.ts`). No `node:*` imports and no D1 types outside `node-db.ts` / `server.ts` and
   `d1-db.ts` / `worker.ts`. If `Db` changes, update **both** adapters (ADR 0002).
2. **Validate every input server-side** (SEC-02), mirroring existing limits: group `name` 1–100,
   quote `text` 1–1000 (trimmed), `context` ≤ 2000, ids are integers. Reject with `400` and a
   generic `{ "error": "…" }` — never echo the input back.
3. **Parameterised SQL only** — `?` placeholders, never string-interpolated values. SQL must run on
   both SQLite and D1.
4. **Status codes:** `201` create, `200` read/update/delete, `400` invalid input, `401`
   unauthenticated, `403` forbidden, `404` unknown id. Return `404` for updates/deletes that change
   no rows.
5. **Authorisation** (once auth exists — epic E1): every route checks the user's role and group
   membership before touching data (SEC-03). A new route without an auth check is a blocker.
6. **Privacy / observability:** never log quote `text`/`context`, group names or user identifiers;
   log ids and outcomes only. Use `redact()` from the `pii-sanitizer` skill for any unavoidable
   free text.
7. **Testing obligation:** every logic change gets at least one Vitest test in `api/test/` using
   synthetic fixtures (written by `tester`).
8. Keep `docs/api.md` in sync (handled by `documenter`).
