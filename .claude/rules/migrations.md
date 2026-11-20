---
paths:
  - "api/migrations/**"
  - "api/src/node-db.ts"
  - "api/src/d1-db.ts"
---

# Schema & migration guardrails

1. **Never edit an existing migration** — it may already be applied to D1 or a self-hoster's file.
   Add `NNNN_short_description.sql` with the next number.
2. SQL must be valid on **both** SQLite (node:sqlite) and Cloudflare D1. Prefer `CREATE TABLE IF
   NOT EXISTS`, explicit `REFERENCES`, `TEXT` timestamps with `CURRENT_TIMESTAMP`.
3. `node-db.ts` currently applies only `0001_init.sql` on boot. The first new migration must also
   make the Node adapter apply all migrations in order (and track which ran) — call it out in the
   plan.
4. No blob/media columns (out of scope). Store only the personal data the feature needs (data
   minimisation — minors use this app).
5. Update `context/domain-model.md` via the human / `docs/` via `documenter` when the schema changes.
6. Never run `wrangler d1 migrations apply --remote` or `wrangler d1 execute --remote` yourself.
