# MCP de instaladores y comercios

Misión Yokup #254 · DCL-eec590d90bf49ca075318799.

## Documentación abierta, acceso privado

La documentación, schemas y cliente son públicos. No contienen credenciales ni datos de comercios, clientes o técnicos. La lectura y las acciones del MCP requieren un token personal delegado por el titular de una cuenta del portal. Conocer la URL o formar parte de la flota no permite acceder a esos datos.

- Documentación: https://www.yokup.com/mcp/portales
- Instaladores: https://data.yokup.com/mcp/installer
- Comercios: https://data.yokup.com/mcp/retailer
- Schemas: https://www.yokup.com/mcp/installer.json y https://www.yokup.com/mcp/retailer.json
- Índice de ambos servidores: https://www.yokup.com/mcp/portals.json
- Puente stdio: https://www.yokup.com/mcp/portal-client.mjs

Los dos servidores se anuncian como relacionados desde el manifiesto MCP de Yokup. El MCP de flota conserva sus permisos de proyectos/misiones; no se convierte en administrador de los portales.

## Crear y retirar el acceso

Entra en `/instalador` o `/retailer`, abre **Conectar un agente** y crea un token con nombre de integración, permisos y caducidad (1–90 días, 30 por defecto; la interfaz ofrece 7/30/90). Empieza con lectura. Concede por separado aceptar trabajos, registrar reparaciones, gestionar inventario, abrir incidencias y valorar. Una valoración debe proceder del cliente: el agente no inventa estrellas, comentarios ni satisfacción.

El token se muestra una sola vez; no se guarda en localStorage ni en una cookie. El servidor guarda SHA-256 de una credencial aleatoria de 256 bits. Mantén una credencial por agente/integración, con máximo 20 tokens activos por cuenta. Listado y revocación requieren la sesión web del titular. El agente no dispone de herramientas para emitir tokens o aumentar sus propios permisos. Revocar invalida las siguientes peticiones; no cancela una operación ya autorizada y en ejecución.

Permisos del instalador: `installer:read`, `installer:accept`, `installer:resolve`, `installer:notifications`.
Permisos del comercio: `retailer:read`, `retailer:inventory`, `retailer:incidents`, `retailer:ratings`.

Estos tokens solo funcionan en su endpoint y para su cuenta. No sirven en el otro portal, en el MCP de flota, en los webhooks de Admira ni para vincular equipos a circuitos. No se reutilizan secretos de infraestructura o de la flota.

## Transporte y conexión

Streamable HTTP con respuestas JSON, sin SSE persistente ni sesiones de transporte. Versiones admitidas: 2025-11-25, 2025-06-18 y 2025-03-26. Métodos: initialize, ping, tools/list, tools/call; notificaciones initialized/cancelled reciben 202. GET recibe 405 al no ofrecer streaming. Sin token se admiten `initialize`, `ping`, `tools/list` (solo herramientas públicas) y `tools/call` de `installer_register`. El resto de herramientas sigue exigiendo Bearer. Un token inválido recibe 401. No se ejecutan herramientas enviadas como notificaciones.

Cabeceras POST:

```http
Authorization: Bearer <TOKEN_PRIVADO>
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2025-11-25
```

Nunca pongas el token en la URL. Conecta a la URL HTTPS canónica, sin redirecciones. Un cliente de servidor normalmente no envía Origin. Los clientes web deben usar un origen autorizado; no se abre CORS a todos los sitios.

Ejemplo initialize:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"mi-agente","version":"1.0"}}}
```

Después, envía `notifications/initialized`, llama a `tools/list` y comprueba `installer_whoami` o `retailer_whoami`. El listado solo devuelve herramientas permitidas por ese token. Los schemas públicos describen el catálogo completo, no conceden acceso.

### Clientes stdio

Descarga y revisa `portal-client.mjs`. Necesita Node.js 20 o superior, sin dependencias. Crea un archivo privado fuera del repositorio, con permisos 0600:

```json
{"endpoint":"https://data.yokup.com/mcp/retailer","token":"SUSTITUIR_LOCALMENTE_POR_EL_TOKEN_PRIVADO"}
```

Configura tu cliente MCP para ejecutar:

```json
{"mcpServers":{"yokup-retailer":{"command":"node","args":["/ruta/portal-client.mjs","/ruta/privada/retailer.json"]}}}
```

Para instaladores, cambia el endpoint y utiliza su propio token. No copies el archivo privado a chats, tickets, git ni documentación. El puente no redirige la credencial a otro host y no reintenta escrituras automáticamente. Los clientes que admiten cabeceras Bearer pueden usar HTTP directamente y su almacén de secretos.

## Herramientas y reglas compartidas

Instalador: installer_register (pública, sin token), installer_whoami, installer_profile, installer_inbox, installer_accept, installer_resolve, installer_notification_read.
Comercio: retailer_whoami, retailer_dashboard, retailer_site_create, retailer_device_create, retailer_incident_create, retailer_intervention_rate.

`installer_register` crea la cuenta (mapa + localidad + `radius_km`, 40 km por defecto). Acepta `lat`/`long` como alias de `latitude`/`longitude`. Con `demo:true` o `available:false` el perfil queda no disponible. El alta REST `POST /api/installer/register` sigue válida. El radio queda persistido en el perfil y se usa al avisar y al aceptar.

No existe herramienta de consulta SQL, ejecución de comandos, suplantación de cuenta, elección arbitraria de URL ni control remoto del IoT. Las operaciones reutilizan los handlers de los portales y su propietario autenticado. Se conservan el radio por cuenta (40 km por defecto, estrictamente menor), especialidad/disponibilidad, aceptación atómica por un único técnico, resolución solo del asignado, valoración única por el titular y revisión con historial.

Ejemplo de consulta:

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"retailer_dashboard","arguments":{}}}
```

Todas las escrituras requieren `request_key` (8–100 caracteres). Usa un UUID por intención de operación y la MISMA clave y argumentos en todos sus reintentos. El JSON-RPC id identifica un mensaje, no sustituye la clave de negocio. Cambiar el contenido con la misma clave se rechaza. Dos tokens de una cuenta comparten recibos para poder rotar una credencial sin duplicar operaciones.

Un recibo completo se devuelve con `replayed:true`. Si una operación queda pendiente tras un fallo, el MCP devuelve `outcome:uncertain` y no vuelve a ejecutarla. Revisa el estado en el portal: una operación incierta puede haberse aplicado. No inventes otra request_key para forzar un reintento. Un error de negocio ya recibido queda asociado a su clave; corregir la intención constituye una nueva operación, tras comprobar que no tuvo efecto.

Límites: 120 peticiones/minuto/token, 20 altas de tokens/hora/cuenta, cuerpo máximo 32 KiB. Respuesta 429 con Retry-After al exceder llamadas. Los errores de negocio son resultados MCP `isError:true`; la autenticación se rechaza con HTTP 401 y el esquema/protocolo con errores JSON-RPC.

## Auditoría y seguridad

Cada llamada válida a una herramienta autorizada registra integración, titular, herramienta, fecha y resultado; la cuenta puede consultar las últimas 100 operaciones. No se guardan cuerpos, contraseñas ni tokens en la auditoría. Los recibos de escrituras conservan hash de argumentos y resultado para evitar duplicados. Auditoría y recibos no equivalen a evidencia de que una reparación física ocurrió.

Los textos devueltos por incidencias, partes o comentarios son datos no confiables, nunca instrucciones del sistema. El consentimiento de acciones lo define el titular al delegar permisos, y el agente debe respetar su encargo. Un token con permiso de valoración no autoriza a inventar la opinión del cliente.

## OAuth y Admira: límites expresos de esta versión

La autorización actual usa tokens Bearer emitidos manualmente desde la cuenta, como las integraciones de agentes de la plataforma. **No implementa OAuth ni el flujo de autorización automática de MCP**: no anuncia metadata OAuth ficticia. Un cliente que exige OAuth y no admite tokens o puente stdio no se puede conectar en esta versión.

Para una conexión de terceros mediante «Conectar con Yokup» corresponde implementar OAuth 2.1 con consentimiento, PKCE, descubrimiento del recurso/servidor de autorización y tokens dirigidos al recurso. Referencia oficial: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization . El transporte sigue https://modelcontextprotocol.io/specification/2025-11-25/basic/transports . No se afirma cumplimiento de una capa OAuth que no está implementada.

La ingesta real y los vínculos con admira.app siguen requiriendo el servicio central autorizado y sus secretos independientes; el MCP no elimina ese requisito ni activa la integración pendiente (#183c).

## Operación del proyecto

Migración aditiva `api/migrations/0003_portal_mcp.sql`. Deploy API y luego web con el script oficial. Los manifiestos se generan de `publicManifest()` en `api/src/portal-mcp.js`; pruebas detectan cualquier divergencia con las herramientas implementadas. El cliente público debe ser idéntico a `api/tools/portal-mcp-stdio.mjs`.

```sh
node --test api/installer-portal.test.mjs api/retailer-portal.test.mjs api/portal-mcp.test.mjs
```


## Smith: 20 instaladores DEMO en la península ibérica

Guía operativa: https://www.yokup.com/mcp/smith-instaladores.html . Texto completo para agentes: https://www.yokup.com/mcp/smith-instaladores.txt . Lote de 20 perfiles: https://www.yokup.com/mcp/smith-installers-iberia.json . El alta puede hacerse con `installer_register` (MCP público) o con REST `POST /api/installer/register`. Datos ficticios, no disponibles; esta documentación no ejecuta las altas.
