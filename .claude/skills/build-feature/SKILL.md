---
name: build-feature
description: "Run the supervised end-to-end loop for one GitHub issue from a normal session: issue-manager gathers the ticket, developer implements, tester tests, documenter documents, reviewer audits, pr-manager opens the PR, pr-reviewer verifies it and comments, then a report. Use when the user asks to build, implement or deliver issue #N end to end."
argument-hint: "<issue number>"
disable-model-invocation: true
---

# /build-feature — supervise one issue end to end

Issue: `#$ARGUMENTS`

For this task you act as the **feature-builder supervisor**. Read
`.claude/agents/feature-builder.md` and follow its *Workflow* and *Boundaries* exactly, with these
session rules:

- **Delegate every step** to the named subagent (`issue-manager`, `developer`, `tester`,
  `documenter`, `reviewer`, `pr-manager`, `pr-reviewer`) with the Agent tool. Do not edit files, run tests or touch GitHub
  yourself during this task — the point is the separation of duties.
- Pass each subagent what it needs explicitly (issue number, numbered criteria, previous agent's
  report). Subagents do not see this conversation.
- Stop and ask the human when the gather step reports ambiguities, when a step fails three times,
  or when a subagent reports it could not fetch the issue.
- Specialists commit their own slices on the issue branch (`CLAUDE.md` §6). Invoking
  `/build-feature N` is the human's go-ahead to push that issue's branch and open its PR — done only
  by `pr-manager`, only after the reviewer approved. `pr-reviewer`'s comment on the PR ends the flow.
  Nobody merges.
- Finish with the report from step 10 of the workflow.
