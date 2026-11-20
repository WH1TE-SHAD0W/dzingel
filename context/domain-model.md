# Domain model

Source: [`proposal.md`](../proposal.md) — *Data Tier*, *Application Tier*, *Actors*; current schema
in [`api/migrations/0001_init.sql`](../api/migrations/0001_init.sql).

## Entities

| Entity | Meaning | Proposal | Current schema |
|---|---|---|---|
| **User** | A person with an identity managed by the admin, holding a role | `users` table | ⬜ missing |
| **Group** | A circle of friends sharing džingels | `groups` table | ✅ `groups(id, name)` |
| **Quote** (džingel) | The quote text **plus the situational context** that makes it understandable | `quotes` table | ✅ `quotes(id, group_id, text, context, created_at)` |
| **Membership** | Which users belong to which group | implied by "group management for quote sharing" | ⬜ missing |
| **Server settings** | Admin-adjustable configuration | "Settings for the admin to adjust server" | ⬜ missing |

## Current schema

```sql
groups (id INTEGER PK AUTOINCREMENT, name TEXT NOT NULL)
quotes (id INTEGER PK AUTOINCREMENT,
        group_id INTEGER NOT NULL REFERENCES groups(id),
        text TEXT NOT NULL,
        context TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)
```

## Validation rules in code today (`api/src/app.ts`)

| Field | Rule |
|---|---|
| `groups.name` | non-empty after trim, ≤ 100 chars |
| `quotes.text` | non-empty after trim, ≤ 1000 chars |
| `quotes.context` | string, truncated to 2000 chars, defaults to `''` |
| `quotes.group_id` | integer |

Changing a limit is a contract change: update the API, the frontend `maxlength`, `docs/api.md` and
the tests together.

## Target additions (not yet designed — each needs a ticket)

- `users` — identity, credential hash, role (`admin` | `user`), optional guardian link for minors.
- `group_members` — `(group_id, user_id, role-in-group)`.
- `quotes.created_by` / `updated_at` — authorship and edit history for the "who said it" context.
- `settings` — key/value server settings.

## Invariants

- A quote always belongs to exactly one group.
- A user may only read or write quotes of groups they are a member of (once auth exists — SEC-03).
- No media/blob columns — out of scope.
