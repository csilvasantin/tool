-- Cada establecimiento que da de alta el comercio es un circuito de Cartelería Digital
-- en el registro único de Admira (api.admira.store/grid/circuits). Aditiva.
CREATE TABLE retailer_site_circuits (
 site_id TEXT PRIMARY KEY REFERENCES retailer_sites(id),
 circuit_id TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','synced','failed')),
 attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, synced_at INTEGER, created_at INTEGER NOT NULL
);
CREATE INDEX retailer_site_circuits_pending ON retailer_site_circuits(status,attempts);
