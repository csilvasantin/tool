-- Routers de tienda (CI categoría red) · telemetría simulada o RMS (05-oct-2026 · SmithMacMini).
-- Tabla satélite: la ficha ITIL no guarda serie ni IMEI inventados como si fueran de factura.
-- Aplicar ANTES del worker (las consultas ya hacen JOIN):
--   npx wrangler d1 execute yokup-db --remote --file migrations/0022_network_telemetry.sql
-- yokup-db no usa d1_migrations. CREATE TABLE IF NOT EXISTS es repetible.
CREATE TABLE IF NOT EXISTS itil_network_telemetry (
 device_id TEXT PRIMARY KEY REFERENCES installer_devices(id),
 source TEXT NOT NULL CHECK(source IN ('simulated','rms')),
 vendor TEXT NOT NULL,
 payload TEXT NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS itil_network_telemetry_source ON itil_network_telemetry(source);
