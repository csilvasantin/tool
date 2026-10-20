# Supervisor · /demo incidencia

Encargo #6847 · recepción, retirada específica y parte privado. Responsable local: SubOraculo / OraculoMacMini.

## Estado de la preparación

Implementación preparada en `codex/6847-supervisor-demo`, sin publicar. La petición original exige OK de Carlos antes de publicar. El ensayo físico completo todavía **no** está acreditado.

La pestaña existente de `https://www.admira.app/supervisor` se inspeccionó sin mover ventanas: `alsea-sbux-021` seleccionado, inventario con acceso restringido, controlador remoto de laboratorio existente y cámara local parada. No se elevan privilegios desde el navegador ni se arranca otro vigilante. El laboratorio de Gran de Gràcia y sus tickets existentes no son las pantallas Alsea del ensayo.

## Recorrido preparado

`/demo incidencia` en la consola local, o «Demo incidencia», lleva a la bandeja. Se consulta cada cinco segundos mientras la pestaña está visible. Un fallo mantiene los datos anteriores señalizados como obsoletos y deshabilita las acciones hasta actualizar.

Cada aviso tiene UUID estable, ticket canónico, tipo popup, CI, destino obtenido del vínculo demo del servidor, descripción, captura privada y hora. El control solo retira el popup de ese evento. `queued`, `unknown`, `failed` e `ignored` no permiten cerrar. El recibo debe coincidir en evento, pantalla y petición.

Para cerrar se exige recibo `executed`, causa, acción, captura posterior distinta y reciente, hora posterior al recibo y revisión explícita del operador. Los bytes deben guardarse y releerse en R2 antes de la transacción que cierra el ticket. La revisión declarada no equivale a una detección óptica automática ni acredita el encendido físico. Si lo lleva un técnico, se cierra en su portal.

El parte se envía después del cierre: dos fotos almacenadas, causa, acción, horas, duración y enlace. El destino privado y el bot solo se configuran en el servidor. No existe fallback al grupo. Se conserva el recibo de Telegram con `read:false`. Una entrega incierta no se repite automáticamente; un rechazo explícito sí permite reintento. La duración muestra si el ciclo superó tres minutos.

## Contrato de integración propuesto a Elon

Todas las rutas pasan por la sesión existente del perímetro y la capacidad de supervisión del servidor. Se conserva la misma política de ITIL/control: operador con `allowed && canChangeProject`, o entrada oficial de agentes. Una sesión Google por sí sola no concede esa capacidad.

Base: `https://api.yokup.com/supervisor/demo/incidents`.

| Método/ruta | Contrato |
| --- | --- |
| POST base | `{event_id:UUID,xpacio,code,description,observed_at:UnixMS,before:{type:"image/jpeg"\|"image/png",base64}}` |
| GET base `?xpacio=...` | Bandeja, estado canónico, fecha de consulta y configuración disponible |
| GET `/:event_id` | Ficha persistida |
| GET `/:event_id/before` o `/after` | Bytes privados; sesión y capacidad obligatorias |
| POST `/:event_id/clear` | `{request_id:UUID}` estable; reserva antes de contactar al player |
| POST `/:event_id/receipt` | `{}`; consulta sin reenviar |
| POST `/:event_id/close` | `{cause,action,captured_at:UnixMS,reviewed_recovered:true,after:{type,base64}}` |
| POST `/:event_id/report` | `{}`; envío privado de las capturas persistidas |

Imágenes: JPEG/PNG hasta 4 MiB, firma de bytes coherente, SHA-256 y verificación de persistencia. Petición JSON limitada a 6 MiB incluso sin Content-Length. Capturas recientes: dos minutos. La clave R2 `supervisor-demo/…` no se sirve por la ruta pública `/media/…`.

No se acepta `screen`, destinatario Telegram, credenciales, recibo ni estado impuestos por el cliente. El CI debe seguir activo en el maestro; `screen` se resuelve desde `supervisor_device_bindings` con `scope=demo`. Un cambio de vínculo impide enviar una orden al destino anterior.

### Adaptador de retirada pendiente de acoplar

Binding **`SUPERVISOR_DEMO_CONTROL`**, sin fallback a `fault-clear` genérico:

```text
POST https://supervisor-demo-control.internal/popup-clear
{event_id,screen,xpacio,code,request_id}

GET https://supervisor-demo-control.internal/popup-clear?request_id=UUID

{event_id,screen,request_id,status,applied_at}
status: queued | executed | failed | ignored | unknown
applied_at: UnixMS obligatorio para executed
```

El adaptador debe retirar solo el popup del evento y devolver el recibo real del player. La URL es el contrato interno del binding propuesto, **no un servicio actualmente comprobado**. Sin binding, la interfaz muestra que falta conectar el control y el servidor rechaza la orden. El contrato canónico de Admirito/Bugito, su acoplamiento y la autorización del operador siguen pendientes de la coordinación con Elon. No se inventa una API productiva ni se llama a un reset global.

### Telegram privado

Secretos de servidor pendientes de configurar/verificar por el procedimiento autorizado:

- `SUPERVISOR_TELEGRAM_BOT_TOKEN`.
- `SUPERVISOR_TELEGRAM_PRIVATE_CHAT_ID`: chat privado configurado de Carlos, identificador positivo. Nunca grupo.

Se usa `sendMediaGroup` para enviar directamente los dos objetos privados, sin publicar URLs ni revelar las claves R2. Solo se da entrega por confirmada cuando Telegram devuelve dos mensajes del chat privado configurado. Las excepciones del transporte no exponen la URL con el token.

Antes del envío se consulta la verja global `fleet_publish` por el binding existente `TELEGRAM` (`/api/telegram-auto`). Si está parada o no se puede confirmar su estado, no se envían fotos y el parte queda reintentable. No se altera el interruptor.

## Pruebas y límites

`node --test supervisor-demo.test.mjs` comprueba SQLite real, autorización, origen, validación, persistencia, reintentos estables, cola frente a ejecución, recibos cruzados, fallos de foto, cierre canónico, asignación técnica, chat privado y entrega incierta. El transporte del player y Telegram se inyecta de forma explícita.

`scripts/check-supervisor-demo.mjs` usa Chromium headless con el HTML y JS de esta rama, workerd/Miniflare, D1 y R2 aislados en un directorio temporal. No toca cuentas, incidencias, cámaras ni chats productivos. Prueba subida fallida, conexión fallida, conservación de formulario y foto, cierre persistido, recarga, autorización y anchuras 375/390/768/1440. Los transportes de player y Telegram son simulados y las capturas incluyen el rótulo «PRUEBA AISLADA».

```sh
MINIFLARE_MODULE=/ruta/node_modules/miniflare \
ESBUILD_MODULE=/ruta/node_modules/esbuild \
PLAYWRIGHT_MODULE=/ruta/node_modules/playwright \
node scripts/check-supervisor-demo.mjs
```

Antes de considerar terminado el encargo: acoplar el aviso real de Admirito y la retirada específica de Bugito, verificar capacidad del operador, configurar y comprobar el chat privado, obtener OK de Carlos para publicar según los scripts canónicos y realizar el ensayo físico completo en tres minutos con capturas antes/después y entrega Telegram confirmada. La lectura humana se comprueba aparte.

Comprobación de esta preparación, 20 octubre 2026: 1.426 pruebas RTC pasan y una queda omitida; 1.683 pruebas del sitio pasan; 16 comprobaciones headless del flujo aislado pasan en las cuatro anchuras. La suite inicial del backend no pudo cargar `@cloudflare/puppeteer`; tras instalar las dependencias del lockfile con `npm ci --ignore-scripts`, la suite completa pasa. `https://www.admira.app/supervisor` responde HTTP 200 y conserva la versión publicada anterior. No se ha publicado esta rama ni se han creado tickets productivos para probarla.
