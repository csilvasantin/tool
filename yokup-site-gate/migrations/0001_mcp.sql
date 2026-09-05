-- Additive: MCP credentials and delivery receipts; existing missions remain canonical.
CREATE TABLE IF NOT EXISTS yokup_mcp_credentials (
 token_hash TEXT PRIMARY KEY, actor TEXT NOT NULL, machine TEXT NOT NULL,
 projects TEXT NOT NULL, scopes TEXT NOT NULL, created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL, revoked_at INTEGER
);
CREATE TABLE IF NOT EXISTS yokup_mcp_deliveries (
 actor TEXT NOT NULL, request_key TEXT NOT NULL, payload_hash TEXT NOT NULL,
 recipient TEXT NOT NULL, project_id TEXT NOT NULL, state TEXT NOT NULL,
 result_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 PRIMARY KEY (actor,request_key)
);
