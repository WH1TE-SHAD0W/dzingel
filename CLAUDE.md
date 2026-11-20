# džingel — repository instructions

A privacy-first, self-hostable web app where a group of friends keeps its situational inside jokes
("džingels") together with the context that makes them understandable. 3-tier: Astro (`web/`) →
Hono (`api/`) → SQLite (node:sqlite self-host, Cloudflare D1 in the current deployment).

## Sources of record
- **Intent:** `context/` (distilled from `proposal.md`). Start at `context/README.md`. Requirement
  IDs (`FR-xx`, `NFR-xx`, `SEC-xx`) live in `context/requirements.md`.
- **Tickets:** **GitHub Issues** in the repository behind `origin` (`git remote get-url origin`).
  Resolve `owner/repo` from `origin` for every `gh` call — never from the folder name or memory.
  Take the issue number from the request; if it cannot be fetched, stop and say so — never
  substitute a similar issue. State the `owner/repo#N — title` you actually fetched in your first
  reply.
- **How it works today:** `docs/` (API reference, development, deployment, workflow, ADRs).
- When ticket, context and code disagree: follow the ticket for that ticket's scope, and report the
  disagreement. Don't silently "fix" `context/`.

## 1. Boundaries
- Application code: `api/src/`, `api/migrations/`, `web/src/`, `web/worker/` — owned by `developer`.
- Tests: `**/*.test.ts`, `api/test/`, `web/test/` — owned by `tester`.
- Documentation exception: `documenter` may write under `docs/` (incl. `docs/adr/`). This does not
  permit code or test changes.
- `context/` is human-owned intent; edit only when the human asks.
- Never change `wrangler.jsonc` bindings/IDs, deploy (`npm run deploy:*`), or apply remote D1
  migrations unless the human explicitly asks.
- Only `issue-manager` writes to GitHub Issues; every other agent reads them (hook-enforced).
  Only `pr-manager` opens/edits PRs and `pr-reviewer` comments on them; no agent merges or approves.
- Keep the architecture: no ORM, no extra database, no server-side framework swap
  (`docs/adr/0001-*`). Route handlers use only the `Db` interface so node:sqlite **and** D1 both
  work (`docs/adr/0002-*`). Never edit an applied migration — add the next numbered one.

## 2. Planning & execution
- Before editing, output a concise plan: which files change, which tests are added, and which
  acceptance criterion each change serves.
- One issue = one coherent slice. If a ticket spans unrelated concerns, ask to split it.

## 3. Testing obligation
- Every business-logic change needs at least one automated test, one per acceptance criterion
  (`context/testing-strategy.md`). Vitest against `createApp(nodeDb(":memory:"))`.
- Synthetic fixtures only (`alex.dev@example.org`, group "Test Crew") — never real quotes or people.
- Never claim tests pass without running them; quote the actual summary line.

## 4. Privacy & security (`context/security-and-privacy.md`)
- Quote `text`/`context` are personal data about real people, often minors: never log them, never
  echo them in errors, never send them to third parties. Use the `pii-sanitizer` skill.
- Validate every input server-side; parameterised SQL only. Render user content with
  `textContent`, never `innerHTML`.
- No external fonts/CDNs/analytics in the frontend. The repo is **public** — no secrets, no real
  data in issues, commits or fixtures.

## 5. Destructive operations
- Never run destructive or irreversible commands: `rm -rf`, `Remove-Item -Recurse -Force`,
  `git clean -f`, `git reset --hard`, `git push --force`, `DROP TABLE`, piping a download into a
  shell, deleting workers/D1/issues. A PreToolUse hook blocks these
  (`.claude/hooks/block-dangerous-commands.mjs`).
- If a task appears to need one, stop and explain what you would run and why. The human decides.

## 6. Commit often
- Commit after **every coherent, verified step**: a route plus its typecheck passing, a test file
  that is green, a docs update. Don't let a session finish with uncommitted work.
- Work for an issue happens on a branch `<type>/<N>-<slug>` (e.g. `feat/12-search-all-groups`),
  never directly on `main`.
- One logical change per commit, Conventional Commit format, `Refs #N` in the body (`git-commit`
  skill). Stage only the files you changed — never `git add -A`.
- Each agent commits its own slice: `developer` code, `tester` tests, `documenter` docs.
- Never push, force-push, amend a pushed commit or skip hooks without the human asking.
  Exception: in `/build-feature N`, `pr-manager` pushes that issue's branch and opens its PR after
  the reviewer approves (running the command is the human asking). Nobody merges; the human does.

## Agent team (`.claude/agents/`)
| Agent | Does | Writes |
|---|---|---|
| `issue-manager` | Gathers tickets verbatim; drafts, files, splits, labels, triages GitHub issues | GitHub Issues only |
| `developer` | Implements one issue | `api/`, `web/` source |
| `tester` | Tests per acceptance criterion, edge cases, runs the suite | tests only |
| `documenter` | ADRs and docs | `docs/` only |
| `reviewer` | Read-only audit → APPROVE / BLOCK | nothing |
| `pr-manager` | After APPROVE: pushes the issue branch, opens the PR from the template | the PR (push + `gh pr create`) |
| `pr-reviewer` | Verifies the opened PR (body, links, diff, CI) and posts one comment; ends the flow | one PR comment |
| `feature-builder` | Supervisor: gather → implement → test → document → review → open PR → verify PR → report | nothing (delegates) |

Entry points: `/ticket <idea>`, `/build-feature <N>`, `/git-commit`, `/git-pr-summary`, `/adr`.
Process, labels and definition of done: `docs/workflow.md`.

## Commands
```
npm install
npm run dev:api            # Hono on :8787 (node:sqlite, DB_FILE=dzingel.sqlite)
npm run dev:web            # Astro on :4321, proxies /api
npm run typecheck -w api
npm test -w api            # once Vitest is set up (backlog E8)
```
Node 24+ is required (`node:sqlite`).
