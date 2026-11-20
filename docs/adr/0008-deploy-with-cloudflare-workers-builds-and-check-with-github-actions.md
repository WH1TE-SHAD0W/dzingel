# 0008. Deploy with Cloudflare Workers Builds, use GitHub Actions for checks only

- **Status:** Accepted
- **Date:** 2026-11-20
- **Source:** WH1TE-SHAD0W/dzingel#17 (epic), #13, #14, #15, #16; NFR-10 in `context/requirements.md`; decision recorded by the human in `context/architecture.md` and `context/backlog.md` (E9), PR #18.

## Context
The app runs as two Cloudflare Workers (`dzingel-api` with D1, `dzingel` web with a service binding to the API). Releases were manual (`npm run deploy:*`). We want automatic checks on every PR and automatic deploys on `main`. The maintainer wants hands-on Cloudflare experience, so Cloudflare-native tools are preferred when options are otherwise even. The repository is public, so keeping Cloudflare credentials out of GitHub is also valuable.

## Decision
GitHub Actions runs checks only (`ci.yml` on PRs and pushes to `main`, `smoke.yml` on a schedule and on demand). It holds no Cloudflare secrets and has no deploy step. Cloudflare Workers Builds deploys `dzingel-api` (remote D1 migrations, then `wrangler deploy`) and `dzingel` on every push to `main`. There is no production approval gate. Build watch paths are not restricted for the API, so schema and code stay in lockstep. The smoke check is a GitHub Actions job (option a of #16) reading the repo variable `PUBLIC_URL`.

## Consequences
- No Cloudflare token lives in GitHub. The build token and runtime secrets (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`) are set in Cloudflare only.
- Workers Builds does not wait for GitHub Actions. CI gates `main` only once it is a required check (branch protection, a human step). Until then a red CI run does not stop a deploy.
- API-before-web order is not enforced. The web worker only needs `dzingel-api` to exist. Changes needing both sides must be backward compatible, or the web build must be re-run after the API deploy.
- A failed migration fails the build, so no API code deploys (`deploy:api` chains migrate and deploy). Migrations are forward-only: rolling back code does not undo schema, so fixes ship as a new migration.
- Workers Builds settings live in the Cloudflare dashboard, not in the repo, so they are not reviewable in PRs and must be documented (`docs/deployment.md`). The recommended repo-root layout differs from the root directories named in #14 AC2 and is to be verified on the first build.
- The scheduled smoke run fails until `PUBLIC_URL` is set.
- Do not add Cloudflare credentials to GitHub, or a deploy job to CI, without superseding this record.

## Verification
Reported by `tester` (the documenter ran nothing):
- `npm run test:scripts`: "tests 81 / pass 81 / fail 0"
- API: "Test Files 9 passed (9) / Tests 353 passed (353)"
- Web: "Test Files 6 passed (6) / Tests 232 passed (232)"
- `npm run typecheck -w web`: "0 errors, 0 warnings, 0 hints"

Not verified: a real Workers Builds run, the first CI run on GitHub, and the smoke check against the live site. No such result was provided.

## Alternatives considered
- **GitHub Actions deploys with a Cloudflare API token in GitHub secrets.** Rejected: it puts a deploy-capable credential in GitHub and gives the maintainer less hands-on Cloudflare experience, which the human prefers when options are otherwise even. Its one advantage, enforcing check-before-deploy and API-before-web order in one workflow, is accepted as lost (see Consequences).
- **A production approval gate (GitHub Environment with reviewers).** Rejected by the human on 2026-11-20 (#14 out of scope): not wanted for this project.
- **Restricting API build watch paths to `api/`.** Rejected (#15 AC1): schema and code must stay in lockstep, so the API builds on every push to `main`.
- **Smoke check as the last step of the Workers Builds deploy command (option b of #16).** Not chosen: a failing smoke step would fail a build after the deploy already happened, and the public URL would have to live in Cloudflare build settings. A separate job stays visible in GitHub and can run on demand.
