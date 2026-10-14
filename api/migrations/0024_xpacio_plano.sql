-- Plano maestro del Xpacio en Yokup (DCL-fbee86b0016fa4cef7a7726c · Hoy #186 · SubNeoMBP14 · 14-oct-2026).
-- Aditiva e idempotente. Docs: docs/plano-yokup.md.
-- Carlos: los clientes globales de las 5 soluciones comparten planos e inventario ITIL — admira.biz comercializa,
-- admira.app (Yokup) mantiene, admira.studio adapta contenidos, admira.store lo demuestra con el gemelo, todo
-- lanzado desde admira.tv. Yokup ya es el maestro del ITIL; ahora también del PLANO (admira.xpacio-plano/1).
-- Ninguna tabla existente cambia de forma: plano vigente por establecimiento + histórico append-only.
-- La auditoría reutiliza itil_audit (action 'plan-update', canal portal | mcp-comercio | mcp-flota).

-- Plano vigente: uno por establecimiento (retailer_sites). admira_store_id es copia del catálogo cuando la hay
-- (NULL en los establecimientos propios de Yokup, como el laboratorio de Gran de Gràcia 51).
-- plan_json: el JSON tal cual llegó, compacto; sha256: del JSON canónico (claves ordenadas), para la idempotencia.
CREATE TABLE IF NOT EXISTS xpacio_planos (
 site_id TEXT PRIMARY KEY REFERENCES retailer_sites(id),
 admira_store_id TEXT,
 plan_id TEXT NOT NULL,
 schema TEXT NOT NULL CHECK(schema='admira.xpacio-plano/1'),
 version TEXT NOT NULL,
 plan_json TEXT NOT NULL,
 sha256 TEXT NOT NULL,
 seq INTEGER NOT NULL,
 screens INTEGER NOT NULL,
 bytes INTEGER NOT NULL,
 source TEXT NOT NULL CHECK(source IN ('portal','mcp-flota','mcp-comercio')),
 created_by TEXT NOT NULL, created_at INTEGER NOT NULL,
 updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS xpacio_planos_store ON xpacio_planos(admira_store_id) WHERE admira_store_id IS NOT NULL;
-- El vigente se sustituye (UPDATE), nunca se borra.
CREATE TRIGGER IF NOT EXISTS xpacio_planos_no_delete BEFORE DELETE ON xpacio_planos
BEGIN SELECT RAISE(ABORT,'el plano vigente no se borra'); END;

-- Histórico append-only: una fila por versión DISTINTA de la vigente (repetir el mismo JSON no escribe).
-- seq crece por establecimiento (1, 2, 3…). Volver a un plano anterior es una versión nueva. Nada se borra.
CREATE TABLE IF NOT EXISTS xpacio_plano_versions (
 id TEXT PRIMARY KEY,
 site_id TEXT NOT NULL REFERENCES retailer_sites(id),
 seq INTEGER NOT NULL,
 admira_store_id TEXT,
 plan_id TEXT NOT NULL,
 schema TEXT NOT NULL,
 version TEXT NOT NULL,
 plan_json TEXT NOT NULL,
 sha256 TEXT NOT NULL,
 screens INTEGER NOT NULL,
 bytes INTEGER NOT NULL,
 source TEXT NOT NULL CHECK(source IN ('portal','mcp-flota','mcp-comercio')),
 updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(site_id, seq)
);
CREATE INDEX IF NOT EXISTS xpacio_plano_versions_site ON xpacio_plano_versions(site_id, seq DESC);
CREATE TRIGGER IF NOT EXISTS xpacio_plano_versions_no_update BEFORE UPDATE ON xpacio_plano_versions
BEGIN SELECT RAISE(ABORT,'xpacio_plano_versions es append-only'); END;
CREATE TRIGGER IF NOT EXISTS xpacio_plano_versions_no_delete BEFORE DELETE ON xpacio_plano_versions
BEGIN SELECT RAISE(ABORT,'xpacio_plano_versions es append-only'); END;
