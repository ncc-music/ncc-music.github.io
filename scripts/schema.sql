PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS sets (
  id TEXT PRIMARY KEY,
  audio_key TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  date TEXT NOT NULL DEFAULT '',
  tracklist TEXT NOT NULL DEFAULT '[]',
  published INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0, 1)),
  peaks TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS likes (
  set_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  PRIMARY KEY (set_id, visitor_id)
);
