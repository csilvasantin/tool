CREATE TABLE IF NOT EXISTS portal_google_redirects (
  state_hash TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  identity_json TEXT,
  handoff_hash TEXT UNIQUE,
  handoff_expires_at INTEGER,
  used_at INTEGER
);
