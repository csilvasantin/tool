-- Internal procurement tied to the existing incident and retailer. No payment provider.
CREATE TABLE ecommerce_requests (
 id TEXT PRIMARY KEY,
 incident_id TEXT NOT NULL REFERENCES installer_incidents(id),
 retailer_id TEXT NOT NULL REFERENCES retailer_accounts(id),
 site_id TEXT NOT NULL REFERENCES retailer_sites(id),
 requester_kind TEXT NOT NULL CHECK(requester_kind IN ('installer','retailer')),
 requester_id TEXT NOT NULL,
 requester_name TEXT NOT NULL,
 request_key TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 items TEXT NOT NULL,
 reason TEXT NOT NULL,
 priority TEXT NOT NULL CHECK(priority IN ('normal','urgent')),
 delivery_notes TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','ordered','received','installed','rejected','cancelled')),
 currency TEXT NOT NULL DEFAULT 'EUR' CHECK(currency='EUR'),
 supplier TEXT NOT NULL DEFAULT '',
 quote_reference TEXT NOT NULL DEFAULT '',
 quote_url TEXT NOT NULL DEFAULT '',
 shipping_cents INTEGER NOT NULL DEFAULT 0 CHECK(shipping_cents>=0),
 tax_cents INTEGER NOT NULL DEFAULT 0 CHECK(tax_cents>=0),
 total_cents INTEGER,
 approved_total_cents INTEGER,
 order_reference TEXT NOT NULL DEFAULT '',
 tracking_url TEXT NOT NULL DEFAULT '',
 version INTEGER NOT NULL DEFAULT 1,
 last_action TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 UNIQUE(requester_kind,requester_id,request_key)
);
CREATE INDEX ecommerce_retailer ON ecommerce_requests(retailer_id,updated_at DESC);
CREATE INDEX ecommerce_incident ON ecommerce_requests(incident_id,updated_at DESC);
CREATE TABLE ecommerce_events (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL REFERENCES ecommerce_requests(id),
 request_key TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 action TEXT NOT NULL,
 actor_kind TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 actor_name TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL,
 version INTEGER NOT NULL,
 UNIQUE(request_id,request_key),
 UNIQUE(request_id,version)
);
