# 0002. Keep all data access behind the `Db` interface so node:sqlite and Cloudflare D1 both work

- **Status:** Accepted
- **Date:** 2026-11-20
- **Source:** `api/src/db.ts`, `api/src/node-db.ts`, `api/src/d1-db.ts`, commit `e13fc5d`; NFR-08 in `context/requirements.md`

## Context
The proposal's primary deployment is self-hosted Node + SQLite. The repository also deploys to
Cloudflare Workers with D1 (`api/wrangler.jsonc`). The two runtimes have different SQLite drivers:
synchronous `node:sqlite` versus asynchronous D1 prepared statements.

## Decision
Route handlers in `api/src/app.ts` depend only on `Db { all, run }` from `api/src/db.ts`, received
through `createApp(db)`. Each runtime provides an adapter (`nodeDb`, `d1Db`) and an entry point
(`server.ts`, `worker.ts`). SQL is written in the subset both SQLite and D1 support, with `?`
positional parameters only.

## Consequences
- Easy: one codebase for both deployments; tests can run against `nodeDb(":memory:")`.
- Hard: no driver-specific features (transactions API, `RETURNING` differences) unless added to the
  interface for both adapters.
- Never import `node:*` modules or D1 types in `app.ts`. Any interface change must update both
  adapters in the same PR.

## Verification
No test result was provided — the repository has no test suite yet (backlog E8).

## Alternatives considered
- **Self-host only:** would drop the existing Cloudflare deployment already in use.
- **An ORM/query builder supporting both:** rejected — adds weight against NFR-01/NFR-07 for two methods' worth of abstraction.
