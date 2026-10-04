CREATE TABLE IF NOT EXISTS youtube_sessions (read_hash TEXT PRIMARY KEY, write_hash TEXT UNIQUE NOT NULL, payload TEXT, updated_at INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, creator_hash TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS youtube_session_creators ON youtube_sessions(creator_hash, created_at);
CREATE INDEX IF NOT EXISTS youtube_session_expiry ON youtube_sessions(expires_at);
CREATE TABLE IF NOT EXISTS youtube_devices (
 poll_hash TEXT PRIMARY KEY, code_hash TEXT UNIQUE NOT NULL,
 read_token TEXT, pair_expires_at INTEGER,
 expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, creator_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS youtube_device_creators ON youtube_devices(creator_hash,created_at);
CREATE TABLE IF NOT EXISTS youtube_device_attempts (
 creator_hash TEXT PRIMARY KEY, window_start INTEGER NOT NULL, attempts INTEGER NOT NULL
);
