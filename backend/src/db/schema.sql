CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  archived    INTEGER NOT NULL DEFAULT 0,
  github_repo TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS time_entries (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id       INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  description      TEXT,
  started_at       TEXT NOT NULL,
  ended_at         TEXT,
  duration_seconds INTEGER
);

CREATE INDEX IF NOT EXISTS idx_entries_started ON time_entries(started_at);
CREATE INDEX IF NOT EXISTS idx_entries_open    ON time_entries(ended_at) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS entry_links (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id  INTEGER NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  url       TEXT NOT NULL,
  label     TEXT
);

CREATE TABLE IF NOT EXISTS external_events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  source         TEXT NOT NULL,
  event_type     TEXT NOT NULL,
  ref_id         TEXT NOT NULL,
  ref_url        TEXT NOT NULL,
  title          TEXT,
  repo_or_board  TEXT,
  occurred_at    TEXT NOT NULL,
  raw_json       TEXT,
  fetched_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source, event_type, ref_id)
);

CREATE INDEX IF NOT EXISTS idx_events_occurred ON external_events(occurred_at);

CREATE TABLE IF NOT EXISTS sync_state (
  source           TEXT PRIMARY KEY,
  last_synced_at   TEXT,
  last_error       TEXT
);
