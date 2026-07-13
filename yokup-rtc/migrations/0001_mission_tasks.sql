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
