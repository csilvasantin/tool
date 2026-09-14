-- Additive, separate from the legacy demo tables.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS installer_accounts (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 password_hash TEXT NOT NULL, salt TEXT NOT NULL, country TEXT NOT NULL,
 city TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL,
 skills TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'es',
 available INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS installer_sessions (
 token_hash TEXT PRIMARY KEY, installer_id TEXT NOT NULL REFERENCES installer_accounts(id), expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS installer_sessions_expiry ON installer_sessions(expires_at);
CREATE TABLE IF NOT EXISTS installer_rate_limits (
 key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS installer_devices (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL,
 address TEXT NOT NULL, skill TEXT NOT NULL, last_seen INTEGER NOT NULL,
 timeout_seconds INTEGER NOT NULL DEFAULT 900, monitoring INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS installer_events (
 id TEXT PRIMARY KEY, device_id TEXT NOT NULL, occurred_at INTEGER NOT NULL, received_at INTEGER NOT NULL, payload_hash TEXT NOT NULL, applied INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS installer_incidents (
 id TEXT PRIMARY KEY, device_id TEXT NOT NULL REFERENCES installer_devices(id),
 title TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','assigned','resolved')),
 installer_id TEXT REFERENCES installer_accounts(id), created_at INTEGER NOT NULL,
 assigned_at INTEGER, resolved_at INTEGER, resolution TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS installer_one_active_incident ON installer_incidents(device_id) WHERE status != 'resolved';
CREATE TABLE IF NOT EXISTS installer_notifications (
 id TEXT PRIMARY KEY, incident_id TEXT NOT NULL REFERENCES installer_incidents(id),
 installer_id TEXT NOT NULL REFERENCES installer_accounts(id), distance_km REAL NOT NULL,
 created_at INTEGER NOT NULL, read_at INTEGER,
 UNIQUE(incident_id, installer_id)
);
CREATE INDEX IF NOT EXISTS installer_notification_inbox ON installer_notifications(installer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS installer_available_area ON installer_accounts(available, latitude, longitude);
