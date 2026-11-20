# context/ — what we are building and why

This folder is the **source of record for intent**. It is distilled from [`proposal.md`](../proposal.md)
and is what every agent reads before planning work. It answers *what* and *why*; the `docs/` folder
answers *how* the code currently does it.

| File | Contents |
|---|---|
| [project-overview.md](project-overview.md) | Problem statement, what a "džingel" is, justification, objectives |
| [users-and-actors.md](users-and-actors.md) | User groups (skilled, children 7–17, vulnerable, 65+) and actors (developer, admin, user) |
| [requirements.md](requirements.md) | Numbered functional and non-functional requirements, MVP scope, out of scope |
| [architecture.md](architecture.md) | Proposed 3-tier design, tech stack, and where the current code diverges |
| [domain-model.md](domain-model.md) | Entities (users, groups, quotes), roles, current vs target schema |
| [security-and-privacy.md](security-and-privacy.md) | Defence in depth, privacy stance, minors and parental oversight |
| [testing-strategy.md](testing-strategy.md) | Unit, security (Snyk, OWASP ZAP), performance (Locust) targets |
| [backlog.md](backlog.md) | Proposed epics and tickets derived from the proposal, ready to file as GitHub issues |
| [glossary.md](glossary.md) | Project vocabulary |

## Rules for this folder

- **Requirement IDs are stable.** `FR-xx` / `NFR-xx` / `SEC-xx` are cited from GitHub issues, ADRs and
  tests. Never renumber; mark a removed requirement `~~withdrawn~~` instead.
- **Humans own intent.** Agents may *propose* changes to `context/`, but only edit it when the human
  explicitly asks. If code and context disagree, flag it — do not silently "fix" either side.
- **The GitHub issue wins for a single ticket.** When a ticket's acceptance criteria are more specific
  than this folder, follow the ticket and note the difference in your report.
