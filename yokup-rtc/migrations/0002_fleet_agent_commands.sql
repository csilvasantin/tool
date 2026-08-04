-- Auditoría del mando humano de parada de sesiones de agentes (FLT-1160).
-- La cola ejecutable vive en admira-telegram; Yokup sólo conserva la petición,
-- el solicitante autenticado y el resultado saneado del service binding.
CREATE TABLE IF NOT EXISTS fleet_agent_commands (
  id                  TEXT PRIMARY KEY,
  action              TEXT,
  machine             TEXT,
  persona             TEXT,
  runtime             TEXT,
  host                TEXT,
  session_id          TEXT,
  pid                 INTEGER,
  requested_by        TEXT,
  status              TEXT,
  upstream_command_id TEXT,
  detail              TEXT,
  created_at          INTEGER,
  updated_at          INTEGER
);
CREATE INDEX IF NOT EXISTS idx_fleet_agent_commands_created
  ON fleet_agent_commands(created_at);
