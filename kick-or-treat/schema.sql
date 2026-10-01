-- One row per coach. voter_id is the private token stored in the coach's browser cookie.
CREATE TABLE IF NOT EXISTS votes (
  voter_id    TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  team        TEXT NOT NULL,
  name_key    TEXT NOT NULL,          -- normalized "name|team", stops a second vote from a cleared browser
  choices     TEXT NOT NULL,          -- JSON array of exactly 3 option ids
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS votes_name_key ON votes(name_key);

-- Organizer settings (e.g. whether results are visible to everyone).
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
