-- Xpacios de Admira → Yokup (FLT-101292 · MorfeoMacMini · 30-sep-2026). Aditiva e idempotente.
-- Cada Xpacio con gemelo del catálogo de admira.app/clearchannel.tv (omnipublicity /locations)
-- se da de alta como establecimiento de una CUENTA DE MARCA (Alsea, JTI, CaixaBank…) con un
-- equipo por superficie, para llevar su inventario y ciclo de vida. Solo tablas satélite:
-- ninguna tabla existente cambia de forma.

-- Marca de origen Admira de un establecimiento (sin circuito propio: ya tiene el compartido).
CREATE TABLE IF NOT EXISTS admira_xpacio_sites (
 site_id TEXT PRIMARY KEY REFERENCES retailer_sites(id),
 admira_store_id TEXT NOT NULL UNIQUE, circuit_id TEXT, brand_key TEXT NOT NULL,
 twin_url TEXT NOT NULL, catalog_hash TEXT NOT NULL,
 first_seen_at INTEGER NOT NULL, last_synced_at INTEGER NOT NULL, removed_at INTEGER
);
CREATE INDEX IF NOT EXISTS admira_xpacio_sites_brand ON admira_xpacio_sites(brand_key, removed_at);

-- Equipo creado por la sincronización para una superficie del Xpacio (nunca los añadidos a mano).
CREATE TABLE IF NOT EXISTS admira_xpacio_devices (
 device_id TEXT PRIMARY KEY REFERENCES installer_devices(id),
 admira_store_id TEXT NOT NULL, surface_key TEXT NOT NULL, surface_name TEXT NOT NULL,
 removed_at INTEGER, UNIQUE(admira_store_id, surface_key)
);

-- Una cuenta de comercio por marca. La cuenta es sintética: no admite login (ver docs/xpacios-yokup.md).
CREATE TABLE IF NOT EXISTS brand_accounts (
 brand_key TEXT PRIMARY KEY, retailer_id TEXT NOT NULL UNIQUE REFERENCES retailer_accounts(id),
 name TEXT NOT NULL, created_at INTEGER NOT NULL
);

-- Personas que pueden abrir el portal de una cuenta (por correo verificado con Google).
CREATE TABLE IF NOT EXISTS retailer_account_members (
 retailer_id TEXT NOT NULL REFERENCES retailer_accounts(id), email TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('owner','viewer','manager')), granted_by TEXT NOT NULL,
 created_at INTEGER NOT NULL, revoked_at INTEGER, PRIMARY KEY(retailer_id, email)
);
CREATE INDEX IF NOT EXISTS retailer_account_members_email ON retailer_account_members(email, revoked_at);

-- Sesión delegada «Ver como»: quién la abrió y desde dónde. Sin FK para no bloquear la limpieza de sesiones.
CREATE TABLE IF NOT EXISTS retailer_session_actors (
 token_hash TEXT PRIMARY KEY, actor_email TEXT NOT NULL,
 actor_kind TEXT NOT NULL CHECK(actor_kind IN ('member','superuser')),
 origin_retailer_id TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS retailer_access_audit (
 id TEXT PRIMARY KEY, actor_email TEXT NOT NULL, actor_kind TEXT NOT NULL, action TEXT NOT NULL,
 from_retailer_id TEXT, retailer_id TEXT, outcome TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS retailer_access_audit_target ON retailer_access_audit(retailer_id, created_at DESC);

-- Ficha de ciclo de vida del equipo. Fechas ISO 'YYYY-MM-DD'. Sin datos inventados: nace vacía.
CREATE TABLE IF NOT EXISTS device_lifecycle (
 device_id TEXT PRIMARY KEY REFERENCES installer_devices(id),
 category TEXT CHECK(category IS NULL OR category IN ('pantalla','player','iot','audio','tpv','red','mobiliario','iluminacion','otro')),
 manufacturer TEXT, model TEXT, serial TEXT, purchase_date TEXT, supplier TEXT, invoice_ref TEXT,
 warranty_start TEXT, warranty_end TEXT, installed_at TEXT, installed_by TEXT,
 maintenance_interval_days INTEGER CHECK(maintenance_interval_days IS NULL OR maintenance_interval_days BETWEEN 1 AND 3650),
 last_maintenance_at TEXT,
 status TEXT NOT NULL DEFAULT 'operational' CHECK(status IN ('operational','degraded','maintenance','retired','planned')),
 retired_at TEXT, notes TEXT, updated_at INTEGER NOT NULL, updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS device_lifecycle_warranty ON device_lifecycle(warranty_end) WHERE warranty_end IS NOT NULL;

CREATE TABLE IF NOT EXISTS device_lifecycle_alerts (
 device_id TEXT NOT NULL REFERENCES installer_devices(id),
 kind TEXT NOT NULL CHECK(kind IN ('warranty_30','warranty_7','warranty_expired','maintenance_due')),
 due_on TEXT NOT NULL, created_at INTEGER NOT NULL, acknowledged_at INTEGER,
 PRIMARY KEY(device_id, kind, due_on)
);

-- Ejecuciones de la sincronización (throttle de 15 min, candado y lotes pendientes).
CREATE TABLE IF NOT EXISTS xpacio_sync_runs (
 id TEXT PRIMARY KEY, trigger TEXT NOT NULL, started_at INTEGER NOT NULL, finished_at INTEGER,
 seen INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL DEFAULT 0,
 removed INTEGER NOT NULL DEFAULT 0, pending INTEGER NOT NULL DEFAULT 0, error TEXT
);
CREATE INDEX IF NOT EXISTS xpacio_sync_runs_started ON xpacio_sync_runs(started_at DESC);

-- Trabajos diarios del cron (barrido de alertas de ciclo de vida).
CREATE TABLE IF NOT EXISTS scheduled_jobs (name TEXT PRIMARY KEY, last_run_on TEXT NOT NULL, last_run_at INTEGER NOT NULL);
