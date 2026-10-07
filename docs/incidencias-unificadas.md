# Incidencias unificadas: un solo sistema de incidencias en Yokup

Misión Yokup FLT-101298 · MorfeoMacMini · 30-sep-2026.

> Carlos: «Yokup es fundamental para la Galaxia Admira al encargarse de la gestión de todas las incidencias».

Hasta hoy convivían dos sistemas que no se hablaban:

| | **A · Bandeja Yokup** | **B · Portal del comercio / Desk** |
|---|---|---|
| Worker | `yokup-rtc` (`api.yokup.com`) | `yokup-api` (`data.yokup.com`) |
| D1 | `yokup-tickets` (`tickets` + `events`) | `yokup-db` (`installer_incidents` + satélites) |
| Qué lleva | flota, agentes, webs, máquinas, pantallas del censo | equipos de comercio: técnico, ronda de despacho, cita, cierre con evidencia, valoración |
| Estados | `open` · `in_progress` · `resolved` · `cancelled` | `open` · `assigned` · `resolved` (+ valoración) |
| Quién lo ve | equipo Yokup (sesión Google del perímetro) | el comercio (su cuenta o «Ver como»), técnicos, DeepAgents |
| Vista | `/incidencias`, ficha `/ticket` | `/retailer`, ficha `/retailer/incidencia` |

Una incidencia del portal no aparecía en `/incidencias` y una caída de pantalla del censo no la veía el comercio. El único puente era de ida: el sensor de players (`incident-sensors.js`) mandaba la caída al Desk (`POST /api/desk/incidents`) sobre un equipo sintético `player:<pantalla>` que ningún comercio veía, y nada volvía.

## 1. Fuente de verdad por tramo

**Decisión.** Cada tramo tiene un dueño:

- **B es la fuente de verdad del ciclo de campo** de un equipo de comercio: despacho a técnicos, aceptación, cita, cierre con evidencia y valoración. Ya tiene el candado de «Resuelta», las rondas de radio, los avisos push/Telegram y la reputación. Duplicarlos en A sería crear un segundo despacho que se contradiría con el primero.
- **A es la bandeja única de TODO**: flota, agentes, webs, máquinas y también campo. Cada incidencia de campo del portal tiene su **ticket espejo** en A, con su proyecto (= establecimiento), su cronología y la marca «Portal del comercio · establecimiento».

Por qué no al revés: A no sabe de técnicos, radios ni valoraciones, y el comercio no puede entrar en A (verja Google del equipo). B sí sabe de establecimientos y equipos, así que es donde el comercio y el técnico ya trabajan.

Consecuencia práctica: **desde A no se «resuelve» un trabajo de campo que lleva un técnico**. Si la incidencia está `assigned` en B, A no la cierra (409 en `/ticket/status`) y el cierre automático por latido sano del reconcile se aplaza. Si todavía nadie la ha aceptado (`open` en B), cerrar o cancelar en A sí cierra B («Cerrada/Cancelada desde Yokup»): así una pantalla que se recupera sola no manda a un técnico en balde.

## 2. Identidad común

- **En B**: tabla nueva `incident_links` (migración `0019_incident_links.sql`), una fila por incidencia de B enlazada:
  `installer_incident_id` (PK) · `rtc_ticket_id` (UNIQUE) · `origin` (`portal` = nació en B, `rtc` = nació en A) · `last_synced_state` · `rtc_status` · `attempts` · `last_error` · `next_attempt_at` · `created_at` · `updated_at`.
- **En A**: tabla nueva `portal_links` (esquema en código, `CREATE TABLE IF NOT EXISTS` en `applySchema`, como el resto de yokup-rtc):
  `ticket_id` (PK) · `portal_incident_id` (UNIQUE) · `origin` · `site_name` · `establishment` · `portal_url` · `portal_state` (último estado de B aplicado) · `technician_name` · `attempts` · `last_error` · `next_attempt_at` · fechas.
- **Recurso del ticket espejo**: `tickets.screen = 'portal:<installer_incident_id>'`. Con el índice `idx_active_screen` (una activa por recurso) el espejo no se puede duplicar aunque dos pasadas coincidan.
- **Tickets que nacieron en A** (pantalla del censo, agente caído) conservan su recurso (`<pantalla>`, `agt:<…>`) y se enlazan por `portal_links`. En B la incidencia la crea el Desk con `external_id = 'rtc:<ticket>'`, y ese mismo alta deja la fila `incident_links(origin='rtc')`.

## 3. Correspondencia de estados

Estado de B que viaja: `open`, `assigned`, `resolved`, o `rated` (= `resolved` con valoración del comercio).

| B → A | Efecto en A |
|---|---|
| `open` | Crea el espejo si falta. **No baja** un estado de A (si alguien lo pasó a «En curso» con una nota, se respeta). |
| `assigned` | `in_progress` + evento «Técnico asignado en el portal: X». Si A lo había cerrado, **se reabre**: el técnico manda. |
| `resolved` | `resolved` + evento con la resolución y la evidencia. Si A estaba `cancelled`, se queda `cancelled`. |
| `rated` | Igual que `resolved` + evento «Valoración del comercio: N★ · funciona / no funciona». |

| A → B (solo cierres) | Efecto en B |
|---|---|
| `resolved` / `cancelled` con B `open` | `resolved` con resolución «Cerrada desde Yokup (ticket X)» / «Cancelada desde Yokup (ticket X)» y rastro `cerrada_yokup` en `incident_timeline`. Sin técnico no hay valoración (el portal ya lo exige). |
| `resolved` / `cancelled` con B `assigned` | **Se rechaza**: B responde `assigned` y A reabre su ticket a «En curso» explicando que se cierra en el portal con evidencia. |
| `open` / `in_progress` | No viaja: B no tiene «reabrir» ni «tomar» sin técnico. Solo se anota como sincronizado. |

**Revisión solicitada.** Si el comercio valora «no funciona», B abre la incidencia hija `review-…` (con `parent_incident_id`). La hija es una incidencia nueva de B: se refleja como **ticket nuevo** en A, con un evento «Revisión de <ticket padre>», y el padre recibe «El comercio pidió revisión: ticket <hijo>». El padre sigue resuelto, como en el portal.

## 4. Equipos y establecimientos

**A → B (pantalla del censo).** El sensor de players ya encola la caída para el Desk. Ahora el encargo lleva `admira: {store_id: loc, device_id: pantalla}` y el Desk busca el equipo del comercio antes de inventar uno:

1. `retailer_device_links` con `admira_store_id = loc` y `admira_device_id = pantalla` (circuito vinculado).
2. `admira_xpacio_devices` con `admira_store_id = loc` y `surface_key = slug(pantalla)` (superficie de un Xpacio).
3. Si el Xpacio existe (`admira_xpacio_sites.admira_store_id = loc`) pero no la superficie: el player del censo se da de alta como equipo **de ese establecimiento** (`installer_devices` `player:<pantalla>`, `monitoring=0`, con las coordenadas del establecimiento, y su fila en `retailer_device_links`).
4. Si no hay establecimiento, se mantiene el comportamiento previo (equipo sintético, necesita coordenadas).

Si el equipo ya tiene una incidencia activa (el comercio la comunicó antes), no se abre otra: se devuelve esa y, si aún no tenía ticket de A, se enlaza al del sensor.

**B → A (alta en el portal).** Toda incidencia de un equipo con `retailer_device_links` (lo que ve un comercio) se adopta como `origin='portal'` y se refleja en A con:
`kind='screen'`, `source='portal-comercio'`, `screen='portal:<id>'`, `project_id` = proyecto de establecimiento con **el mismo slug** que usan las pantallas: `admira_store_id` si es un Xpacio (p. ej. `alsea-sbux-021`) y, si es un establecimiento propio del portal, su id de catálogo `yokup-<site_id>` (el que Yokup publica en los mapas). El nombre del proyecto es el del establecimiento.

Adopción inicial: activas y resueltas en las últimas 24 h (no se vuelca el histórico a la bandeja). Las `desk:` activas que ya nacieron de A se enlazan leyendo su rastro de alta (`automática · rtc:<ticket>`).

## 5. Transporte entre workers

**Service bindings de Cloudflare, sin secretos nuevos.**

- `yokup-rtc` → `yokup-api`: binding `INCIDENT_DESK` (el nombre que `incident-sensors.js` ya esperaba). Se usa para el alta del Desk y para `POST https://yokup-api.internal/internal/incident-links/rtc-status`.
- `yokup-api` → `yokup-rtc`: binding `RTC` (mismo nombre que en `yokup-site-gate`), para `POST https://yokup-rtc.internal/internal/portal/sync`.

**Rutas internas que el fetch público no alcanza.** En yokup-rtc el puente solo atiende `/internal/portal/*`; el resto de `/internal/*` (p. ej. `/internal/mcp/incidents/*` del MCP de flota, que llega por el binding `RTC` del gate con host `api.yokup.com` y Bearer de ejecutor) sigue su camino con su propia comprobación de confianza. En yokup-api el puente es `/internal/incident-links/*`. Las dos rutas del puente exigen:

- host `yokup-rtc.internal` / `yokup-api.internal`: Cloudflare enruta el tráfico público por el Host, y esos nombres no son zonas de nadie, así que una petición de Internet solo puede llegar con `api.yokup.com`, `data.yokup.com` o `*.workers.dev`;
- y que **no** traiga `CF-Connecting-IP` ni `CF-Ray`, que el borde pone siempre en el tráfico público y que un binding no añade.

Si no se cumple, `404` (no se revela que la ruta existe).

**Idempotencia y anti-bucle.** La sincronización es un **diff contra el último estado acordado**, no una cola de eventos:

- B empuja una incidencia solo si su estado actual ≠ `incident_links.last_synced_state` (o si aún no tiene ticket). Cuando A cambia B (cierre desde Yokup), B guarda el estado resultante como acordado: no lo rebota.
- A solo empuja **cierres que B aún no tiene**: ticket `resolved`/`cancelled` con `portal_links.portal_state` distinto de `resolved`/`rated`. Lo que llega de B se guarda en `portal_state` y nunca se devuelve; tras el empuje, la respuesta de B deja `portal_state` en `resolved` (cerrada) o reabre el ticket (técnico asignado), así que la condición deja de cumplirse.
- Cada respuesta trae el estado resultante del otro lado, y el emisor lo aplica con las mismas reglas. Un rechazo (técnico asignado) converge en la misma llamada.
- El espejo no se puede duplicar: `portal:<id>` + `idx_active_screen` en A, `rtc_ticket_id UNIQUE` en B, `external_id` idempotente en el Desk.

**Reintentos.** Si el otro worker no responde, la fila guarda `attempts`, `last_error` y `next_attempt_at` (espera exponencial 1, 2, 4… hasta 60 min). Lo reintenta el cron de 2 min de cada worker.

**Puntos de cambio.** No hace falta enganchar cada `UPDATE`: como la sincronización es un diff, basta con dispararla

- en B, tras cualquier escritura con éxito en `/api/retailer/*`, `/api/installer/*`, `/api/desk/*` y `/mcp/*` (`ctx.waitUntil`), y en el cron;
- en A, tras `/ticket/status` y `/tickets/status` (`ctx.waitUntil`) y en la rutina programada (paso `portalBridge`, que también recoge los cierres del reconcile).

El cron de cada lado es a la vez la **conciliación periódica**.

## 6. Qué NO se sincroniza y quién ve qué

Viaja de B a A solo lo necesario para operar: título, descripción del problema (máx. 500), prioridad, canal, nombre y tipo del equipo, nombre del establecimiento y su slug, nombre del técnico, resolución (máx. 500), URL https de la evidencia, estrellas y «funciona sí/no», id de la hija de revisión, URL de la ficha del portal.

**No viaja**: correos, cuentas y roles del comercio, miembros y «Ver como», direcciones y coordenadas, teléfonos y expedientes de llamadas, citas e importes, comentario de la valoración, contraseñas, sesiones, tokens MCP ni ningún secreto. De A a B solo viaja el estado, el nº de ticket y una nota corta de cierre.

Permisos:

- **A** (`/incidencias`, `/ticket`): equipo Yokup con sesión Google. Ve todas las incidencias y el enlace a la ficha del portal. Esa ficha sigue pidiendo la sesión del comercio o «Ver como» (superusuario solo sobre cuentas de marca).
- **B** (`/retailer/incidencia`): el comercio ve sus incidencias y, desde ahora, el **nº de ticket de Yokup** como referencia para hablar con soporte. No ve la bandeja de A.

## 7. Implementación

| Pieza | Dónde |
|---|---|
| Enlace, diff, adopción, cierres desde A, ruta interna | `api/src/incident-links.js` · migración `api/migrations/0019_incident_links.sql` |
| Alta del Desk en el equipo del comercio + enlace `rtc:` | `api/src/incident-desk.js` (`intakeIncident`) |
| Disparo tras escrituras, cron y `/internal/*` | `api/src/index.js` · binding `RTC` en `api/wrangler.toml` |
| Nº de ticket en la ficha del portal | `yokup_ticket` en `api/src/retailer-portal.js` · `yokup-site/retailer-incidencia.js` |
| Espejo, estados, empuje de cierres, marca | `yokup-rtc/src/portal-bridge.js` · `portal_links` en `applySchema` · binding `INCIDENT_DESK` en `yokup-rtc/wrangler.toml` |
| Guardas: `/ticket/status` 409 y reconcile sin auto-cierre con técnico asignado | `yokup-rtc/src/index.js` |
| Establecimiento en el encargo del sensor | `yokup-rtc/src/incident-sensors.js` (`admira:{store_id,device_id}`) |
| Marca «Portal del comercio · establecimiento» | `yokup-site/incidencias.html` (+ `incidencias-portal.css`), `yokup-site/ticket.html` |

Pruebas: `api/incident-links.test.mjs`, `yokup-rtc/portal-bridge.test.mjs` (incluye un extremo a extremo con los dos lados reales conectados por bindings simulados), `yokup-rtc/reconcile-autoclose.test.mjs` y `yokup-site/incidencias-unificadas.test.mjs`.

## 8. Orden de despliegue

1. `cd api && npx wrangler d1 migrations apply yokup-db --remote` (aplica `0019_incident_links.sql`, aditiva).
2. `cd api && npx wrangler deploy` (yokup-api con el binding `RTC` y la ruta interna).
3. `cd yokup-rtc && ./deploy.sh` (yokup-rtc: `portal_links` se crea sola en `applySchema`; binding `INCIDENT_DESK`).
4. `cd yokup-site && node deploy.mjs` (marca en `/incidencias` y nº de ticket en la ficha del portal).

El orden 2↔3 es tolerante: mientras el otro no esté publicado, cada lado guarda el error y reintenta. **Requisito**: los dos workers tienen que estar en la **misma cuenta de Cloudflare** (los service bindings no cruzan cuentas). `yokup-rtc` fija `account_id = 5b14…`; `api/wrangler.toml` no lo fija. Compruébalo antes del paso 2 (`npx wrangler deployments list` en `api/` con la sesión de la cuenta de gmail).

## Cerrar incidencia (7-oct-2026 · GrokBot · MacBookPro16)

ES: «Si damos de alta una incidencia tenemos que poder cerrarla» (Carlos).
- Portal del comercio (admira.app/retailer · Mi comercio): botón **Cerrar incidencia** en cada incidencia activa, con nota de resolución opcional y confirmación. `POST /api/retailer/incidents/:id/close {note}` (idempotente, solo el dueño o delegados con edición; lectura → 403). Queda `resolved`, `resolution='Cerrada por el comercio: …'`, `resolved_at` y línea `cerrada_comercio` con quién. El cierre viaja a Yokup por incident_links (estado `resolved`) y de ahí al gemelo.
- Gemelo admira.store (Matrix · Incidencia · Starbucks): **✓ Cerrar incidencia** sobre la pantalla averiada y en el panel. `POST https://api.yokup.com/incident {close:true,id|resource,by,note}` — carril público SOLO para recursos `demo:`; `{start:true}` pasa a en curso. Con técnico asignado en el portal → 409 (se cierra allí con evidencia).
- `GET /incident/status` añade `resolution` (nota del cierre) junto a `closed_by` y `resolved_at`; el gemelo pinta «Cerrada por … · hora · «nota»» y la pantalla vuelve a emitir.
- Ficha Yokup (`/ticket`): «✓ Finalizar» pide nota de resolución opcional (viaja como `note`).

EN: Retailer portal **Close incident** (optional note, confirmation; idempotent `POST /api/retailer/incidents/:id/close`), twin **✓ Close incident** (public `POST /incident {close:true}` limited to `demo:` resources), `/incident/status` exposes `resolution`, and the Yokup ticket close asks for an optional resolution note.
