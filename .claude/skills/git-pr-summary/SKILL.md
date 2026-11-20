---
name: git-pr-summary
description: "Inspects the branch diff against main and writes an auditor-ready pull request description linking the GitHub issue (Closes #N), mapping acceptance criteria to tests, with a verification checklist; opens the PR with gh on request."
argument-hint: "[issue number]"
disable-model-invocation: true
---

# Skill: Pull request summary (`git-pr-summary`)

1. `git log --oneline main..HEAD` and `git diff main...HEAD --stat`, then read the diff.
2. Fetch the issue (`$ARGUMENTS` or from commits/branch): `gh issue view N --comments`.
3. Produce the body:

```markdown
## Summary
<2–3 sentences: what changed and why>

Closes #N

## Acceptance criteria
| # | Criterion (verbatim from the issue) | Evidence (test name / file) |
|---|---|---|

## Changes
- `path` — what and why

## Verification
- [ ] `npm run typecheck -w api` — <result>
- [ ] `npm test -w api` — <verbatim summary, or "no test runner yet">
- [ ] Both DB adapters considered (node:sqlite, D1)
- [ ] No quote text / personal data in logs; synthetic test data only
- [ ] `docs/` updated · ADR: <path or "none needed">
- [ ] Reviewer recommendation: <APPROVE / …>

## Notes for reviewers
<risks, follow-ups, decisions made without being told>
```

4. Show it. Only on the human's go-ahead: push the branch and run
   `gh pr create --base main --title "<conventional title>" --body-file <tmp>`, then ask
   `issue-manager` to set `status:in-review` on the issue.
