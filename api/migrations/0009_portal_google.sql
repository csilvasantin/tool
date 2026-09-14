CREATE TABLE portal_superusers(email TEXT PRIMARY KEY,google_sub TEXT,granted_by TEXT NOT NULL,created_at INTEGER NOT NULL,revoked_at INTEGER);
INSERT INTO portal_superusers VALUES('csilva@admira.com',NULL,'bootstrap',unixepoch()*1000,NULL);
CREATE TABLE portal_role_audit(id TEXT PRIMARY KEY,email TEXT NOT NULL,action TEXT NOT NULL,actor TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE portal_google_identities(kind TEXT NOT NULL,account_id TEXT NOT NULL,google_sub TEXT NOT NULL,PRIMARY KEY(kind,google_sub),UNIQUE(kind,account_id));
CREATE TABLE portal_google_signup(token_hash TEXT PRIMARY KEY,kind TEXT NOT NULL,email TEXT NOT NULL,google_sub TEXT NOT NULL,name TEXT NOT NULL,expires_at INTEGER NOT NULL,used_by TEXT);
