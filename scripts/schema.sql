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
  animation_poster_key TEXT NOT NULL DEFAULT '',
  animation_video_key TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0, 1)),
  peaks TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS set_slug_aliases (
  slug TEXT PRIMARY KEY,
  set_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS set_slug_aliases_set_id ON set_slug_aliases (set_id);
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
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
  moderated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS comments_set_created ON comments (set_id, created_at DESC);
CREATE INDEX IF NOT EXISTS comments_visitor_created ON comments (visitor_id, created_at DESC);

-- Privacy-friendly counters: no cookies, IP addresses or visitor identifiers.
CREATE TABLE IF NOT EXISTS analytics_daily (
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  set_id TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event, set_id, detail)
);
CREATE INDEX IF NOT EXISTS analytics_daily_day ON analytics_daily (day DESC);

CREATE TABLE IF NOT EXISTS site_content (
  id TEXT PRIMARY KEY CHECK (id = 'main'),
  content TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
