-- Incidencias unificadas (FLT-101298 · MorfeoMacMini · 30-sep-2026). Aditiva e idempotente.
-- Enlace estable entre una incidencia del portal/Desk (installer_incidents) y su ticket de la
-- bandeja Yokup (yokup-rtc · tickets). origin: 'portal' = nació aquí, 'rtc' = nació en yokup-rtc.
-- last_synced_state es el último estado ACORDADO con yokup-rtc (open|assigned|resolved|rated):
-- solo se empuja lo que difiere de él, así un cambio que vino del otro lado no rebota.
CREATE TABLE IF NOT EXISTS incident_links (
 installer_incident_id TEXT PRIMARY KEY REFERENCES installer_incidents(id),
 rtc_ticket_id TEXT UNIQUE,
 origin TEXT NOT NULL CHECK(origin IN ('portal','rtc')),
 last_synced_state TEXT, rtc_status TEXT,
 attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, next_attempt_at INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS incident_links_due ON incident_links(next_attempt_at);
