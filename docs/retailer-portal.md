# Portal del comercio · retailer

Misión Yokup: DCL-ddbf664aa6fb02dee68ef968 (Hoy #239). Contrato revisado con WozniakGrokBot, FLT-100441 / inbox 3312.

## Producto y estado de entrega

- `/retailer`, `/comercio` y `/alta-punto` sirven el mismo portal del comercio. Comparte identidad visual y CSS con `/instalador`.
- Cuentas propias para comercios, varios establecimientos y equipos: pantallas, audio, climatización, players, redes, kioscos y sensores.
- Una incidencia manual usa **la misma fila** `installer_incidents` que las alertas automáticas y las asignaciones de los instaladores. Se avisa en el portal a los técnicos disponibles, con la especialidad adecuada y distancia estrictamente menor de 40 km.
- El comercio ve el técnico, el estado, las fechas y el parte de reparación. Solo el titular del establecimiento puede valorar, una sola vez y tras la resolución. La valoración es visible al técnico asignado y al control del circuito autenticado.
- Si el equipo sigue fallando, la valoración conserva la intervención original y crea una revisión vinculada, o enlaza la incidencia activa existente. No se borra el historial ni se presenta al cliente como satisfecho.
- La API devuelve todas las incidencias activas y las 200 resueltas más recientes. Los contadores consideran todo el histórico.

**Conexión real con Admira pendiente:** no hay credenciales ni productor de inventario/eventos configurados. Las altas e incidencias manuales funcionan; los endpoints de enlace y eventos fallan con 503 sin sus secretos. El portal muestra esta limitación. La activación con el backend real de admira.app permanece en la misión del instalador #183, tarea c. No se afirma SSO, sincronización automática de inventario ni notificaciones push/email.

## Identidad y persistencia

Migración aditiva `api/migrations/0002_retailer_portal.sql`, después de `0001`. Las tablas y rutas heredadas permanecen.

Las contraseñas usan PBKDF2-SHA256, 100.000 iteraciones, sal aleatoria. Sesiones aleatorias de 256 bits almacenadas como hash, cookie `__Host-yk_retailer` Secure, HttpOnly, SameSite=Strict, caducidad 30 días. CORS/origen limitado al portal y desarrollo local; consultas filtradas por el propietario autenticado. La cookie del instalador no sirve como credencial del comercio. Los formularios se validan en servidor y el frontend inserta datos con `textContent`.

El alta crea un UUID local del equipo con `monitoring=0`: no provoca alertas falsas por falta de heartbeat. El comercio **no puede escribir ni reclamar IDs de Admira**. Solo el servicio central autorizado enlaza la pareja `(circuit_id, admira_device_id)`; tiene restricción UNIQUE y el enlace no se reasigna desde esta API. El primer evento firmado válido activa la monitorización.

`retailer_admira_commands` hace idempotentes los enlaces mediante `request_id` y hash del cuerpo. Las incidencias tienen idempotencia por comercio/request_key y restricción de una incidencia activa por equipo. La valoración y su revisión se escriben en una transacción D1.

## API de comercio

Base `https://data.yokup.com/api/retailer`. JSON con cookies y Origin permitido.

| Método | Ruta | Función |
|---|---|---|
| GET | `/health` | Disponibilidad y secreto de enlace configurado; no certifica productor real |
| POST | `/register`, `/login`, `/logout` | Cuenta y sesión |
| GET | `/me`, `/dashboard` | Perfil y datos del propietario |
| POST | `/sites` | name, kind, country ISO2, city, address, latitude, longitude |
| POST | `/devices` | site_id, name, skill |
| POST | `/incidents` | device_id, title, description, priority normal/urgent, request_key |
| POST | `/incidents/:id/rating` | stars 1..5, satisfied boolean, comment; obligatorio ≥10 caracteres si no funciona |

`kind`: kiosk, tobacco, supermarket, hospitality, other. `skill`: screen, audio, hvac, player, network, kiosk, sensor. Coordenadas del establecimiento determinan los técnicos cercanos; una alerta autenticada puede actualizar las coordenadas del equipo.

## Contrato servidor a servidor con Admira

Secretos separados, solo en Workers: `ADMIRA_CIRCUIT_SECRET` para enlaces/consulta y `INSTALLER_ADMIRA_SECRET` para eventos. Nunca incluirlos en frontend, enlaces, repositorio o informes.

`POST /api/circuit/link` y `POST /api/circuit/status` requieren `X-Admira-Timestamp` (Unix segundos, tolerancia 5 min) y `X-Admira-Signature` (hex minúscula HMAC-SHA256 con `ADMIRA_CIRCUIT_SECRET`) calculado sobre bytes UTF-8 exactos de:

```
TIMESTAMP.POST\n/api/circuit/link\nCUERPO_JSON
```

Usar el pathname real (`/api/circuit/status` en la consulta); `\n` representa un salto de línea. No es la firma del endpoint de eventos heredado, que se describe en `installer-portal.md`.

Cuerpo de enlace:

```json
{
  "request_id": "identificador-unico-del-comando",
  "circuit_id": "id-del-circuito",
  "retailer_id": "uuid-de-la-cuenta-propietaria-en-yokup",
  "yokup_device_id": "retail-uuid-local",
  "admira_store_id": "id-del-punto-en-admira",
  "admira_device_id": "id-del-equipo-en-admira"
}
```

El backend de Admira debe verificar que esa cuenta representa al punto antes de firmar el enlace. La interfaz del comercio presenta las referencias locales que necesita ese proceso. Un catálogo público de ubicaciones no acredita propiedad. Un vínculo existente requiere revisión del operador para cambiar de titular o circuito.

Consulta: `POST /api/circuit/status` con `{"circuit_id":"..."}` devuelve las últimas 200 incidencias del circuito con IDs de Admira, estado, técnico, reparación, estrellas, satisfacción y revisión. Este secreto pertenece **solo al servicio central de Admira**, que verifica las autorizaciones de cada usuario/circuito. No distribuirlo entre navegadores o clientes de circuitos.

En el contrato de eventos existente añadir `device.circuit_id` y enviar `device.id=admira_device_id`. Yokup resuelve el equipo local autorizado; si no existe enlace devuelve 404. Evita duplicar inventario e incidencias. La ingesta sin circuit_id conserva el contrato previo para dispositivos del piloto.

Próximo paso real: adaptar el backend que controla admira.app, configurar secretos en sus dos extremos, vincular un punto piloto autorizado y verificar una alerta y una valoración de ese circuito. Tener un secreto configurado no prueba por sí solo esa integración.

## Verificación y despliegue

```sh
node --test api/installer-portal.test.mjs api/retailer-portal.test.mjs
```

Pruebas con SQLite real: aislamiento entre titulares, cookies separadas, incidentes compartidos, resolución y valoración, revisión sin pérdida de historial, firma/ruta/idempotencia de enlace, colisiones de inventario, scoped status, mapeo de eventos, HVAC y visibilidad de incidencias antiguas activas. La suite existente del site y gate se ejecuta por `yokup-site/deploy.mjs`.

Despliegue: aplicar 0002 a `yokup-db`, desplegar `api/wrangler.toml`, publicar Pages y gate mediante el script oficial desde origin/main actualizado. Verificar rutas y salud por HTTP. No usar datos ficticios en producción para disparar alertas a instaladores reales.

## Establecimientos → circuitos de Cartelería Digital (14-09-2026)

Cada establecimiento que da de alta el comercio (a mano o por Excel) es un **circuito** en el registro único de Admira, `api.admira.store/grid/circuits`, y aparece «sin canal» en `admira.tv/digitalsignage/#circuitos` hasta que un operador lo asigna a un canal desde el CMS. Id: nombre del establecimiento en minúsculas + 6 caracteres de su UUID (p. ej. `estanco-jardinets-9f1c2d`), guardado en `retailer_site_circuits` (migración `0005`, aplicada).

`src/admira-circuit-sync.js` corre después de responder al comercio (`waitUntil` tras `POST /sites` o `/sites/import`) y en el cron; reintenta hasta 8 veces y queda `failed` con `last_error`. Solo viajan id, nombre y ciudad; nunca email, dirección ni coordenadas. Secreto `ADMIRA_CIRCUIT_SERVICE_KEY` solo en el Worker (copia en la bóveda). No sustituye al enlace firmado de equipos `/api/circuit/link`.
