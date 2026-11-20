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
                    │  developer → tester → documenter → reviewer (APPROVE)
                    ▼
                 status:in-review ── pr-manager: push + PR "Closes #N"
                    │
                    ▼
                 pr-reviewer: verifies the PR, posts one comment ── flow ends
                    │
                    ▼
                 human merges ──▶ closed
```

GitHub Actions (`CI`, `.github/workflows/ci.yml`) runs on every PR and on pushes to `main`. It only
checks. Deployment is done by Cloudflare Workers Builds after merge (`docs/deployment.md`, ADR 0008).
Workers Builds does not wait for CI, so `CI` should be a required check on `main` (human step).

The flow never merges. `pr-reviewer`'s comment says READY TO MERGE or NEEDS CHANGES; the human
decides what happens next. PR bodies use `.github/pull_request_template.md` (What / Tests /
Checklist).

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
2. Typechecks and tests pass, as checked by the `CI` check on the PR (api and web typecheck, api
   and web tests, web build, `npm run test:scripts`).
3. Both DB adapters (`node-db.ts`, `d1-db.ts`) still work for any schema/query change.
4. No quote text/context in logs; synthetic data only in tests.
5. `docs/` updated; ADR written for any decision that constrains future work.
6. PR body links the issue with `Closes #N`.

## Agents

See `CLAUDE.md` → *Agent team*. Entry points:

- `/ticket <idea>` — draft and file an issue through `issue-manager`.
- `/build-feature <issue#>` — run the full supervised loop for one issue, ending with an open PR
  and a verification comment on it.
- Ask for a single agent directly: "use the reviewer agent on the current diff".
