-- Payments are separate from ordering, shipping and installation.
ALTER TABLE ecommerce_requests ADD COLUMN merchant_verified_by TEXT;
ALTER TABLE ecommerce_requests ADD COLUMN merchant_verified_at INTEGER;
ALTER TABLE ecommerce_requests ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid';
ALTER TABLE ecommerce_requests ADD COLUMN paid_at INTEGER;
CREATE TABLE ecommerce_payments (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL REFERENCES ecommerce_requests(id),
 amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN 50 AND 99999999),
 currency TEXT NOT NULL CHECK(currency='eur'),
 mode TEXT NOT NULL CHECK(mode IN ('test','live')),
 status TEXT NOT NULL CHECK(status IN ('creating','pending','paid','expired','failed')),
 return_origin TEXT NOT NULL,
 description TEXT NOT NULL,
 session_id TEXT UNIQUE,
 checkout_url TEXT,
 payment_intent TEXT,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 paid_at INTEGER
);
CREATE UNIQUE INDEX ecommerce_one_active_payment ON ecommerce_payments(request_id)
 WHERE status IN ('creating','pending','paid');
CREATE TABLE ecommerce_payment_events (
 event_id TEXT PRIMARY KEY,
 payment_id TEXT NOT NULL REFERENCES ecommerce_payments(id),
 event_type TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
