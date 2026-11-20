---
name: ticket
description: "Draft and (after confirmation) file a GitHub issue — feature, bug, chore or epic — from a one-line idea or a backlog item in context/backlog.md, using the issue-manager agent."
argument-hint: "<idea, bug description, or backlog id like E3>"
disable-model-invocation: true
---

# /ticket — turn an idea into a GitHub issue

Input: `$ARGUMENTS`

1. Delegate to the **issue-manager** agent in **Draft** mode: give it the input verbatim and ask for
   the full issue (type, title, labels, milestone, body per the `github-issues` skill), with
   requirement IDs from `context/requirements.md` and suggested acceptance criteria. If the input is
   a backlog id (e.g. `E3`), draft the epic and its child issues from `context/backlog.md`.
2. Show the draft(s) to the human. Ask exactly what to change, or whether to file as-is.
3. On a clear yes, delegate to **issue-manager** in **File** mode with the approved draft(s) and the
   explicit instruction to create them. For more than 5 issues, say the count in that instruction.
4. Report the created issue URLs. Do not start implementation — that is `/build-feature <N>`.
