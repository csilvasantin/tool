-- Vinculación de Telegram por código (18-sep-2026): el instalador envía «/start CÓDIGO»
-- al bot y el barrido lee getUpdates para guardar su chat. telegram_state guarda el offset.
CREATE TABLE IF NOT EXISTS installer_telegram_links (
  code TEXT PRIMARY KEY,
  installer_id TEXT NOT NULL REFERENCES installer_accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS telegram_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
