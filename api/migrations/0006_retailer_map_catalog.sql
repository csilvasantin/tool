-- Public projection only: the map worker reads this table, never retailer accounts.
-- Historical locations remain private until the owner explicitly publishes them.
CREATE TABLE admira_retailer_locations (
 id TEXT PRIMARY KEY, site_id TEXT NOT NULL UNIQUE REFERENCES retailer_sites(id),
 public_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
