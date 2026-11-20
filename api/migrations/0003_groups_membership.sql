-- Group membership and authorship (#3). Valid on node:sqlite and Cloudflare D1.
-- Pre-existing groups/quotes keep created_by = NULL; groups without members are visible to nobody.
CREATE TABLE IF NOT EXISTS group_members (
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (group_id, user_id)
);

-- ADD COLUMN with REFERENCES requires a NULL default, which is the case here.
ALTER TABLE groups ADD COLUMN created_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL;
ALTER TABLE quotes ADD COLUMN created_by TEXT REFERENCES "user" ("id") ON DELETE SET NULL;

-- (group_id, user_id) lookups use the UNIQUE index; this one serves "groups of a user".
CREATE INDEX IF NOT EXISTS group_members_user_id_idx ON group_members (user_id);
CREATE INDEX IF NOT EXISTS quotes_group_id_created_at_idx ON quotes (group_id, created_at);
CREATE INDEX IF NOT EXISTS quotes_created_by_idx ON quotes (created_by);
