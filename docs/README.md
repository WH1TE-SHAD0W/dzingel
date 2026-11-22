# docs/ — how the project works

`context/` holds *intent* (what and why, from the proposal). `docs/` holds *how the code does it
today* and the record of decisions. The `documenter` agent owns this folder.

| File | Contents |
|---|---|
| [development.md](development.md) | Local setup, workspace layout, scripts, Snyk dependency scanning |
| [api.md](api.md) | HTTP API reference (generated from `api/src/app.ts`) |
| [deployment.md](deployment.md) | Self-host (target) and Cloudflare (current) deployment |
| [workflow.md](workflow.md) | GitHub Issues → agents → PR workflow, labels, definition of done |
| [adr/](adr/) | Architecture Decision Records (`NNNN-decision-as-statement.md`) |

Keep docs truthful to the code. If code and docs disagree, fix the docs in the same PR as the code,
or file an issue — never leave a known lie in here.
