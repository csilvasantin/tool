# MCP canónico de Yokup

Versión 1.1.0 · 2026-09-06 · InfraOraculoMacMini · Codex APP.
Misión: FLT-2143.

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
Para mínimos permisos, ajustar scopes antes de entregar: read, inbox, send, work;
los proyectos se guardan como array JSON de slugs. No ampliar acceso sin autorización.
Si el alta devuelve error incierto, conservar el archivo y consultar su hash antes
de reintentar: no perder una clave que quizá ya quedó registrada.

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
