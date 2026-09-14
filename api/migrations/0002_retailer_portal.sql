-- Retailers use the same device, incident and installer records, with scoped ownership.
CREATE TABLE retailer_accounts (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE retailer_sessions (
 token_hash TEXT PRIMARY KEY, retailer_id TEXT NOT NULL REFERENCES retailer_accounts(id), expires_at INTEGER NOT NULL
);
CREATE INDEX retailer_session_expiry ON retailer_sessions(expires_at);
CREATE TABLE retailer_sites (
 id TEXT PRIMARY KEY, retailer_id TEXT NOT NULL REFERENCES retailer_accounts(id),
 name TEXT NOT NULL, kind TEXT NOT NULL, country TEXT NOT NULL, city TEXT NOT NULL,
 address TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX retailer_sites_owner ON retailer_sites(retailer_id);
CREATE TABLE retailer_device_links (
 device_id TEXT PRIMARY KEY REFERENCES installer_devices(id), site_id TEXT NOT NULL REFERENCES retailer_sites(id),
 circuit_id TEXT, admira_store_id TEXT, admira_device_id TEXT, linked_at INTEGER, created_at INTEGER NOT NULL,
 UNIQUE(circuit_id,admira_device_id)
);
CREATE INDEX retailer_devices_site ON retailer_device_links(site_id);
CREATE INDEX retailer_devices_circuit ON retailer_device_links(circuit_id);
CREATE TABLE retailer_incident_details (
 incident_id TEXT PRIMARY KEY REFERENCES installer_incidents(id), retailer_id TEXT NOT NULL REFERENCES retailer_accounts(id),
 description TEXT NOT NULL, priority TEXT NOT NULL CHECK(priority IN ('normal','urgent')), parent_incident_id TEXT,
 request_key TEXT NOT NULL, UNIQUE(retailer_id,request_key)
);
CREATE TABLE retailer_ratings (
 incident_id TEXT PRIMARY KEY REFERENCES installer_incidents(id), retailer_id TEXT NOT NULL REFERENCES retailer_accounts(id),
 installer_id TEXT NOT NULL REFERENCES installer_accounts(id), stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
 satisfied INTEGER NOT NULL CHECK(satisfied IN (0,1)), comment TEXT NOT NULL, created_at INTEGER NOT NULL,
 followup_id TEXT REFERENCES installer_incidents(id)
);
CREATE INDEX retailer_ratings_installer ON retailer_ratings(installer_id);
CREATE TABLE retailer_admira_commands (
 request_id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, applied INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
