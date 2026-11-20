---
name: git-pr-summary
description: "Inspects the branch diff against main and writes a short pull request description from .github/pull_request_template.md (what changed, Closes #N, test summary, checklist); opens the PR with gh on request."
argument-hint: "[issue number]"
disable-model-invocation: true
---

# Skill: Pull request summary (`git-pr-summary`)

1. `git log --oneline main..HEAD` and `git diff main...HEAD --stat`, then read the diff.
2. Fetch the issue (`$ARGUMENTS` or from commits/branch):
   `gh issue view N --json title,body,comments`.
3. Fill [template.md](template.md) (same as `.github/pull_request_template.md`, which GitHub
   uses in its web UI; keep the two in sync) and keep it short:
   - **What:** 1–2 sentences. One `Closes #N` line per issue.
   - **Tests:** the actual summary line from `npm test` (run it; never guess).
   - **Checklist:** tick only what you verified.
   - Optional, only if needed: a `## Notes` section of at most 3 bullets (risks, open decisions).
   - End with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
4. Show it. Only on the human's go-ahead: push the branch and run
   `gh pr create --base main --title "<conventional title>" --body-file <tmp>`, then ask
   `issue-manager` to set `status:in-review` on the issue.
