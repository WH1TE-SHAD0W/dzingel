---
name: github-issues
description: "Conventions and gh CLI commands for džingel's GitHub Issues ticket and feature management: issue types and templates, label taxonomy, status flow, acceptance-criteria format, epics with child issues, milestones, and bootstrapping labels. Use whenever creating, refining, triaging, labelling or reporting on GitHub issues."
---

# Skill: GitHub Issues conventions (`github-issues`)

Always resolve the repository first and pass it explicitly:

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)   # from origin
```

## Issue types → template → label

| Type | Title format | Template | Labels |
|---|---|---|---|
| Epic | `Epic: <outcome>` | `.github/ISSUE_TEMPLATE/epic.yml` | `type:epic`, `priority:*`, `area:*` |
| Feature | `<verb> <thing>` e.g. `Search quotes across all my groups` | `feature.yml` | `type:feature`, `status:*`, `priority:*`, `area:*` |
| Bug | `<symptom> when <condition>` | `bug.yml` | `type:bug`, `status:*`, `priority:*`, `area:*` |
| Chore | `<verb> <tooling/docs thing>` | `chore.yml` | `type:chore`, `status:*`, `area:*` |

## Body format (feature)

```markdown
## User story
As a <user group from context/users-and-actors.md>, I want <capability> so that <benefit>.

## Acceptance criteria
1. <observable, testable behaviour — include the HTTP status / UI state>
2. <error case: what happens on invalid input>
3. <privacy/authorisation case when relevant>

## Requirements
FR-xx, SEC-xx (context/requirements.md)

## Out of scope
- <explicitly excluded>

## Notes
Links to ADRs, designs, related issues. Part of #<epic>.
```

Rules for acceptance criteria: numbered; each one independently testable; observable behaviour, not
implementation; at least one error/edge case; one authorisation/privacy criterion for any endpoint
touching user data. Amendments go in a comment headed `AC update:` and are also edited into the
body, so the body is always the current truth.

## Status flow (exactly one `status:*` label on an open issue)

`status:triage` → `status:ready` (criteria agreed) → `status:in-progress` → `status:in-review`
(PR open) → closed by PR merge (`Closes #N`). `status:blocked` at any point, with a comment saying
what blocks it.

```bash
gh issue edit N --repo "$REPO" --add-label status:in-progress --remove-label status:ready
```

## Common commands

```bash
gh issue list --repo "$REPO" --state open --label status:ready --json number,title,labels
gh issue view N --repo "$REPO" --comments
gh issue create --repo "$REPO" --title "…" --body-file /tmp/issue.md --label type:feature,status:triage,area:api
gh issue edit N --repo "$REPO" --body-file /tmp/issue.md
gh issue comment N --repo "$REPO" --body-file /tmp/comment.md
gh issue edit N --repo "$REPO" --milestone "MVP"
gh api repos/$REPO/milestones -f title="MVP" -f description="User, quote and server management"
```

Write bodies to a temp file in the session scratchpad (or `$TMPDIR`), never inline multi-line text.

## Epics

1. Create each child feature/chore issue (with `Part of epic: <epic title>` in Notes).
2. Create the epic with a task list referencing the children:
   ```markdown
   ## Goal
   <outcome, requirement IDs>
   ## Issues
   - [ ] #12 Users table and migration
   - [ ] #13 Login and logout endpoints
   ```
3. Edit each child's Notes to `Part of #<epic>`.
4. Record the mapping in `context/backlog.md` (`E1 → #11`) only when asked.

## Bootstrap labels (run once, only when asked)

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
mk() { gh label create "$1" --repo "$REPO" --color "$2" --description "$3" --force; }
mk type:epic         3E4B9E "Large outcome made of several issues"
mk type:feature      A2EEEF "New user-facing capability"
mk type:bug          D73A4A "Something isn't working"
mk type:chore        CFD3D7 "Tooling, CI, docs, refactor"
mk status:triage     FBCA04 "Needs refinement"
mk status:ready      0E8A16 "Acceptance criteria agreed; ready to build"
mk status:in-progress 1D76DB "Being built"
mk status:in-review  5319E7 "PR open"
mk status:blocked    B60205 "Blocked — see latest comment"
mk priority:high     B60205 "Do next"
mk priority:medium   FBCA04 "Soon"
mk priority:low      C2E0C6 "Eventually"
mk area:api          0052CC "Hono API (api/)"
mk area:web          5319E7 "Astro frontend (web/)"
mk area:db           006B75 "Schema, migrations, Db adapters"
mk area:infra        555555 "Docker, NGINX, Cloudflare, CI"
mk area:docs         0075CA "docs/ and context/"
mk area:security     E99695 "Auth, privacy, hardening"
```

`--force` updates an existing label instead of failing, so the script is safe to re-run.
