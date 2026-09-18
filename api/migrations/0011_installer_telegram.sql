-- Avisos de oportunidad por Telegram (18-sep-2026). Un chat por instalador y un
-- registro por aviso enviado para no repetirlo en cada barrido de dos minutos.
CREATE TABLE IF NOT EXISTS installer_telegram (
  installer_id TEXT PRIMARY KEY REFERENCES installer_accounts(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS installer_telegram_sent (
  notification_id TEXT PRIMARY KEY,
  sent_at INTEGER NOT NULL
);
