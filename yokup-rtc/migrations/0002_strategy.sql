-- ESTRATEGIA (norte) por equipo — /estrategia de Yokup (Carlos, 2026-07-23).
-- Idempotente. Aplicar con:
--   npx wrangler d1 execute yokup-tickets --remote --file=migrations/0002_strategy.sql
-- (el Worker también la crea en ensureSchema; esto la deja explícita en repo).
--
-- El «norte» de cada equipo (atomos = hardware/campo, bits = silicio/flota) que antes
-- vivía en localStorage (por navegador) pasa a ser ÚNICO para toda la flota y LEGIBLE
-- por los agentes vía GET /fleet/strategy. Escritura protegida por el perímetro (POST /strategy).
CREATE TABLE IF NOT EXISTS strategy (
  team       TEXT PRIMARY KEY,   -- 'atomos' | 'bits'
  text       TEXT,
  updated_at INTEGER,
  updated_by TEXT
);
