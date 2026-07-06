-- ============================================================================
-- Yokup — esquema DEMO adaptado a Cloudflare D1 (SQLite).
--
-- Traducción 1:1 de db/schema-demo.sql (PostgreSQL) a SQLite:
--   · text[]        -> TEXT con JSON (arrays serializados, ej '["madrid"]')
--   · timestamptz   -> TEXT (ISO 8601)
--   · numeric(3,2)  -> REAL
--   · smallint/int  -> INTEGER
--   · boolean       -> INTEGER (0/1)
--   · jsonb         -> TEXT (JSON)
--   · gen_random_uuid()/now() -> se resuelven en el Worker (SQLite no los trae).
--
-- Sin RLS: el control de acceso lo hace el Worker (fase 1: abierto tipo demo;
-- fase 2: auth Google/whitelist). El binding D1 solo es accesible desde el Worker.
-- ============================================================================

CREATE TABLE IF NOT EXISTS interventions (
  id            TEXT PRIMARY KEY,
  store_id      TEXT,
  store_name    TEXT,
  region        TEXT,
  surface       TEXT,
  surface_type  TEXT,
  type          TEXT NOT NULL DEFAULT 'incidencia',
  origin        TEXT NOT NULL DEFAULT 'manual',
  status        TEXT NOT NULL DEFAULT 'nueva',
  priority      TEXT NOT NULL DEFAULT 'media',
  title         TEXT NOT NULL,
  description   TEXT,
  technician_id TEXT,
  source_event  TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_interventions_created ON interventions(created_at DESC);

CREATE TABLE IF NOT EXISTS technicians (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  kind        TEXT,                 -- 'freelance' | 'empresa'
  contact     TEXT,
  zones       TEXT DEFAULT '[]',    -- JSON array
  skills      TEXT DEFAULT '[]',    -- JSON array
  status      TEXT NOT NULL DEFAULT 'pendiente',
  rating_avg  REAL DEFAULT 0,
  rating_n    INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_technicians_created ON technicians(created_at DESC);

CREATE TABLE IF NOT EXISTS ratings (
  id              TEXT PRIMARY KEY,
  intervention_id TEXT,
  technician_id   TEXT,
  store_id        TEXT,
  stars           INTEGER CHECK (stars BETWEEN 1 AND 5),
  comment         TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_ratings_created ON ratings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ratings_interv ON ratings(intervention_id);

CREATE TABLE IF NOT EXISTS stores (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  kind        TEXT,
  addr        TEXT,
  region      TEXT,
  contact     TEXT,
  equipment   TEXT DEFAULT '[]',    -- JSON array
  from_admira INTEGER DEFAULT 0,    -- boolean 0/1
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_stores_created ON stores(created_at DESC);

-- Buzón de webhooks (ingesta Admira, F1). Idempotencia por (source, event_id).
CREATE TABLE IF NOT EXISTS webhook_inbox (
  id           TEXT PRIMARY KEY,                 -- uuid generado en el Worker
  source       TEXT NOT NULL DEFAULT 'admira',
  event_id     TEXT,                             -- id externo para dedupe
  signature_ok INTEGER NOT NULL DEFAULT 0,
  payload_raw  TEXT NOT NULL,                    -- JSON
  processed    INTEGER NOT NULL DEFAULT 0,
  error        TEXT,
  received_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inbox_event ON webhook_inbox(source, event_id) WHERE event_id IS NOT NULL;
