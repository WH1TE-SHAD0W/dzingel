-- Group invites (#5). Valid on node:sqlite and Cloudflare D1.
-- An invite row is kept after it is answered (status + responded_at) as a simple history.
CREATE TABLE IF NOT EXISTS group_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  inviter_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  invitee_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at TEXT
);

-- At most one pending invite per (group, invitee); answered invites do not block a new one.
CREATE UNIQUE INDEX IF NOT EXISTS group_invites_pending_uq
  ON group_invites (group_id, invitee_id) WHERE status = 'pending';
-- Serves "my pending invites".
CREATE INDEX IF NOT EXISTS group_invites_invitee_status_idx ON group_invites (invitee_id, status);
