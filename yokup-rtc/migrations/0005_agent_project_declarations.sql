-- FLT-1199 · proyecto principal diario por identidad operativa.
-- Idempotente: una fila por día de Madrid y agente exacto. La declaración
-- referencia projects.id; no altera project_members, owner, tickets ni presencia.
CREATE TABLE IF NOT EXISTS agent_project_declarations (
  day         TEXT NOT NULL,
  agent_key   TEXT NOT NULL,
  agent       TEXT NOT NULL,
  project_id  TEXT NOT NULL,
  declared_by TEXT,
  statement   TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (day, agent_key)
);

CREATE INDEX IF NOT EXISTS idx_apd_project_day
  ON agent_project_declarations(project_id, day);
