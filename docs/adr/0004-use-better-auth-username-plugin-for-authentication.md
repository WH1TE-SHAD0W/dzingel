# 0004. Authenticate with Better Auth's username plugin, behind thin wrappers, with no real email

- **Status:** Accepted (extended by 0007: auth route allowlist and explicit rate limiting)
- **Date:** 2026-11-20
- **Source:** WH1TE-SHAD0W/dzingel#2; FR-01, FR-02, SEC-02, SEC-03 in `context/requirements.md`; `api/src/auth.ts`, `api/src/app.ts`

## Context
Users include children and older people; the product must not ask for an email address (#2 user
story, out of scope: email collection and reset). Better Auth requires an `email` on every user and
is the chosen library. Its raw `sign-up`/`sign-in` endpoints return library-specific errors and would
let clients bypass our validation and the uniform "invalid credentials" answer (#2 AC1, AC3). Login
and register requests carry no cookie, so Better Auth's origin check does not apply to them, which
leaves login CSRF open to cross-site HTML forms.

## Decision
Authentication uses Better Auth with the `username` plugin (`displayUsername: false`; usernames
`[a-z0-9_.]{3,30}`, passwords 8-128). Every user's `email` column holds a placeholder
`<random UUID>@users.dzingel.invalid` that is never shown or used; a UUID is used rather than
the username, so the unique `email` column never depends on a user-chosen value, the placeholder
is not guessable from a username, and it discloses nothing. Our routes `/api/auth/register`, `/login`, `/logout` and `/me` wrap
Better Auth: they validate input, map errors to a uniform shape, and re-dispatch the request to
Better Auth's own router (`auth.handler`) so its CSRF/origin checks and rate limiting still run. The
raw `/api/auth/sign-up/*` and `/api/auth/sign-in/*` paths answer 404. Register and login accept only
`Content-Type: application/json`, which a cross-site form cannot send without a CORS preflight; this
closes login CSRF. The signing secret comes from `BETTER_AUTH_SECRET`; it is required: the Node server (`server.ts`) exits at
startup without it, and the Worker (`worker.ts`) throws "BETTER_AUTH_SECRET is not set" on every
request.

## Consequences
- Easy: no email handling, nothing to leak or verify; session handling, hashing and rate limiting
  are the library's, not ours.
- Hard: no password reset by email; a forgotten password currently has no recovery path.
- Logout must receive a trusted `Origin` (`TRUSTED_ORIGINS`), otherwise 403.
- Better Auth's default session table stores the client **IP address and user agent**
  (`session.ipAddress`, `userAgent` in migration 0002). This is personal data collected by default
  and is **an open privacy question for minors**: whether to disable or minimise it is a human
  decision (`context/security-and-privacy.md`) and has not been made.
- Rate limiting: this record originally assumed Better Auth's limiter was active in production; that
  was wrong (it is on only when `NODE_ENV` is `production`, which nothing sets, and Workers do not
  populate `process.env`). Corrected by ADR 0007, which enables it explicitly.
- Never re-expose the raw sign-up/sign-in routes, and never relax the JSON-only rule, without
  superseding this record. Cloudflare deployment additionally needs `nodejs_compat` and the secret
  (see `docs/deployment.md`).
- The `user` table's column names and the other auth tables must match what the library expects
  (migration 0002 was derived from Better Auth 1.7.26); upgrading the library may need a new
  migration.

## Verification
Reported by `tester` (re-run by the supervisor): API "Test Files 7 passed (7) / Tests 247 passed
(247)"; web "Test Files 1 passed (1) / Tests 14 passed (14)". `npm test -w api` now also
type-checks the test files (`api/tsconfig.test.json`). The Origin requirement on logout is covered
by `api/test/auth-origin.test.ts`; rate limiting was not covered at that time (it is now, see ADR 0007). UI criteria are not
covered by automated tests.

## Alternatives considered
- **Hand-rolled sessions and scrypt hashing:** rejected - security-critical code we would have to
  maintain and audit; Better Auth was the issue's chosen approach (#2 Notes).
- **Collect a real email:** rejected - contradicts #2's user story and minors' data minimisation.
- **Placeholder email derived from the username:** rejected - ties an internal column to a mutable,
  user-visible value and would be guessable; a random UUID is neither.
- **Expose Better Auth's endpoints directly:** rejected - bypasses our validation and the uniform
  credential error that must not reveal whether the username or password was wrong.
- **Call the Better Auth API in-process from the wrappers instead of re-dispatching:** rejected -
  would skip its router-level CSRF/origin checks and rate limiting.
