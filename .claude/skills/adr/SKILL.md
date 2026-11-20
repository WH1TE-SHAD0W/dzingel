---
name: adr
description: "Writes an Architecture Decision Record into docs/adr/ using the project's standard format. Use when a decision needs recording, when the user mentions an ADR or a decision record, or after a change that locks in a constraint future contributors must not casually undo."
---

# Skill: Architecture Decision Record (`adr`)

## When a decision is worth a record
Write one when the decision constrains future work and the reason is not obvious from the code: a
technology deliberately rejected, a boundary deliberately drawn, a privacy or child-safety
obligation, a trade-off with a real cost, anything that must hold on both node:sqlite and D1. Do
**not** write one for a naming choice or a refactor.

## Steps
1. Find the highest existing number in `docs/adr/`. Yours is the next one, zero-padded to four digits.
2. Name the file `NNNN-kebab-case-title.md`. The title states the decision, not the topic:
   `0004-hash-passwords-with-scrypt`, not `0004-passwords`.
3. Fill every section of the template. No placeholders left behind.
4. Cite the origin of the constraint — the GitHub issue (`owner/repo#N`), a requirement ID from
   `context/requirements.md`, `proposal.md`, or the relevant section of `CLAUDE.md` /
   `.claude/rules/*.md`.
5. Include the exact test result supplied by `tester` in Verification, attributed to that agent. If
   no result was supplied, state that no test result was provided; never invent one.

## Template

```markdown
# NNNN. <the decision, as a statement>

- **Status:** Accepted
- **Date:** <YYYY-MM-DD>
- **Source:** <issue, requirement ID, proposal section, or instruction file that drove this>

## Context
What was true that forced a decision, including the constraint that makes the obvious alternative wrong.

## Decision
What we do now, in the present tense. One paragraph.

## Consequences
What this makes easy, what it makes hard, and what a future contributor must not do without revisiting this record.

## Verification
The exact test summary reported by `tester`, attributed to that agent. If no test result was provided, say so.

## Alternatives considered
Each rejected option and the specific reason it was rejected. "It was worse" is not a reason.
```

## Constraints
- **Always:** one decision per record, and an honest Consequences section including the annoying ones.
- **Never:** claim a verification you did not perform. Attribute test results to whoever ran them.
- **Never:** edit an accepted ADR to change its decision. Supersede it with a new record and mark
  the old one `Superseded by NNNN`.
