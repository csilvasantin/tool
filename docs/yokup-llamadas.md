# Centro de llamadas y piloto gratuito

Misión Hoy #34 — `DCL-c756e5e241db1f402845bcf6`. Implementación: 15/09/2026.

Carlos pidió validar el flujo con una alternativa gratuita. La primera entrega usa WebRTC entre personas y un asistente de prueba con guion, texto y voz opcional del navegador. No utiliza Twilio ni OpenAI, no hace llamadas PSTN y no acredita una IA conversacional. El botón de telefonía IA está desactivado. No se han realizado llamadas ni enviado invitaciones a terceros durante la validación.

## Flujo implementado

`/llamadas` comparte las incidencias de los portales. El cron y la lectura de cola incorporan los incidentes vinculados a un retailer. El ingreso Admira existente valida HMAC y deduplica eventos. Las incidencias sin comercio vinculado no entran en esta cola.

El mapa público queda quieto al cargar. En llamadas, abrir un expediente centra el mapa en su ubicación y candidatos. El mapa reutiliza la cartografía clara del portal instalador; no cambia de caso ante nuevas incidencias. La cola prioriza urgentes, permite búsqueda por título/comercio/circuito y filtros por estado y prueba/real.

Un operador reserva el trabajo cinco minutos; un intento activo no se libera al caducar una reserva. Humano y asistente comparten esta exclusión. Abrir `tel:` exige un teléfono previamente guardado y no acredita conexión. La llamada web crea una sala con invitaciones independientes de una hora. Terminar el intento revoca la sala. Cada resultado registra actor, notas, disponibilidad y reintento opcional. Pedir una persona devuelve el trabajo a la cola humana con contexto. Los reintentos programados regresan a pendientes; no marcan automáticamente.

Los candidatos se ordenan por distancia geográfica, filtrados por disponibilidad y especialidad, a menos de 40 km. No hay estimación de tráfico ni ampliación automática. Las propuestas incluyen zona horaria, franja, trabajo e importe. Cambiar propuesta invalida acuerdos anteriores. Solo la doble aceptación expresa de la misma versión confirma y asigna; se rechazan solapes de agenda o cambios de disponibilidad/asignación. Las confirmaciones son registradas por el operador, con evidencia de la conversación; no se envían solicitudes externas automáticamente.

Las citas confirmadas aparecen también en la incidencia del retailer y en la bandeja del técnico asignado. La reparación real y la valoración siguen usando sus portales. Un resultado no satisfactorio conserva el mecanismo existente de incidencia de seguimiento. En los expedientes de prueba se recorre reparación, valoración, cierre o reapertura sin tocar inventario ni avisos reales.

## Seguridad y MCP

Superusuario: sesión existente de portales. Operador: cuenta retailer y concesión explícita por comercio en `call_operators`; no recibe privilegios de superusuario. Cada acción comprueba los permisos vigentes. Las mutaciones web exigen origen autorizado. El MCP exige Bearer y no admite cookies como autorización.

Documentación pública: `/llamadas-mcp`. Manifiesto/endpoint: `https://data.yokup.com/mcp/calls`. Tokens creados desde la sesión web, mostrados una vez, hash SHA-256 en D1, caducidad siete días y revocación. Un token no puede gestionar operadores ni emitir otros tokens. Herramientas publicadas: calls_list, calls_case, calls_reserve, calls_release, calls_finish. Las citas se gestionan desde el centro, todavía sin herramientas de mutación MCP.

Salas: host e invitado tienen tokens aleatorios de 256 bits guardados solo como hash en backend. El enlace lleva el token en el fragmento, se retira al abrir y se conserva en sessionStorage para recargar. SDP e ICE quedan limitados a la sala y rol. No se graba audio. Las señales caducadas se limpian; los resultados e historial persisten en D1. Antes de ampliar a producción masiva hay que definir retención de contactos y notas.

## Despliegue

1. Ejecutar `node --test api/*.test.mjs` desde la raíz.
2. Aplicar la migración aditiva `api/migrations/0010_calls.sql` a D1 después de comprobar que no existe el esquema. Incluye call_cases, jobs, contacts, attempts, events, proposals, acceptances, operators, rooms, signals y tokens.
3. Desde api, `npx wrangler deploy --keep-vars` para conservar configuración existente.
4. Commit/push y despliegue oficial del frontend mediante `yokup-site/deploy.mjs`, identidad OraculoMacMini/MacMini. El despliegue requiere HEAD limpio igual a origin/main y ejecuta sus pruebas y gate.
5. Verificar `/llamadas`, `/llamadas-mcp`, manifiesto y rechazo anónimo de `/api/calls/me`.

## Evidencia del piloto

La herramienta `node api/tools/calls-pilot-server.mjs` levanta un entorno efímero en 127.0.0.1:8788, con SQLite en memoria y datos ficticios. La identidad local sirve solo para esa herramienta; no se añade acceso de prueba en producción.

Piloto de interfaz ejecutado: crear expediente, reservar asistente, responder por texto, registrar disponibilidad, proponer 16/09/2026 de 10 a 11 Europe/Madrid por 65 EUR, registrar primero aceptación retailer (permanece pendiente), luego técnico (confirmada), intervención, valoración y cierre satisfactorio. Se ha usado un guion, sin activar micrófono ni hacer una llamada a otro participante. Además se ejecutó `CALLS_SYNTHETIC_AUDIO=1 node api/tools/calls-pilot-server.mjs`: dos pestañas conectaron por WebRTC y recibieron audio sintético en ambas direcciones (355/366 paquetes, 28.348/29.326 bytes en la primera observación). Se corrigió la conservación exacta de saltos CRLF en SDP y se añadió regresión. Al cerrar la sala se revocó la invitación. Este piloto acredita transporte de audio entre navegadores, no calidad con micrófonos físicos ni redes de terceros.

Pruebas automatizadas: exclusión humano/asistente, repetición de inicio, aislamiento de datos de prueba, autenticación, origen, permisos por comercio y revocación, tokens/MCP, resultados, reintentos, derivación humana, matching por radio/especialidad, doble aceptación real y asignación, versiones/cancelación obsoleta, conflictos de agenda, cierre/reapertura y protocolo de salas.

## Pendiente para el generador telefónico completo

Telefonía PSTN y agente de voz conversacional no están implementados ni conectados en esta entrega. La opción gratuita valida la coordinación; no sustituye la validación del agente telefónico. WebRTC usa STUN y no TURN: algunas redes bloquearán la conexión. La validación con micrófonos y redes de dos participantes reales queda pendiente; el transporte ya se ha probado con audio sintético. Notificaciones externas, transferencia en vivo, horarios automáticos de marcación, reconciliación con proveedor, límites de gasto y retención configurable se abordan al elegir el proveedor. La misión original no debe figurar como generador telefónico completo terminado con esta evidencia.

## Acceso Google desde navegadores integrados (23/09/2026)

El centro usa GIS en modo redirect, con FedCM desactivado para el botón. Google
vuelve a la URI ya autorizada `https://www.yokup.com/auth/callback`. El gate distingue
el estado `portal-calls.<aleatorio>` y lo envía al backend de portales; el acceso de
flota conserva su ruta. No se añaden orígenes ni permisos en Google Cloud.

La migración `0013_portal_google_redirect.sql` guarda challenges de cinco minutos.
El callback comprueba CSRF, firma, audience y nonce; devuelve un relevo de un solo
uso de 60 segundos a data.yokup.com. El relevo exige la cookie HttpOnly/Secure del
navegador que inició el proceso y solo entonces emite la sesión habitual. Los roles
se consultan en el servidor. La redirección final es fija a `/llamadas`; una cuenta
sin permiso de operador sigue sin acceder. Las respuestas de relevo no se cachean
ni transmiten el código por Referer. No se guardan credenciales en localStorage.

La interfaz distingue conectar, elegir cuenta y fallo; preparar el botón ya no
muestra «Guardado» ni acredita un inicio de sesión. Desplegar primero migración y
API, después frontend/gate con su script oficial.
