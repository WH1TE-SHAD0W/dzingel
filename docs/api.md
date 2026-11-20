# HTTP API

Source of truth: [`api/src/app.ts`](../api/src/app.ts). All routes are prefixed with `/api`, accept and
return JSON. **No authentication yet** (see `context/security-and-privacy.md`).

## Groups

### `GET /api/groups`
Returns all groups ordered by name.
`200` → `[{ "id": 1, "name": "Test Crew" }]`

### `POST /api/groups`
Body: `{ "name": string }` — trimmed, 1–100 chars.
`201` → `{ "id": 1, "name": "Test Crew" }` · `400` → `{ "error": "invalid name" }`

## Quotes

### `GET /api/quotes?group=<id>&q=<keyword>`
Quotes of one group, newest first (`created_at DESC, id DESC`). `q` matches `text` or `context`
with SQL `LIKE %q%` (case-insensitive for ASCII in SQLite).
`200` → `[{ "id", "group_id", "text", "context", "created_at" }]`

### `POST /api/quotes`
Body: `{ "group_id": integer, "text": string, "context"?: string }`
`text` trimmed, 1–1000 chars; `context` truncated to 2000 chars.
`201` → `{ "id": 7 }` · `400` → `{ "error": "invalid input" }`

### `PUT /api/quotes/:id`
Body: `{ "text": string, "context"?: string }` — same rules as create.
`200` → `{ "ok": true }` · `400` invalid input · `404` → `{ "error": "not found" }`

### `DELETE /api/quotes/:id`
`200` → `{ "ok": true }` — currently returned even when the id does not exist.
