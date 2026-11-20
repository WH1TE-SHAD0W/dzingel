---
name: git-commit
description: "Inspects staged git changes and writes a Conventional Commit message (feat, fix, test, docs, refactor, chore, ci) with a 72-character subject that references the GitHub issue, then commits. Use when the user asks to commit."
argument-hint: "[issue number]"
disable-model-invocation: true
---

# Skill: Git commit (`git-commit`)

1. `git status` and `git diff --staged`. If nothing is staged, show `git status` and ask what to
   stage — never `git add -A` blindly; never stage `.env`, `*.sqlite`, `.wrangler/` or
   `.claude/settings.local.json`.
2. Find the issue: `$ARGUMENTS`, else the branch name (`feat/12-…`), else ask.
3. Write the message:
   ```
   <type>(<scope>): <imperative summary, ≤72 chars, no period>

   <why, wrapped at 72 — what problem this solves, not a file list>

   Refs #<N>          (or "Closes #<N>" only if this single commit completes the issue)
   ```
   - `type`: feat · fix · test · docs · refactor · chore · ci · perf
   - `scope`: api · web · db · infra · docs · agents
   - One logical change per commit; if the staged diff mixes concerns, propose splitting it.
4. Append any attribution trailer the session requires, then commit with a heredoc. Never
   `--no-verify`, never amend a pushed commit.
