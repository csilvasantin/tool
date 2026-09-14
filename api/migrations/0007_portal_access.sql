CREATE TABLE portal_password_resets(id TEXT PRIMARY KEY,kind TEXT NOT NULL,account_id TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,expires_at INTEGER NOT NULL,used_by TEXT,created_at INTEGER NOT NULL);
CREATE TABLE portal_google_challenges(token_hash TEXT PRIMARY KEY,nonce TEXT NOT NULL,expires_at INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE portal_admin_sessions(token_hash TEXT PRIMARY KEY,email TEXT NOT NULL,google_sub TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE portal_admin_assignments(request_key TEXT PRIMARY KEY,incident_id TEXT NOT NULL,installer_id TEXT NOT NULL,actor TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at INTEGER NOT NULL);
ALTER TABLE installer_incidents ADD COLUMN admin_assignment_key TEXT;
