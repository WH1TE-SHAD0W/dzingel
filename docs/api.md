# HTTP API

Source of truth: [`api/src/app.ts`](../api/src/app.ts) and [`api/src/auth.ts`](../api/src/auth.ts).
All routes are prefixed with `/api` and return JSON. Origin of the contract: GitHub issues
WH1TE-SHAD0W/dzingel#2 (auth), #3 (membership), #4 (user directory), #5 (invites); epic #11.

## Conventions

- **Every route needs a valid session except `POST /api/auth/register` and `POST /api/auth/login`.**
  Without one the answer is `401 { "error": "unauthorized" }` (#2 AC6, #3 AC7, #5 AC6).
- **Session cookie.** Set by register/login by Better Auth: `HttpOnly`, `SameSite=Lax`, `Path=/`; it
  gets `Secure` when served over HTTPS. The token is never returned in a response body. The cookie
  is refreshed or cleared on any authenticated request when Better Auth says so.
- **Request bodies must be sent as `Content-Type: application/json`.** Auth routes reject anything
  else with `400` (blocks login/register CSRF from cross-site forms; see ADR 0004).
- **Errors** are `{ "error": "<generic message>" }`; input is never echoed back. Validation errors on
  register also carry a `fields` object.
- **Status codes:** `201` created, `200` ok, `400` invalid input, `401` no session, `403` forbidden,
  `404` not found, `409` conflict, `429` too many requests.
- Ids in paths and in `?group=` must be positive integers (digits only, no sign or leading zero);
  anything else is `400`.

## Auth

Usernames are 3-30 characters of `a-z 0-9 _ .` (lowercase only). Passwords are 8-128 characters.

### `POST /api/auth/register`  (no session required)
Body: `{ "username": string, "password": string }`
- `201` -> `{ "user": { "id", "username" } }` and a session cookie (the new user is signed in). The
  password is never returned.
- `400` -> `{ "error": "invalid input", "fields": { "username"?: "...", "password"?: "..." } }`
  for rule violations; plain `{ "error": "invalid input" }` for a non-JSON content type or malformed
  body.
- `409` -> `{ "error": "username taken", "fields": { "username": "is already taken" } }`; nothing is
  created.
- `429` -> `{ "error": "too many requests" }` (see Rate limiting).

### `POST /api/auth/login`  (no session required)
Body: `{ "username": string, "password": string }`
- `200` -> `{ "user": { "id", "username" } }` and a session cookie.
- `401` -> `{ "error": "invalid credentials" }` - the same answer for an unknown user, a wrong
  password and a malformed username, so it does not reveal which was wrong (#2 AC3).
- `400` -> missing/non-string fields or non-JSON content type. `429` as above.

### `POST /api/auth/logout`
Ends the session; the old cookie no longer authenticates (#2 AC4).
- `200` -> `{ "ok": true }` and a cookie-clearing `Set-Cookie`.
- `403` -> `{ "error": "forbidden" }` when the `Origin` header is missing or not trusted. Logout
  carries a cookie, so Better Auth's origin check applies: the browser's own `Origin` (the app's
  origin, or one listed in `TRUSTED_ORIGINS`) must be present. A look-alike origin (suffix or
  different port) is refused.

Login and register carry no cookie and are not subject to the Origin check; the JSON-only rule
protects them instead.

### `GET /api/auth/me`
`200` -> `{ "user": { "id", "username" } }` - `401` without a valid session (#2 AC5).

### Raw Better Auth endpoints
Other Better Auth routes under `/api/auth/*` (get-session, sign-out, ...) are served by Better Auth
itself. **`/api/auth/sign-up/*` and `/api/auth/sign-in/*` are blocked: `404 { "error": "not found" }`**
so account creation and login can only go through the wrappers above (which validate input and
return the uniform errors). The wrappers re-dispatch to Better Auth's router, so its CSRF checks and
rate limiting still apply.

### Rate limiting
Better Auth's built-in rate limiter is active in production and answers `429`
(`{ "error": "too many requests" }` from the wrappers). Better Auth enables it by default only when
`NODE_ENV` is `production`, so the limit itself is not covered by the automated tests. Limits are
Better Auth's defaults (not configured in this repository).

## Groups

Every group/quote route is scoped to the caller's groups. **A group or quote the caller cannot
access answers `404`, exactly like one that does not exist** (no existence leak; ADR 0005; #3 AC5).

### `GET /api/groups`
Groups the caller is a member of, ordered by name then id.
`200` -> `[{ "id": 1, "name": "Test Crew" }]`

### `POST /api/groups`
Body: `{ "name": string }` - trimmed, 1-100 chars. The creator becomes the first member.
`201` -> `{ "id": 1, "name": "Test Crew" }` - `400` -> `{ "error": "invalid name" }`

Inviting to a group is documented under Invites.

## Quotes

Order of checks: input validation (`400`) first, then membership (`404`). So a malformed request
answers `400` whether or not the group exists.

### `GET /api/quotes?group=<id>&q=<keyword>`
Quotes of one group, newest first (`created_at DESC, id DESC`).
- `group` required, positive integer; `q` optional, at most 100 characters (`400` otherwise).
- `q` matches `text` or `context` as a substring. `%`, `_` and `\` in `q` are **literal**, not LIKE
  wildcards. Matching is case-insensitive for ASCII (SQLite `LIKE`).
- `200` -> `[{ "id", "group_id", "text", "context", "created_at", "author" }]`. `author` is the
  author's username, `null` if the quote predates authorship or the author was deleted.
- `404` if the caller is not a member of the group (or it does not exist).

### `GET /api/quotes/:id`
One quote, same shape as a list item.
- `400` if `:id` is not a positive integer.
- `404` if it does not exist **or** is in a group the caller is not a member of.

### `POST /api/quotes`
Body: `{ "group_id": integer, "text": string, "context"?: string }`
`text` trimmed, 1-1000 chars; `context` truncated to 2000 chars; `created_by` is the caller.
`201` -> `{ "id": 7 }` - `400` invalid input (checked first) - `404` caller not a member of `group_id`.

### `PUT /api/quotes/:id`
Body: `{ "text": string, "context"?: string }` - same rules as create. Any member of the quote's group
may edit.
`200` -> `{ "ok": true }` - `400` invalid id or body - `404` unknown or not in the caller's groups.

### `DELETE /api/quotes/:id`
Any member of the quote's group may delete.
`200` -> `{ "ok": true }` - `400` invalid id - `404` unknown or not in the caller's groups.

## Users directory

### `GET /api/users?q=<substring>`
Find users to invite. Returns only `id` and `username`; the caller is excluded (cannot invite
yourself).
- `q` is trimmed; empty `q` (or none) returns `[]` rather than everyone. `q` longer than 30
  characters (the max username length) is `400`.
- Substring match, `%`/`_`/`\` literal, ordered by username, at most 20 results.
- `200` -> `[{ "id": "...", "username": "..." }]`

## Invites

### `POST /api/groups/:id/invites`
Body: `{ "username": string }` (trimmed, lowercased, must match the username rule).
- `201` -> `{ "id", "group_id", "invitee_id", "status": "pending" }`
- `400` invalid group id or username.
- `403` -> `{ "error": "forbidden" }` if the caller is **not a member** of the group, whether or not
  the group exists. This is deliberately 403, not 404 (#5 AC2; ADR 0005).
- `404` unknown username.
- `409` -> `{ "error": "already a member or invited" }` if the invitee is already a member or has a
  pending invite for this group. A previously answered invite does not block a new one.

### `GET /api/invites`
The caller's pending invites, newest first.
`200` -> `[{ "id", "group_id", "group_name", "inviter", "created_at" }]` (`inviter` may be `null` if
that user was deleted).

### `POST /api/invites/:id/accept`
Makes the caller a member and marks the invite accepted.
`200` -> `{ "ok": true, "group_id": 1 }`

### `POST /api/invites/:id/decline`
Marks the invite declined. `200` -> `{ "ok": true }`

For both: `400` invalid id; `404` if the invite does not exist **or is addressed to someone else**
(only the invitee can respond); `409` -> `{ "error": "invite already answered" }` if it is no longer
pending, including when a concurrent request answered it first.
