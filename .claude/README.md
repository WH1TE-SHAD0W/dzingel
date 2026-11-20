# .claude/ — Claude Code setup

Translated from the Copilot structure of the *AI Agent Engineering Workshop* (`.github/` there).

## Map: Copilot → Claude Code

| Workshop (Copilot) | Here (Claude Code) | Notes |
|---|---|---|
| `.github/copilot-instructions.md` | `/CLAUDE.md` | Always loaded |
| `.github/instructions/reviews.instructions.md` (`applyTo:`) | `.claude/rules/*.md` (`paths:`) | Loaded only when matching files are touched: `api`, `migrations`, `web`, `tests` |
| `.github/agents/developer.agent.md` | `agents/developer.md` | Scope: `api/` + `web/` source |
| `.github/agents/tester.agent.md` | `agents/tester.md` | xUnit → Vitest |
| `.github/agents/documenter.agent.md` | `agents/documenter.md` | "no execute tool" → read-only shell hook |
| `.github/agents/reviewer.agent.md` | `agents/reviewer.md` | No Edit/Write + read-only shell hook |
| `.github/agents/feature-builder.agent.md` | `agents/feature-builder.md` + `skills/build-feature` | `tools: Agent(...)` works when run as main agent; the skill runs the same loop from any session |
| *(new)* | `agents/issue-manager.md` + `skills/github-issues`, `skills/ticket` | The only agent that writes to GitHub Issues |
| `github-issues-readonly` / `github-repos-readonly` MCP | `gh` CLI + `hooks/bash-guard.mjs gh-readonly` | Read-only enforced per agent in frontmatter `hooks:` |
| `.github/skills/adr` | `skills/adr` | |
| `.github/skills/git-commit` | `skills/git-commit` | `/git-commit` |
| `.github/skills/git-pr-summary` | `skills/git-pr-summary` | `/git-pr-summary` |
| `.github/skills/pii-sanitizer` | `skills/pii-sanitizer` | C# regex → TypeScript `redact()`, plus "never log quotes" |
| `.github/hooks/guardrails.json` `preToolUse` | `settings.json` → `PreToolUse` → `hooks/block-dangerous-commands.mjs` | One Node script replaces the `.sh` + `.ps1` pair |
| `.github/hooks/guardrails.json` `agentStop` (`dotnet test`) | `settings.json` `Stop` + developer/tester frontmatter `Stop` → `hooks/verify-on-stop.mjs` | Typecheck + tests when `api/` changed; exits 2 on failure |
| `.vscode/mcp.json` | — | Not needed: `gh` is already authenticated |

## Layout

```
CLAUDE.md                     repository instructions (root)
.claude/
  settings.json               shared permissions + hooks (commit this)
  settings.local.json         your personal overrides (git-ignored)
  agents/                     subagents
  skills/                     /ticket /build-feature /git-commit /git-pr-summary /adr + background skills
  rules/                      path-scoped instructions
  hooks/                      Node hook scripts
.github/ISSUE_TEMPLATE/       epic, feature, bug, chore forms
.github/pull_request_template.md
context/                      intent from proposal.md
docs/                         how it works + ADRs
```

## Typical flow

1. `/ticket search across all my groups` → issue-manager drafts → you approve → issue filed.
2. `/build-feature 12` → gather → developer → tester → documenter → reviewer → report.
   (Or `claude --agent feature-builder` and give it the issue number.)
3. `/git-commit 12` → `/git-pr-summary 12` → PR with `Closes #12`.
