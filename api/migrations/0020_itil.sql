-- ITIL · inventario tecnológico de los Xpacios (FLT-101300 · MorfeoMacMini · 30-sep-2026). Aditiva e idempotente.
-- Carlos: «esto es lo que llamaremos ITIL (inventario tecnológico) y tiene que estar primero en yokup.com
-- para luego a través del MCP distribuirlo a todas las soluciones de la Galaxia Admira».
-- Yokup es el MAESTRO de los equipos de cada Xpacio; XpaceOS, Pixeria, admira.app y clearchannel.tv consumen.
-- El Xpacio (establecimiento) sigue naciendo en el catálogo de Admira (admira-xpacio-sync.js).
-- Ninguna tabla existente cambia de forma: ficha satélite por equipo, auditoría y claves de lectura.

-- Ficha de CI (configuration item) de un equipo. Compra, garantía y serie siguen en device_lifecycle.
-- managed_by 'itil': lo manda Yokup (la sync del catálogo nunca lo retira ni lo renombra).
-- managed_by 'catalogo': sembrado por la sync desde `surfaces`, provisional hasta el primer CI ITIL del Xpacio.
CREATE TABLE IF NOT EXISTS itil_items (
 device_id TEXT PRIMARY KEY REFERENCES installer_devices(id),
 site_id TEXT NOT NULL REFERENCES retailer_sites(id),
 itil_code TEXT UNIQUE,
 category TEXT NOT NULL CHECK(category IN ('pantalla','player','tpv','audio','iot','red','kiosk','mobiliario','iluminacion','otro')),
 role TEXT, group_name TEXT, position TEXT,
 orientation TEXT CHECK(orientation IS NULL OR orientation IN ('horizontal','vertical')),
 parent_device_id TEXT REFERENCES installer_devices(id),
 managed_by TEXT NOT NULL CHECK(managed_by IN ('itil','catalogo')),
 created_by TEXT NOT NULL, updated_by TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 CHECK(managed_by='catalogo' OR itil_code IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS itil_items_site ON itil_items(site_id, managed_by);
CREATE INDEX IF NOT EXISTS itil_items_parent ON itil_items(parent_device_id) WHERE parent_device_id IS NOT NULL;

-- Quién cambió qué y por qué canal (portal, mcp-comercio, mcp-flota, sync).
CREATE TABLE IF NOT EXISTS itil_audit (
 id TEXT PRIMARY KEY, at INTEGER NOT NULL, actor TEXT NOT NULL, channel TEXT NOT NULL,
 action TEXT NOT NULL, itil_code TEXT, device_id TEXT, site_id TEXT, detail TEXT
);
CREATE INDEX IF NOT EXISTS itil_audit_site ON itil_audit(site_id, at DESC);

-- Claves de lectura por solución de la Galaxia (xpaceos, pixeria, admira-app, clearchannel-tv…).
-- Solo el SHA-256; la clave en claro se entrega una vez (api/tools/itil-read-key.mjs).
-- origins: array JSON de orígenes permitidos para esa clave ([] = sin restricción de origen, uso servidor a servidor).
-- brands: array JSON de brand_key legibles (NULL = todas las marcas).
CREATE TABLE IF NOT EXISTS itil_read_keys (
 id TEXT PRIMARY KEY, solution TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE,
 origins TEXT NOT NULL DEFAULT '[]', brands TEXT,
 created_at INTEGER NOT NULL, expires_at INTEGER, revoked_at INTEGER, last_used_at INTEGER
);

-- Los equipos que ya sembró la sync del catálogo quedan como CI 'catalogo' (sin código). Idempotente.
INSERT OR IGNORE INTO itil_items(device_id,site_id,itil_code,category,managed_by,created_by,updated_by,created_at,updated_at)
 SELECT x.device_id,l.site_id,NULL,COALESCE(lc.category,'otro'),'catalogo','migracion-0020','migracion-0020',
  CAST(strftime('%s','now') AS INTEGER)*1000,CAST(strftime('%s','now') AS INTEGER)*1000
 FROM admira_xpacio_devices x JOIN retailer_device_links l ON l.device_id=x.device_id LEFT JOIN device_lifecycle lc ON lc.device_id=x.device_id;
