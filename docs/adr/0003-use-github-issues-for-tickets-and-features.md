# 0003. Use GitHub Issues as the single ticket and feature management system

- **Status:** Accepted
- **Date:** 2026-11-20
- **Source:** Project owner's instruction when setting up the Claude Code agent structure; `CLAUDE.md` → *Sources of record*

## Context
Work is done by a human plus Claude Code subagents. Agents must implement against acceptance
criteria they can fetch themselves, not against a pasted summary, and the ticket must be traceable
from PR to requirement.

## Decision
Every unit of work is a GitHub issue in the repository behind `origin`. Epics, features, bugs and
chores use the templates in `.github/ISSUE_TEMPLATE/` and the label taxonomy in `docs/workflow.md`.
Only the `issue-manager` agent creates or edits issues (via the `gh` CLI); every other agent reads
issues read-only, enforced by the `gh-readonly` hook in its frontmatter. PRs close issues with
`Closes #N`.

## Consequences
- Easy: one backlog for humans and agents; full traceability issue → PR → ADR.
- Hard: agents need an authenticated `gh` CLI; offline work cannot fetch tickets.
- Do not track work in TODO files or `context/backlog.md` once it is filed — the issue is the record.

## Verification
No test result was provided — process decision.

## Alternatives considered
- **Jira / external tracker:** rejected — extra account and integration for an open-source, self-hosting audience.
- **Markdown backlog in the repo:** kept only as a seed (`context/backlog.md`); no status, assignment or PR linking.
