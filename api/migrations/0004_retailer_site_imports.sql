CREATE TABLE retailer_site_imports (
 id TEXT PRIMARY KEY, retailer_id TEXT NOT NULL REFERENCES retailer_accounts(id),
 request_key TEXT NOT NULL, payload_hash TEXT NOT NULL, filename TEXT NOT NULL,
 result TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(retailer_id,request_key)
);
CREATE TABLE retailer_site_import_items (
 site_id TEXT PRIMARY KEY REFERENCES retailer_sites(id),
 retailer_id TEXT NOT NULL REFERENCES retailer_accounts(id),
 import_id TEXT NOT NULL REFERENCES retailer_site_imports(id),
 natural_key TEXT NOT NULL, external_ref TEXT NOT NULL,
 sync_status TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced')),
 circuit_id TEXT, admira_store_id TEXT, synced_at INTEGER,
 UNIQUE(retailer_id,natural_key), UNIQUE(circuit_id,admira_store_id)
);
CREATE UNIQUE INDEX retailer_site_import_reference ON retailer_site_import_items(retailer_id,external_ref) WHERE external_ref!='';
CREATE INDEX retailer_site_import_pending ON retailer_site_import_items(retailer_id,sync_status,site_id);
