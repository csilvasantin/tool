-- FLT-1161 · referencia humana común a objetivos, ventanas, misiones y tareas.
-- Aplicar ANTES de desplegar el Worker:
--   npx wrangler d1 execute yokup-tickets --remote --file=migrations/0003_display_refs.sql
--
-- El Worker añade idempotentemente mission_tasks.created_at y completa los NULL
-- con updated_at; se hace en código porque SQLite/D1 no admite ADD COLUMN IF NOT
-- EXISTS. El primer acceso a cualquier día hace backfill determinista conjunto
-- de las cuatro entidades de esa fecha (Europe/Madrid), también en histórico.

CREATE TABLE IF NOT EXISTS display_ref_counters (
  day        TEXT PRIMARY KEY, -- YYYY-MM-DD en Europe/Madrid
  next_value INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS display_refs (
  entity_type      TEXT NOT NULL, -- objective|window|mission|task
  entity_key       TEXT NOT NULL, -- PK técnica; tarea = mission_id:code
  day              TEXT NOT NULL,
  seq              INTEGER NOT NULL,
  entity_created_at INTEGER NOT NULL,
  display_ref      TEXT NOT NULL,
  assigned_at      INTEGER NOT NULL,
  PRIMARY KEY (entity_type, entity_key),
  UNIQUE (day, seq)
);

CREATE INDEX IF NOT EXISTS idx_display_refs_day_seq
  ON display_refs(day, seq);
