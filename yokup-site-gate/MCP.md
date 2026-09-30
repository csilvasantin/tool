# MCP canónico de Yokup

Versión 1.3.0 · 2026-09-30 · incidencias (FLT-101298, MorfeoMacMini · MacMini).
Versión 1.1.0 · 2026-09-06 · InfraOraculoMacMini · Codex APP. Misión: FLT-2143.

- Servidor: https://yokup.com/mcp
- Ayuda humana: https://www.yokup.com/help#mcp
- Contrato para agentes: https://www.yokup.com/mcp/llms.txt
- Esquemas: https://www.yokup.com/mcp/manifest.json y `tools/list`.

## Arquitectura y alcance

`src/mcp.js` corre dentro de `yokup-site-gate`, antes de la redirección del dominio
sin www. POST /mcp y /mcp/ hablan MCP; navegación GET sigue mostrando documentación.
No se modifica el motor de misiones ni el bot existente. Los bindings RTC y TELEGRAM
alcanzan `yokup-rtc` y `admira-telegram`; DB comparte la base canónica `yokup-tickets`.
La migración aditiva crea únicamente `yokup_mcp_credentials` y `yokup_mcp_deliveries`.
No usa ni modifica las tablas de migraciones de yokup-rtc.

Cada clave individual se almacena como SHA-256 con actor, máquina, proyectos,
permisos, caducidad y revocación. El cliente no decide su emisor. La clave de panel
de Telegram y la de ejecutor viven sólo como secretos del gate, nunca en los
archivos públicos ni en respuestas. No hay OAuth en esta versión: es un conector
de servicio para clientes con Bearer o stdio. No anuncia compatibilidad directa
con clientes que requieren OAuth.

Desde 1.1.0 también se acepta la clave común persona + equipo del directorio
FLT-2137. El gate vendoriza `src/identidad-flota.mjs` y fija su SHA-256 en pruebas.
Deriva la identidad con el secreto Worker `MCP_FLOTA_SEED` y vuelve a consultar el
censo de Yokup para limitar los proyectos. La semilla y la clave recibida no se
guardan, registran, transmiten al binding RTC ni devuelven. Sin semilla, sin censo o
con una identidad ambigua, falla cerrado. Las credenciales individuales existentes
siguen siendo autoritativas aunque la semilla o el censo no estén disponibles.

Los mensajes/encargos reutilizan bot-inbox, incluido el aviso a AgoraMatrix y su
mecanismo de despertar consejeros GrokBot. `kind=message` no crea misión;
`kind=assignment` permite que el flujo existente la materialice. Un recibo en cola
no acredita ejecución. La bandeja se filtra por identidad exacta y proyecto
comprobable desde la misión o recibo MCP. Entradas antiguas sin proyecto quedan
fuera del MCP y siguen disponibles en la bandeja habitual para operadores.

La reserva SQL por actor+request_key evita duplicar envíos concurrentes. Un timeout
queda `unknown`; una caída entre reserva y escritura puede dejar `pending`.
Ninguno se reenvía automáticamente. Se debe contrastar la bandeja y reconciliar
manualmente la fila antes de cualquier nuevo envío. Límite atómico de 20/min/actor.
La aceptación de la notificación de Telegram se informa separada del guardado.

## Preparación de producción (operador autorizado)

Desde `yokup-site-gate`:

```sh
npx wrangler@4.119.0 d1 execute yokup-tickets --remote --file migrations/0001_mcp.sql
```

Instalar los secretos `MCP_TELEGRAM_TOKEN` (valor de ADMIRA_TELEGRAM_PANEL_KEY en
la bóveda) y `MCP_EXECUTOR_TOKEN` (YOKUP_CLI_EXECUTOR_TOKEN). Pasarlos por stdin a
`wrangler secret put`, sin argumentos que contengan sus valores ni registro en git.
Instalar también `MCP_FLOTA_SEED` desde `s:MCP_FLOTA_SEED` por stdin. Comprobar sólo
el nombre del binding con `wrangler secret list`; no imprimir ni comparar su valor.
El despliegue normal de `yokup-site/deploy.mjs` publica sitio y gate con estos
bindings. No publicar desde una rama divergente: integrar primero en origin/main
según las guardas existentes. Conservar los secretos en sucesivos despliegues.

## Emitir una conexión individual

Primero comprobar la identidad del titular, su máquina y sus proyectos en el censo.
Ejemplo operativo para la identidad de esta misión:

```sh
node tools/mcp-credential.mjs issue OraculoMacMini MacMini yokup /ruta/privada/yokup.json
```

El script valida el censo, genera 32 bytes aleatorios, escribe un archivo 0600 sin
sobrescribir y da de alta sólo el hash. Caduca a los 30 días. El archivo es SECRETO:
transferirlo por un canal privado autorizado, nunca por el help ni por Telegram.
Crear claves separadas para WozniakGrokBot, JobsGrokBot, DisneyGrokBot y LucasGrokBot
cuando sus operadores activen cada conexión; no compartir la clave de Oráculo.
Emitir una credencial no instala ni activa el MCP en otro cliente.

Para renovar, emitir otra credencial y probarla, cambiar el archivo del cliente y
revocar la anterior. Para revocar, ejecutar la sentencia por token_hash que imprime
el script mediante `wrangler d1 execute --remote --file /ruta/revocacion.sql`.
El hash identifica la clave sin revelarla. `revoked_at` no debe volver a NULL.
Para mínimos permisos, ajustar scopes antes de entregar: read, inbox, send, work
(por defecto) e `incidents` / `incidents:write` solo si se piden con `--scopes`;
los proyectos se guardan como array JSON de slugs. No ampliar acceso sin autorización.
Si el alta devuelve error incierto, conservar el archivo y consultar su hash antes
de reintentar: no perder una clave que quizá ya quedó registrada.

Con incidencias (lectura y escritura), para un agente concreto:

```sh
node tools/mcp-credential.mjs issue <PersonaMáquina> <Máquina> <proyecto> /ruta/privada/<persona>.json \
  --scopes read,inbox,send,work,incidents,incidents:write
```

`--scopes` acepta cualquier subconjunto de `read,inbox,send,work,incidents,incidents:write`;
`incidents:write` exige también `incidents`. Solo lectura del tablero: `--scopes read,incidents`.
Las credenciales ya emitidas NO ganan incidencias: hay que emitir otra (o, con autorización,
actualizar su columna `scopes`).

## Incidencias (1.3.0 · FLT-101298)

Seis herramientas sobre el tablero de https://www.yokup.com/incidencias. Solo tickets de
CAMPO: una misión de flota (source fleet, decision-batch, cli-declare o role=mission)
devuelve `not_an_incident`, porque su cierre exige pantallazo, aceptación y
`/fleet/informe` y este carril no puede servir de atajo.

| Herramienta | Scope | Qué hace |
|---|---|---|
| `yokup_incidents_list` | `incidents` | `{state?, project_id?, source?, kind?, q?, limit?}`. state: `vivas` (open+in_progress, defecto), `open`, `in_progress`, `resolved`, `cancelled`, `todas`. limit ≤ 200. Devuelve id, subject, status, priority, kind, source, project_id/project, loc, resource, assignee, created_at, updated_at, url. |
| `yokup_incident_get` | `incidents` | `{id}` → la ficha + `events` (hasta 200: id, ts, kind, author, text). |
| `yokup_incident_open` | `incidents:write` | `{subject, kind, severity, detail?, resource?, loc?, project_id?}`. kind: screen, service, machine, agent, network, content, external. severity: urgente, alta, normal, baja. Una activa por recurso: si ya existe, se suma (`deduplicated:true`). Sin `resource`, se deriva `mcp:<kind>:<asunto>`. Con `loc` y sin `project_id`, proyecto del establecimiento (incident-project.js). Devuelve `{id, url}`. source = `mcp`. |
| `yokup_incident_note` | `incidents:write` | `{id, text}`. Si estaba `open` pasa a `in_progress` (como /ticket/note). |
| `yokup_incident_update` | `incidents:write` | `{id, status, note?}`; `resolved` y `cancelled` exigen `note`. Evento `Estado → x: nota`. |
| `yokup_incidents_close_bulk` | `incidents:write` | `{ids[≤100], status: resolved\|cancelled, note}`. Todo o nada: un id inexistente o que sea misión rechaza el lote (`invalid_batch`). |

**Autoría y auditoría.** El autor de cada evento es `Persona · Máquina` de la credencial
(p. ej. `OraculoMacMini · MacMini`); el cliente no puede enviarlo (el esquema lo rechaza).
Cada escritura deja además una fila en `mcp_incident_audit` (ts, actor, machine, action,
ticket_ids, status, detail), creada por yokup-rtc la primera vez que se usa.

**Confianza gate → yokup-rtc.** El gate llama por el service binding `RTC` a
`/internal/mcp/incidents{,/get,/open,/note,/status,/bulk-status}` con
`Authorization: Bearer MCP_EXECUTOR_TOKEN`: el MISMO secreto y mecanismo que ya usa
`yokup_activity` para `/fleet/progress` (en yokup-rtc es `YOKUP_CLI_EXECUTOR_TOKEN`).
No hay secreto nuevo. Como ese token también lo tienen los ejecutores CLI, yokup-rtc exige
además que la petición no traiga `CF-Connecting-IP` (la pone el borde de Cloudflare en todo
tráfico público y no se puede quitar) ni `Origin`: desde Internet, `/internal/...` responde
**403 internal_only** aunque se presente el token; sin token, 401. Código:
`yokup-rtc/src/fleet-incidents.js`.

Ejemplos por curl (sustituye `$YOKUP_MCP_KEY` por tu credencial, sin pegarla en logs):

```sh
H=(-H "Authorization: Bearer $YOKUP_MCP_KEY" -H 'Content-Type: application/json' \
   -H 'Accept: application/json, text/event-stream' -H 'MCP-Protocol-Version: 2025-11-25')

# Vivas del establecimiento
curl -s https://yokup.com/mcp "${H[@]}" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
 "params":{"name":"yokup_incidents_list","arguments":{"state":"vivas","q":"alsea-sbux-021","limit":20}}}'

# Abrir
curl -s https://yokup.com/mcp "${H[@]}" -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
 "params":{"name":"yokup_incident_open","arguments":{"subject":"Player sin emisión en caja 2",
 "kind":"screen","severity":"alta","loc":"alsea-sbux-021","detail":"Pantalla negra desde las 10:05"}}}'

# Nota y cierre
curl -s https://yokup.com/mcp "${H[@]}" -d '{"jsonrpc":"2.0","id":3,"method":"tools/call",
 "params":{"name":"yokup_incident_note","arguments":{"id":"INC-XXXXXX","text":"Reinicio remoto lanzado"}}}'
curl -s https://yokup.com/mcp "${H[@]}" -d '{"jsonrpc":"2.0","id":4,"method":"tools/call",
 "params":{"name":"yokup_incident_update","arguments":{"id":"INC-XXXXXX","status":"resolved","note":"Vuelve a emitir"}}}'

# Cierre en bloque (≤100)
curl -s https://yokup.com/mcp "${H[@]}" -d '{"jsonrpc":"2.0","id":5,"method":"tools/call",
 "params":{"name":"yokup_incidents_close_bulk","arguments":{"ids":["INC-AAAAAA","SVC-BBBBBB"],
 "status":"cancelled","note":"Duplicadas del monitor"}}}'
```

Una credencial sin el scope no ve estas herramientas en `tools/list` y `tools/call`
responde `-32602 Unknown or unauthorized tool` sin llegar a yokup-rtc. Los rechazos de
yokup-rtc llegan como `isError:true` con su código (`not_found`, `not_an_incident`,
`note_required`, `invalid_batch`, `resource_is_mission`, `invalid_project_id`).

**Orden de despliegue.** Primero `yokup-rtc/deploy.sh` (rutas internas); después el gate
(`yokup-site/deploy.mjs` o `yokup-site-gate/deploy.sh`). Al revés, las herramientas
aparecerían en `tools/list` y fallarían con 404 hasta publicar yokup-rtc. No hace falta
migración D1 ni secreto nuevo: `MCP_EXECUTOR_TOKEN` ya está instalado en el gate.

## Conectar y comprobar

Remoto: URL `https://yokup.com/mcp`, autenticación Bearer con la clave privada.
Alternativa stdio (Node >=22):

```json
{"mcpServers":{"yokup":{"command":"node","args":["/ruta/absoluta/mcp-stdio.mjs","/ruta/privada/yokup.json"]}}}
```

El puente no imprime la clave, no sigue redirecciones y no reintenta escrituras.
El cliente debe mostrar la identidad de `yokup_whoami` antes de operar. Cambiar de
cuenta requiere cambiar también de credencial: el MCP identifica al titular de
la clave, no la cuenta Google/ChatGPT/Claude que tenga abierta el operador.

Validación local: `node --test *.test.mjs` en `yokup-site-gate`; pruebas SQLite de
credenciales, permisos, mensajes, reintentos, aislamiento, contrato HTTP y rutas
reales del gate. `node --test mcp-help-puertas.test.mjs` en `yokup-site` valida docs.
Prueba real de conexión: initialize → notifications/initialized → tools/list →
yokup_whoami → yokup_mission con esta referencia, sin enviar mensajes a terceros.
No confundir esta prueba de lectura real con una conversación real con un consejero.

Fuentes: [MCP transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
y [tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

## Verificación de la entrega · 2026-09-05

Publicación confirmada: **v.05.09.2026.r24.20:22**, código `73035a4`.
El endpoint público `__yokup-gate` devolvió ese commit y `dirty:false`.

- 1.375 pruebas del sitio y 28 pruebas del gate aprobadas (incluyen 14 de MCP).
- SDK oficial `@modelcontextprotocol/sdk@1.30.0` conectado contra producción:
  initialize, notifications/initialized, tools/list (11 herramientas), identidad,
  misión exacta y bandeja sin consumir; rechazo comprobado de proyecto ajeno.
- El mismo SDK conectó mediante el puente stdio y verificó OraculoMacMini/MacMini.
- /mcp, /help, /mcp/manifest.json y /mcp/llms.txt respondieron 200 con su contenido.
  POST /mcp sin credencial devolvió 401.
- `yokup_activity` publicó una acción real de esta misión y devolvió
  `work_binding.bound:true` y `work_activity.accepted:true`.
- `yokup_task_update` actualizó la tarea b de esta misión y persistió su informe.
- Envío, reintentos concurrentes, timeout incierto, firma y aislamiento se probaron
  con SQLite y el servicio de mensajería simulado. **No se envió un mensaje real a
  un consejero** ni se afirmó que un tercero hubiera instalado su conexión.

Se emitió una credencial privada para OraculoMacMini, limitada al proyecto yokup,
y se validó en ambos transportes. Las conexiones de otros agentes o consejeros se
activan individualmente siguiendo el procedimiento anterior. El servidor está
publicado; la activación de cada cliente es un paso diferente y verificable.
