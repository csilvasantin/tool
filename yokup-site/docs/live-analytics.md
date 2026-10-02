# Analítica en directo / Live analytics
ES: Todas las páginas HTML de la solución envían presencia anónima al panel privado https://www.admiranext.com/analitics/ (Ahora). Latido cada 15 segundos; sesión activa durante 45 segundos. Se informa dominio, ruta sin parámetros, país y tipo de dispositivo. No se recoge nombre, IP ni cookies. Se respetan DNT y GPC. La autenticación y los permisos permanecen en la capa existente.

EN: All solution HTML pages send anonymous presence to the private analytics dashboard (Now). Heartbeat every 15 seconds; active window 45 seconds. Reports domain, path without query parameters, country and device category. No names, IP addresses or cookies are collected. DNT and GPC are respected. Existing authentication and permissions remain in place.

Contract: https://www.admiranext.com/assets/live-presence.js?v=2 → POST https://www.admiranext.com/api/presence. GET requires an administrator session. Integration is applied by the HTML response middleware/worker and leaves JSON/assets unchanged.
