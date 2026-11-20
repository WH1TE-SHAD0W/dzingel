# Workflow: GitHub Issues → agents → PR

**GitHub Issues is the ticket and feature management system.** The repository is whatever `origin`
points to (`git remote get-url origin`). Every change starts from an issue and ends in a PR that
closes it.

## Lifecycle

```
idea ──/ticket──▶ issue (status:triage)
                    │ refined: acceptance criteria + labels + milestone
                    ▼
                 status:ready ──/build-feature #N──▶ status:in-progress
                    │  developer → tester → documenter → reviewer
                    ▼
                 PR "Closes #N" (status:in-review) ──merge──▶ closed
```

## Issue types

| Type | Template | Label | Contains |
|---|---|---|---|
| Epic | `.github/ISSUE_TEMPLATE/epic.yml` | `type:epic` | Goal, requirement IDs, a task list of child issues |
| Feature | `feature.yml` | `type:feature` | User story, numbered acceptance criteria, requirement IDs |
| Bug | `bug.yml` | `type:bug` | Steps to reproduce, expected vs actual, acceptance criteria for the fix |
| Chore | `chore.yml` | `type:chore` | Tooling / CI / docs task with a definition of done |

## Labels

| Group | Labels |
|---|---|
| Type | `type:epic` `type:feature` `type:bug` `type:chore` |
| Status | `status:triage` `status:ready` `status:in-progress` `status:in-review` `status:blocked` |
| Priority | `priority:high` `priority:medium` `priority:low` |
| Area | `area:api` `area:web` `area:db` `area:infra` `area:docs` `area:security` |
| Existing | `accessibility` `good first issue` `question` … (GitHub defaults kept) |

The `issue-manager` agent can create the missing labels (`github-issues` skill → *Bootstrap labels*).

## Definition of done (checked by `reviewer`)

1. Every acceptance criterion of the issue is met and covered by at least one test.
2. `npm run typecheck -w api` passes; tests pass (once Vitest exists).
3. Both DB adapters (`node-db.ts`, `d1-db.ts`) still work for any schema/query change.
4. No quote text/context in logs; synthetic data only in tests.
5. `docs/` updated; ADR written for any decision that constrains future work.
6. PR body links the issue with `Closes #N`.

## Agents

See `CLAUDE.md` → *Agent team*. Entry points:

- `/ticket <idea>` — draft and file an issue through `issue-manager`.
- `/build-feature <issue#>` — run the full supervised loop for one issue.
- Ask for a single agent directly: "use the reviewer agent on the current diff".
