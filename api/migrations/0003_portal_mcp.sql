-- Each integration is delegated by one portal account; no fleet-wide customer access.
CREATE TABLE portal_mcp_tokens (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
 kind TEXT NOT NULL CHECK(kind IN ('installer','retailer')), account_id TEXT NOT NULL,
 label TEXT NOT NULL, scopes TEXT NOT NULL, audience TEXT NOT NULL,
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER, last_used_at INTEGER
);
CREATE INDEX portal_mcp_owner ON portal_mcp_tokens(kind,account_id,created_at);
CREATE TABLE portal_mcp_audit (
 id TEXT PRIMARY KEY, token_id TEXT NOT NULL REFERENCES portal_mcp_tokens(id),
 kind TEXT NOT NULL, account_id TEXT NOT NULL, tool TEXT NOT NULL,
 outcome TEXT NOT NULL, http_status INTEGER, created_at INTEGER NOT NULL, completed_at INTEGER
);
CREATE INDEX portal_mcp_audit_owner ON portal_mcp_audit(kind,account_id,created_at);
CREATE TABLE portal_mcp_requests (
 kind TEXT NOT NULL, account_id TEXT NOT NULL, tool TEXT NOT NULL, request_key TEXT NOT NULL,
 payload_hash TEXT NOT NULL, state TEXT NOT NULL, result_json TEXT, created_at INTEGER NOT NULL,
 PRIMARY KEY(kind,account_id,tool,request_key)
);
