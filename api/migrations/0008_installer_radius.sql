-- Persist per-installer coverage radius and zone notifications (FLT-100453 / FLT-100455).
ALTER TABLE installer_accounts ADD COLUMN radius_km REAL NOT NULL DEFAULT 40;
ALTER TABLE installer_accounts ADD COLUMN notify_zone INTEGER NOT NULL DEFAULT 1;
ALTER TABLE installer_accounts ADD COLUMN demo INTEGER NOT NULL DEFAULT 0;
-- Sentinel for public MCP bootstrap (installer_register without a titular token).
INSERT OR IGNORE INTO portal_mcp_tokens(id, token_hash, kind, account_id, label, scopes, audience, created_at, expires_at)
VALUES('public','0000000000000000000000000000000000000000000000000000000000000000','installer','public','public bootstrap','[]','https://data.yokup.com/mcp/installer',0,4102444800000);
