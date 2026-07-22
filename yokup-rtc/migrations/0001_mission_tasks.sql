-- Modelo MISIONES · TAREAS (Yokup helpdesk).
-- Idempotente. Aplicar con:
--   npx wrangler d1 execute yokup-tickets --remote --file=migrations/0001_mission_tasks.sql
-- (el Worker también la crea en ensureSchema, esto la deja explícita en repo).
--
-- Una MISIÓN es el ticket/incidencia. Sus TAREAS son los pasos para concluirla:
-- 3 pasos (a,b,c), cada uno con hasta 3 subtareas (a1..a3, b1..b3, c1..c3) → máx 9.
CREATE TABLE IF NOT EXISTS mission_tasks (
  mission_id TEXT,
  code       TEXT,               -- 'a','b','c' | 'a1'..'c3'
  title      TEXT,
  status     TEXT DEFAULT 'pending',  -- pending | in_progress | done
  owner      TEXT,               -- principal | subagente | infraagente | <nombre>
  report     TEXT,
  updated_at INTEGER,
  PRIMARY KEY (mission_id, code)
);
CREATE INDEX IF NOT EXISTS idx_mtasks_mission ON mission_tasks(mission_id);

-- Tandas desde la ventana diaria: una elección crea una misión activa y deja
-- las otras cuatro como cola persistente. Las pendientes no son tickets hasta
-- que el Agente acepta con evidencia el cierre de la actual.
CREATE TABLE IF NOT EXISTS mission_batches (
  id                TEXT PRIMARY KEY,
  decision_id       TEXT UNIQUE,
  agent             TEXT,
  machine           TEXT,
  status            TEXT DEFAULT 'active', -- active | paused | completed
  pause_reason      TEXT,
  active_mission_id TEXT,
  created_at        INTEGER,
  updated_at        INTEGER
);

CREATE TABLE IF NOT EXISTS mission_batch_items (
  batch_id     TEXT,
  position     INTEGER,
  option_index INTEGER,
  title        TEXT,
  mission_id   TEXT,
  status       TEXT DEFAULT 'queued', -- queued | active | completed
  created_at   INTEGER,
  updated_at   INTEGER,
  PRIMARY KEY (batch_id, position)
);
CREATE INDEX IF NOT EXISTS idx_batch_items_active ON mission_batch_items(batch_id, status, position);
CREATE INDEX IF NOT EXISTS idx_batch_items_mission ON mission_batch_items(mission_id);
