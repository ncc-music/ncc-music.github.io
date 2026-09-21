PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS sets (
  id TEXT PRIMARY KEY,
  audio_key TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  date TEXT NOT NULL DEFAULT '',
  tracklist TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER,
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

CREATE TABLE IF NOT EXISTS fire_reactions (
  set_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (set_id, visitor_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  set_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'AnonymousFreak',
  body TEXT NOT NULL,
  position_seconds REAL CHECK (position_seconds IS NULL OR (position_seconds >= 0 AND position_seconds <= 86400)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS comments_set_created ON comments (set_id, created_at DESC);
CREATE INDEX IF NOT EXISTS comments_visitor_created ON comments (visitor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS site_content (
  id TEXT PRIMARY KEY CHECK (id = 'main'),
  content TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
