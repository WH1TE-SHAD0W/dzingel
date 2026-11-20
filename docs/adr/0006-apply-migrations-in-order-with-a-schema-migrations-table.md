# 0006. The Node adapter applies migrations in order and records them in `schema_migrations`

- **Status:** Accepted
- **Date:** 2026-11-20
- **Source:** WH1TE-SHAD0W/dzingel#2 (AC7); `.claude/rules/migrations.md` rules 1-3; `api/src/node-db.ts`

## Context
Until #2, `node-db.ts` executed only `0001_init.sql` on boot, so any new migration would never reach
a self-hoster's SQLite file. Cloudflare D1 already tracks applied migrations through wrangler
(`migrations_dir` in `api/wrangler.jsonc`). The same SQL files must work on both (ADR 0002).

## Decision
On startup `nodeDb()` creates `schema_migrations (name PRIMARY KEY, applied_at)`, then applies every
file matching `NNNN_*.sql` that is not recorded, in filename order, each inside a transaction that is
rolled back if the SQL or the bookkeeping insert fails. D1 keeps using wrangler's own tracking
(`npm run migrate -w api`). A migration that has been applied anywhere is never edited; changes are
new numbered files.

## Consequences
- Easy: re-running is a no-op; adding a migration is adding a file; a failed migration leaves the
  database unchanged and stops the server.
- Hard: two tracking mechanisms exist (ours for Node, wrangler's for D1); they are not synchronised.
  SQL must stay in the subset both support, and `ALTER TABLE ... ADD COLUMN` with `REFERENCES` needs a
  NULL default (see 0003).
- Migrations are never run with `wrangler d1 ... --remote` by an agent (`.claude/rules/migrations.md` rule 6).
- A database created before this change has no `schema_migrations` rows, so `0001` would be re-run;
  it is idempotent (`CREATE TABLE IF NOT EXISTS`) but later migrations such as `ALTER TABLE ADD COLUMN`
  are not, so never hand-delete `schema_migrations` rows.
- Editing an applied file silently desynchronises databases, because the name, not the content, is
  what is recorded.

## Verification
Reported by `tester` (re-run by the supervisor): API "Test Files 7 passed (7) / Tests 247 passed
(247)"; web "Test Files 1 passed (1) / Tests 14 passed (14)". No test is named by the supervisor as
covering the migration runner directly; the API suite builds its databases through `nodeDb`, so it
exercises migrations 0001-0004 being applied in order.

## Alternatives considered
- **Keep executing only `0001` and extend by hand:** rejected - every schema ticket would need adapter edits and
  existing databases would silently miss tables.
- **Run all files on every boot relying on `IF NOT EXISTS`:** rejected - `ALTER TABLE ADD COLUMN`
  (0003) fails on a second run.
- **Adopt a migration library:** rejected - adds a dependency (NFR-01/NFR-07 stance, ADR 0002) for ~25 lines of code.
