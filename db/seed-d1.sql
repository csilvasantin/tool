-- ============================================================================
-- Yokup — datos demo mínimos para D1 (SQLite).
-- Réplica exacta de seedInterventions() en web/tool/data.js, para que la web en
-- modo 'api' arranque con el mismo contenido que la demo local/original.
-- (El proyecto Supabase original ya no existe — NXDOMAIN —, así que no hay export
--  que migrar; sembramos el mismo seed canónico.)
-- Idempotente: INSERT OR IGNORE por id de texto.
-- ============================================================================

INSERT OR IGNORE INTO interventions
  (id, store_id, store_name, region, surface, surface_type, type, origin, status, priority, title, description, created_at)
VALUES
  ('iv-1001','xtanco','Xtanco','Madrid','LED Frontal','pantalla','incidencia','admira','nueva','alta',
   'Pantalla LED Frontal sin señal','El reproductor no recibe contenido desde Admira hace 3h.','2026-05-31T08:12:00Z'),
  ('iv-1002','admira-loterias','Admira Loterías','Madrid','Boletos kiosk','mostrador','mantenimiento','manual','publicada','media',
   'Mantenimiento preventivo kiosk de boletos','Revisión táctil + limpieza trimestral.','2026-05-30T16:40:00Z'),
  ('iv-1003','admira-vapeo','Admira Vapeo','Madrid','Vending de e-líquidos','vending','instalacion','manual','en_curso','baja',
   'Instalación de panel digital en vending','Montaje de 8 paneles, uno por tubo.','2026-05-29T11:00:00Z'),
  ('iv-1004','admira-prensa','Admira Prensa','Madrid','LED titulares','pantalla','incidencia','admira','publicada','media',
   'Parpadeo en el LED de titulares','La pantalla parpadea de forma intermitente desde anoche.','2026-05-31T07:05:00Z');
