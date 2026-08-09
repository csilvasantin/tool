-- FLT-1365 · contrato seguro del ejecutor CLI.
-- Aditiva: la UI histórica puede seguir leyendo alive/pid/seen_at.
ALTER TABLE cli_commands ADD COLUMN result_detail TEXT;

ALTER TABLE cli_state ADD COLUMN desired TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE cli_state ADD COLUMN desired_command_id TEXT;
ALTER TABLE cli_state ADD COLUMN desired_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_cli_commands_target_status
  ON cli_commands(machine, cli, status, created_at);
