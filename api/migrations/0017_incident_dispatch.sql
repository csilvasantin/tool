-- Yokup Desk: despacho dual, relojes, candado de cierre, push y KB (FLT-100938 · FLT-100940 · MorfeoMacMini · 24-sep-2026).
-- Aditiva: las incidencias existentes quedan como canal 'campo' en la ronda 1, igual que hoy.

-- Canal: 'campo' (pantalla/IoT → instalador cercano) o 'digital' (web/agente/máquina → DeepAgent).
ALTER TABLE installer_incidents ADD COLUMN channel TEXT NOT NULL DEFAULT 'campo';
-- DeepAgent que la lleva (solo canal digital) y cuándo se le entregó el encargo.
ALTER TABLE installer_incidents ADD COLUMN deepagent TEXT;
ALTER TABLE installer_incidents ADD COLUMN delivered_at INTEGER;
-- Ronda de aviso: 1 = radio propio del instalador; cada reasignación sin aceptar lo amplía.
ALTER TABLE installer_incidents ADD COLUMN dispatch_round INTEGER NOT NULL DEFAULT 1;
ALTER TABLE installer_incidents ADD COLUMN round_started_at INTEGER;
ALTER TABLE installer_incidents ADD COLUMN last_progress_at INTEGER;
ALTER TABLE installer_incidents ADD COLUMN escalated_at INTEGER;
-- Candado de «Resuelta»: sin evidencia viva no se cierra.
ALTER TABLE installer_incidents ADD COLUMN evidence_url TEXT;
ALTER TABLE installer_incidents ADD COLUMN rating_requested_at INTEGER;

-- Historia legible de cada incidencia: despacho, reasignación, escalado, avance, cierre, valoración.
CREATE TABLE IF NOT EXISTS incident_timeline (
 id TEXT PRIMARY KEY, incident_id TEXT NOT NULL REFERENCES installer_incidents(id),
 kind TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS incident_timeline_by_incident ON incident_timeline(incident_id, created_at);

-- Suscripciones Web Push del portal del instalador (avisos con el portal cerrado).
CREATE TABLE IF NOT EXISTS installer_push_subscriptions (
 endpoint TEXT PRIMARY KEY, installer_id TEXT NOT NULL REFERENCES installer_accounts(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL, last_ok_at INTEGER
);
CREATE INDEX IF NOT EXISTS installer_push_by_installer ON installer_push_subscriptions(installer_id);
-- Un aviso push por notificación (reintento en el siguiente barrido si falla).
CREATE TABLE IF NOT EXISTS installer_push_sent (
 notification_id TEXT PRIMARY KEY, sent_at INTEGER NOT NULL
);

-- Base de conocimiento: solo cierres con evidencia que el comercio valoró bien (≥ 4★ y satisfecho).
CREATE TABLE IF NOT EXISTS incident_kb (
 incident_id TEXT PRIMARY KEY REFERENCES installer_incidents(id), channel TEXT NOT NULL, skill TEXT,
 title TEXT NOT NULL, resolution TEXT NOT NULL, evidence_url TEXT NOT NULL, stars INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS incident_kb_by_skill ON incident_kb(skill, created_at DESC);
