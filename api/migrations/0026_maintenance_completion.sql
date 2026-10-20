ALTER TABLE installer_incidents ADD COLUMN purpose TEXT NOT NULL DEFAULT 'repair' CHECK(purpose IN ('repair','maintenance'));
-- Runs in the same SQLite transaction as the confirmed closure. Retries cannot fire twice.
CREATE TRIGGER maintenance_completed AFTER UPDATE OF status ON installer_incidents
WHEN OLD.status='assigned' AND NEW.status='resolved' AND NEW.purpose='maintenance'
 AND NEW.evidence_url IS NOT NULL AND NEW.evidence_url IS NOT OLD.evidence_url
 AND NEW.resolved_at IS NOT NULL AND NEW.installer_id IS NOT NULL
 AND EXISTS(SELECT 1 FROM installer_evidence e WHERE e.incident_id=NEW.id AND e.installer_id=NEW.installer_id)
BEGIN
 UPDATE device_lifecycle SET last_maintenance_at=date(NEW.resolved_at/1000,'unixepoch'),
 updated_at=NEW.resolved_at,updated_by=NEW.installer_id
 WHERE device_id=NEW.device_id AND (last_maintenance_at IS NULL OR last_maintenance_at<date(NEW.resolved_at/1000,'unixepoch'));
 INSERT OR IGNORE INTO incident_timeline(id,incident_id,kind,detail,created_at)
 VALUES('maintenance:'||NEW.id,NEW.id,'mantenimiento_registrado','Mantenimiento registrado automáticamente al cerrar con fotos',NEW.resolved_at);
END;
