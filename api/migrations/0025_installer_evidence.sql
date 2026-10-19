-- Private intervention photos. R2 has no public route; reads require current ownership.
CREATE TABLE installer_evidence (
 id TEXT PRIMARY KEY,
 incident_id TEXT NOT NULL REFERENCES installer_incidents(id),
 installer_id TEXT NOT NULL REFERENCES installer_accounts(id),
 object_key TEXT NOT NULL UNIQUE,
 sha256 TEXT NOT NULL,
 content_type TEXT NOT NULL CHECK(content_type IN ('image/jpeg','image/png','image/webp')),
 size INTEGER NOT NULL CHECK(size > 0 AND size <= 8388608),
 created_at INTEGER NOT NULL,
 UNIQUE(incident_id,installer_id,sha256)
);
CREATE INDEX installer_evidence_incident ON installer_evidence(incident_id,installer_id);
