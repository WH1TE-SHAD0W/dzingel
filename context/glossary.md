# Glossary

| Term | Meaning |
|---|---|
| **džingel** | (Slovak) A situational inside joke of a close group, reused by referring back to the situation it came from. The app's core object. |
| **Quote** | The stored form of a džingel: its `text` plus `context`. |
| **Context** | The description of the situation that makes the quote understandable to someone who was not there. As important as the quote itself. |
| **Group** | A circle of friends that shares a set of quotes. |
| **Admin** | The person who self-hosts the app and manages users and server settings. |
| **Guardian / parent** | An adult with oversight over a minor's (7–17) account. Feature not yet designed. |
| **Self-host** | Running the stack on your own hardware (NAS, home lab) via docker-compose. The primary deployment target. |
| **D1** | Cloudflare's SQLite-compatible database, used by the current Cloudflare deployment. |
| **Workers Builds** | Cloudflare's built-in CI/CD: it pulls the GitHub repo and deploys a Worker on push, so no Cloudflare token is stored in GitHub. Used to deploy `dzingel-api` and `dzingel` (epic #17). |
| **Tier** | One of presentation (Astro/NGINX), application (Hono), data (SQLite). |
| **MVP** | User, quote and server management with simple keyword search. |
