# ITIL · inventario tecnológico de los Xpacios en Yokup

FLT-101300 · MorfeoMacMini · MacMini · 30-sep-2026.

> Carlos: «esto es lo que llamaremos ITIL (inventario tecnológico) y tiene que estar primero en
> yokup.com para luego a través del MCP distribuirlo a todas las soluciones de la Galaxia Admira».

**Yokup es el MAESTRO de los equipos de cada Xpacio.** El resto los consume: el backoffice de
admira.app / clearchannel.tv (sus `surfaces`), XpaceOS (`admira-xp/inventario.html`, esquema
`admira.cmdb/2`), Pixeria (`assets/xpaces/ci.mjs`, esquema `admira.xpacio.ci/1`) y los players
virtuales de XpaceOS. El **Xpacio** (establecimiento) sigue naciendo en el catálogo de Admira y
se sincroniza a Yokup (`api/src/admira-xpacio-sync.js`, ver `docs/xpacios-yokup.md`); lo que
cambia es que los **equipos** los manda Yokup.

## Modelo

Un CI (configuration item) es un equipo de `installer_devices` con:

| Tabla | Qué guarda |
|---|---|
| `itil_items` (satélite, PK `device_id`) | `itil_code` (único global), `category`, `role` (uso), `group_name`, `position`, `orientation` (horizontal/vertical), `parent_device_id` (relación «depende de»), `managed_by` (`itil` \| `catalogo`), `created_by`, `updated_by`, `created_at`, `updated_at`. |
| `device_lifecycle` (ya existía) | Fabricante, modelo, serie, compra, proveedor, factura, garantía (inicio, fin y, desde `0021`, `warranty_months`), instalación, mantenimiento y estado (operational, degraded, maintenance, planned, retired). |
| `itil_audit` | Cada alta, adopción, cambio, retirada y retirada automática del catálogo: actor, canal (`portal`, `mcp-comercio`, `mcp-flota`), código, equipo, establecimiento y detalle. |
| `itil_read_keys` | Claves de lectura de las soluciones de la Galaxia (solo SHA-256), con orígenes y marcas permitidos. |

Migración: `api/migrations/0020_itil.sql`, aditiva e idempotente (`CREATE … IF NOT EXISTS`,
`INSERT OR IGNORE`). Además siembra como CI `catalogo` (sin código) los equipos que la sync ya
había creado desde `surfaces`.

- **Código ITIL**: único en todo Yokup, `^[A-Z0-9]{2,12}(-[A-Z0-9]{2,12}){1,3}$`
  (p. ej. `PDG103-PAN-01`: Paseo de Gracia 103 · pantalla · 01). No se normaliza: se valida tal cual.
  No cambia: es la identidad del CI y se usa como `admira_device_id` del enlace del equipo.
- **Categorías**: pantalla, player, tpv, audio, iot, red, kiosk, mobiliario, iluminacion, otro.
  La ficha de ciclo de vida no tiene `kiosk`: allí se guarda como `otro`.
- **Nada se borra**: un CI se retira (`status retired` + motivo en `notes`).

## Reglas maestro / sync del catálogo

1. **Un Xpacio sin ningún CI `itil`** sigue el catálogo como hasta ahora: la sync siembra un equipo
   por superficie (y su CI `catalogo`), lo renombra, lo retira si la superficie desaparece y lo
   reactiva si vuelve.
2. **Un Xpacio con algún CI `itil`**: la sync solo refresca el establecimiento (nombre, dirección,
   coordenadas, circuito). **No siembra, no renombra, no retira y no reactiva ningún equipo**
   (ni los `catalogo` que retiró ITIL). `syncXpacios` devuelve `itil_managed` con cuántos hubo.
3. **Primer CI `itil` de un Xpacio** (alta o adopción): los equipos `catalogo` se marcan retirados
   (`retired`, nota «Sustituido por ITIL», autor = quien creó el CI) **salvo los que tienen una
   incidencia abierta**. Esos se retiran en la siguiente alta ITIL, cuando la incidencia ya esté
   cerrada; hasta entonces siguen visibles como provisionales.
4. **Adopción** (`adopt_device_id`): un equipo existente del establecimiento (del catálogo o dado de
   alta a mano en el portal) pasa a `itil` conservando su id, su historial de incidencias y su ficha.
5. **Upsert idempotente por `itil_code`**: repetir la misma llamada no escribe nada (ni auditoría) y
   devuelve `changed:false`. Lo omitido se conserva; cadena vacía borra. El mismo código en otro
   establecimiento es `409 itil_code_taken`.
6. **Relaciones**: `parent_itil_code` debe ser un CI `itil` del mismo establecimiento; los ciclos se
   rechazan (`parent_cycle`).

## Puertas

| Puerta | Quién | Alcance |
|---|---|---|
| Portal `/retailer` → «Inventario ITIL» (también en «Ver como» marca) | Titular o miembro con edición | Sus establecimientos. `viewer` solo lee. |
| MCP del comercio `https://data.yokup.com/mcp/retailer` | Token `ykp_` del titular | `itil_inventory_get` (`retailer:read`), `itil_ci_upsert` e `itil_ci_retire` (`retailer:inventory`). |
| MCP de flota `https://yokup.com/mcp` | Clave de flota o `ykm_` con `itil` / `itil:write` | Todos los Xpacios (como las incidencias). |
| Lectura Galaxia `GET https://data.yokup.com/api/itil/xpacios/:admira_store_id` | Público mínimo; completo con clave por solución | Xpacios vivos, sin datos privados. |

REST del comercio (cookie de sesión, mismo perímetro que `ownDevice`):
`GET /api/retailer/itil` (establecimientos con recuento), `GET /api/retailer/itil/inventory?site_id=|admira_store_id=`,
`POST /api/retailer/itil/cis` (`{site_id|admira_store_id, itil_code, name, category, …, lifecycle?, adopt_device_id?}`),
`POST /api/retailer/itil/cis/:itil_code/retire` (`{note}`).

### MCP de flota (yokup.com/mcp, versión 1.4.0)

| Herramienta | Scope | Argumentos |
|---|---|---|
| `itil_xpacios_list` | `itil` | `{brand?, q?, limit? ≤200}` → Xpacios con `managed_by`, `itil_cis`, `catalog_cis`. |
| `itil_inventory_get` | `itil` | `{admira_store_id}` → Xpacio + CIs + ciclo de vida completo + equipos sin ficha. |
| `itil_ci_upsert` | `itil:write` | `{admira_store_id, itil_code, name, category, role?, group_name?, position?, orientation?, parent_itil_code?, adopt_device_id?, lifecycle?{manufacturer, model, serial, purchase_date, supplier, invoice_ref, warranty_start, warranty_end, installed_at, installed_by, maintenance_interval_days}}` (0 borra el intervalo). |
| `itil_ci_retire` | `itil:write` | `{itil_code, note}`. |

El autor es `Persona · Máquina` de la credencial (el esquema rechaza `actor`/`machine` del cliente).
La clave de flota trae `itil` e `itil:write`; una `ykm_` solo si se emite con
`--scopes …,itil,itil:write` (`itil:write` exige `itil`).

**Confianza gate → yokup-api.** El gate tiene un service binding nuevo `DESK` → `yokup-api` y
llama a `https://yokup-api.internal/internal/itil/{xpacios,xpacios/:id,ci/upsert,ci/retire}`.
yokup-api solo atiende `/internal/*` si la petición llega con ese host y **sin** `CF-Connecting-IP`
ni `CF-Ray` (el borde las pone a todo el tráfico público): desde Internet, 404. Es el mismo patrón
que `/internal/incident-links/*`. Sin secreto nuevo. Es más limpio que gate → yokup-rtc → yokup-api:
un salto menos y yokup-rtc no aprende nada de ITIL.

## Lectura para las soluciones de la Galaxia

`GET https://data.yokup.com/api/itil/xpacios/:admira_store_id`

**Decisión de acceso.** Son ubicaciones y posiciones de pantallas de clientes (Alsea, JTI,
CaixaBank…): un mapa público de «qué pantalla hay en qué pared» no debe estar abierto. Por eso:

- **Sin clave**: solo lo mínimo, que ya es público en los mapas: `{xpacio:{admira_store_id, name, brand}, managed_by, summary:{total, by_category}}`. `Cache-Control: public, max-age=60`. 60 peticiones/min por IP.
- **Con `X-Yokup-Itil-Key: yki_…`** (una clave por solución): la lista de CIs sin datos privados.
  `Cache-Control: private, max-age=60`. 1200/min por clave. Clave inválida, revocada o caducada: 401.
  La clave puede restringirse a orígenes (`origins`) y a marcas (`brands`, fuera de ellas 404).
- **CORS** solo para `https://www.xpaceos.com`, `https://www.pixeria.com`, `https://www.admira.app`,
  `https://www.clearchannel.tv` y sus variantes sin www. Otro `Origin`: 403. Sin credenciales (cookies).
- Xpacio inexistente o que ya no figura en el catálogo: 404. Los CIs retirados no salen salvo
  `?include_retired=true` (con clave).

**Nunca viajan**: serie, factura, proveedor, fabricante, modelo, importes, fechas exactas (compra,
garantía, instalación), dirección, coordenadas, correos ni ids internos. La garantía viaja como
estado: `valid` (vigente), `expiring` (vence en ≤30 días), `expired` (vencida), `none` (sin datos).

Riesgo residual asumido: una clave usada desde JavaScript del navegador se puede extraer.
Recomendado: leer desde el backend/worker de cada solución (sin `Origin`) y cachear 60 s; si se usa
en navegador, restringirla a su origen para poder revocarla y rotarla sin tocar a las demás.

Respuesta con clave (`schema: "yokup.itil/1"`):

```json
{"schema":"yokup.itil/1","access":"key","solution":"xpaceos","generated_at":"2026-09-30T10:00:00.000Z",
 "xpacio":{"admira_store_id":"alsea-sbux-021","name":"Starbucks Paseo de Gracia","brand":"Alsea","city":"Barcelona","twin_url":"https://www.xpaceos.com/admira-xp/?loc=alsea-sbux-021"},
 "managed_by":"itil","summary":{"total":2,"by_category":{"pantalla":1,"player":1}},
 "cis":[{"id":"PDG103-PAN-01","code":"PDG103-PAN-01","name":"Menu board caja","category":"pantalla","role":"menu board",
  "group":"Caja","position":"Pared caja · izquierda","orientation":"horizontal","status":"operational","managed_by":"itil",
  "parent":"PDG103-PLY-01","relations":[{"type":"depends_on","code":"PDG103-PLY-01"}],"warranty":"expiring","maintenance_due":false}]}
```

Un CI `catalogo` no tiene código: `id` = `cat:<surface_key>`, `code` = null.

### Emitir, revocar y rotar una clave de lectura (operador)

```sh
node api/tools/itil-read-key.mjs issue xpaceos /ruta/privada/itil-xpaceos.json --origins https://www.xpaceos.com,https://xpaceos.com
cd api && npx wrangler d1 execute yokup-db --remote --file /ruta/privada/itil-xpaceos.json.sql
```

Soluciones: `xpaceos`, `pixeria`, `admira-app`, `clearchannel-tv`. Opcionales `--brands alsea,jti`
y `--days` (365 por defecto, máx. 730). La clave en claro solo queda en el archivo 0600; el SQL
lleva el SHA-256. El script imprime la sentencia de revocación (`UPDATE itil_read_keys SET revoked_at=…`).
Para rotar: emitir otra, cambiarla en la solución y revocar la anterior.

## Mapeo campo a campo

Funciones de referencia (puras, con pruebas) en `api/src/itil-model.js`: `toCmdb2Element`,
`toCmdb2Xpacio` y `toXpacioCi1`. Cada solución puede copiarlas.

### A `admira.cmdb/2` (XpaceOS · `admira-xp/inventario.html`)

| cmdb/2 (Xpacio) | yokup.itil/1 |
|---|---|
| `id` | `xpacio.admira_store_id` |
| `name` | `xpacio.name` |
| `addr` | `xpacio.city` (la dirección no viaja) |
| `twin` | `xpacio.twin_url` |
| `elements[]` | `cis[]` |

| cmdb/2 (elemento) | yokup.itil/1 (CI) |
|---|---|
| `id` | `id` (código ITIL o `cat:<superficie>`) |
| `group` | `iot` si category ∈ pantalla, player, tpv, audio, iot, red, kiosk; si no `analog` |
| `ci_class` / `category` | etiqueta de `category` (Pantalla, Player, TPV, Audio, Sensor IoT, Red, Kiosco, Mobiliario, Iluminación, Otro) |
| `name` | `name` |
| `status` | `status` (operational, degraded, maintenance, retired; `planned` → maintenance) |
| `location` | `group · position` |
| `depends_on[]` | `[parent]` |
| `notes` | `role · orientation` |
| `serial`, `vendor`, `model`, `owner`, `purchase_date`, `warranty_until`, `maintenance` | **no se exponen** → vacíos. Usar `yokup.warranty` (estado) para el semáforo. |
| `twinType`, `icon`, `connectivity`, `live` | propios de XpaceOS: se conservan del lado de XpaceOS, casados por `id`. |

### A `admira.xpacio.ci/1` (Pixeria · `assets/xpaces/ci.mjs`)

| ci/1 | yokup.itil/1 |
|---|---|
| `id` | `<prefijo>:<id>` (p. ej. `alsea:PDG103-PAN-01`) |
| `unidad` | `id` |
| `nombre` | `name` |
| `categoria` | pantalla/player → `pantallas`; tpv/audio/kiosk → `equipamiento`; iot/red → `iot`; mobiliario; iluminacion; otro → `pendiente` |
| `estado` | operational → `operativo`, degraded → `averia`, maintenance → `mantenimiento`, retired → `baja`, planned → `pendiente` |
| `ubicacion` | `group · position` |
| `relaciones[]` | `[{tipo:'depende-de', id: parent}]` |
| `orientacion` | `orientation` |
| `garantia` | `{inicio:'pendiente', fin:'pendiente', estado: warranty}`; `semaforoGarantia` debe leer `estado` (valid → verde; expiring/none → ámbar; expired → rojo) |
| `fabricante`, `modelo`, `serie`, `compra.*`, `responsable`, `red` | `pendiente` / null: no se exponen |

## Cómo integrar cada solución

- **XpaceOS** (`admira-xp/inventario.html`, hoy `INVENTORY_API = ''`): leer desde su worker
  `GET https://data.yokup.com/api/itil/xpacios/<loc>` con su clave, convertir con `toCmdb2Xpacio`
  y fusionar por `id` con sus campos propios (`twinType`, `live`, `connectivity`). Las altas y
  cambios se hacen en Yokup (portal o `itil_ci_upsert`), no en el `PUT /cmdb` local.
- **Pixeria** (`assets/xpaces/ci.mjs`): sustituir la fila local por `toXpacioCi1(ci, 'alsea')`; el
  enlace «Incidencia en Yokup» ya apunta a `/incidencias`.
- **Backoffice admira.app / clearchannel.tv**: las `surfaces` del catálogo siembran Xpacios nuevos
  y siguen siendo la fuente mientras un Xpacio no tenga ITIL. Cuando lo tenga, el backoffice debe
  mostrar los CIs de Yokup (misma lectura con clave `admira-app` / `clearchannel-tv`).
- **Players virtuales de XpaceOS**: identificarse con el `itil_code` como `device_id`; el enlace
  `retailer_device_links.admira_device_id` es ese código, así las incidencias del censo caen en el CI.
- **Agentes**: MCP de flota (`itil_*`) o MCP del comercio (`itil_*` con token del titular).

## Equipo de la incidencia → ficha de inventario (01-oct-2026)

Carlos: desde el campo **Equipo** de una incidencia de Yokup (p. ej.
`demo:starbucks-alsea-paseo-de-gracia:tpv:manual:3ec933e9-…`) se ve la ficha del equipo averiado en
este inventario: modelo, nº de serie, compra, proveedor, garantía (meses, fin e insignia) y estado.

- **Garantía en meses** (`api/migrations/0021_warranty_months.sql`): columna `warranty_months`
  (1-600, NULL) en `device_lifecycle`. Aditiva. Si falta `warranty_end`, el fin se **calcula**
  (`warranty_start` o, si falta, `purchase_date` + meses) y la vista lo marca `warranty_until_derived`;
  nunca se escribe. `lifecycleView` añade `warranty_until`. La insignia: **en garantía** (valid/expiring,
  «vence pronto» a ≤30 días) · **vencida** · **sin dato**. El barrido diario de avisos sigue leyendo
  solo `warranty_end`. `itil_ci_upsert`/portal aceptan `lifecycle.warranty_months` (0 por MCP = borrar).
- **Resolución** (`resolveEquipo`, `api/src/itil.js`) por `GET /internal/itil/equipo?ref=&loc=&code=&portal_incident=`
  (solo por binding): código ITIL → incidencia del Portal → id del equipo → id del censo
  (`retailer_device_links.admira_device_id`) → gemelo `demo:<xpacio>:<equipo>` (superficie del Xpacio,
  id del censo, **nombre igual al del id** —`pantalla-3` → «Pantalla 3»— o **categoría única** activa en ese
  Xpacio, preferentemente ITIL). Dos o más candidatos =
  `reason: ambiguo` con la lista; nunca se elige uno al azar. Sin coincidencia: `no_inventariado`
  (Xpacio conocido), `xpacio_no_encontrado` o `sin_referencia`, con `create` = Xpacio, categoría y
  nombre sacados del propio id (jamás serie ni fechas). Un equipo sin ficha ITIL = `sin_ficha` (alta por adopción).
- **Gemelos de XpaceOS**: `XPACEOS_TWIN_ALIASES` (`api/src/itil-model.js`) une el slug del gemelo con su
  Xpacio real: `starbucks-alsea-paseo-de-gracia` → `alsea-sbux-021` (Starbucks Paseo de Gracia 103).
  Añadir aquí un gemelo nuevo solo si replica un Xpacio real.
- **Helpdesk**: `GET https://api.yokup.com/ticket/equipo?id=<ticket>` | `?code=<ITIL>` (yokup-rtc,
  ruta PROTEGIDA con la sesión Google) llama a lo anterior por el binding `INCIDENT_DESK`.
- **Web**: `/ticket` (tarjeta Equipo: enlace a la ficha, nº de serie, modelo e insignia; o «No está en el
  inventario» + «Darlo de alta»), `/equipo-inventario?ticket=|code=` (ficha completa, «sin dato» en lo
  vacío, imprimible), `/informe-incidencia` (sección «Equipo · inventario ITIL» y línea en el correo) y el
  Inventario ITIL del portal (`/retailer?xpacio=&itil=<código>#itil` abre esa ficha;
  `/retailer?itil_alta=1&xpacio=&categoria=&nombre=&adoptar=&incidencia=#itil` abre el alta prefijada).
  Lógica compartida: `yokup-site/yk-equipo.js`.

## Routers de tienda (categoría red)

05-oct-2026 · SmithMacMini · MacMini. Un router por Xpacio vivo, detrás de un adaptador que no nombra al fabricante en la puerta (`NetworkVendorAdapter`: `listDevices`, `getDeviceStatistics`, `mapToItilCi`). El rótulo visible es «Teltonika o similar».

- **Activo por defecto:** `teltonika-rms-simulator`. Un router determinista por `admira_store_id` (modelos RUT241, RUTX11 o RUT956, operador Movistar/Vodafone/Orange, señal, consumo y estado). La identidad no cambia entre pasadas; la señal y el consumo cambian cada cubo de 10 minutos. Código ITIL `<tienda compacta>-RED-01`, válido con la regex de siempre (por ejemplo `ALSEASBUX021-RED-01`).
- **Preparado y apagado:** `teltonika-rms-real`. No llama a RMS si falta el token. Con token solo asigna un equipo cuyo registro traiga `admira_store_id`; si no hay ninguno etiquetado, no pisa los simulados.
- **Interruptor:** variable `NETWORK_VENDOR` (defecto `teltonika-rms`) y `NETWORK_SOURCE` (`simulated` o `real`). Otro vendor responde `vendor_unsupported` y no escribe.
- **Pasar a RMS real:** en el worker `yokup-api`, `npx wrangler secret put TELTONIKA_RMS_TOKEN` (el valor no se imprime ni se guarda en el repo) y `NETWORK_SOURCE=real`. Base `https://api.rms.teltonika-networks.com`, `GET /devices` y `GET /devices/statistics?charts=status`. Sin token, la pasada se salta (`no_token`) y los routers simulados siguen como estaban.
- **Dónde vive:** tabla `itil_network_telemetry` (`api/migrations/0022_network_telemetry.sql`). La ficha de ciclo de vida guarda el estado (online → operational, señal débil → degraded, offline → maintenance) y el modelo. Serie e IMEI van solo en la telemetría, marcados como simulados. La lectura pública añade `network[]` con `source:"simulated"` y la insignia `SIMULADO`, y sigue sin serie, IMEI ni coordenadas.
- **Sync:** el cron de 2 minutos llama a `scheduledNetworkSync` como mucho cada 10 minutos (`scheduled_jobs.name = network_router_sync`). Si queda cola, la pasada siguiente continúa. A mano: `POST /api/portal-admin/network/sync` (superusuario) o `POST /internal/itil/network/sync` (solo por service binding).
- **Catálogo:** el router no retira las pantallas provisionales. Un CI `itil` de otra categoría sigue congelando el catálogo del Xpacio, como hasta ahora. Un CI `red` con `created_by = network-sync` no lo congela.

Punto de retorno del código anterior: tag `retorno/pre-routers-sim-20261005`.

## Orden de despliegue

1. **yokup-api**: `cd api && npx wrangler d1 migrations apply yokup-db --remote` (o
   `d1 execute yokup-db --remote --file migrations/0020_itil.sql`) y después `npx wrangler deploy`.
   Antes de la migración el código nuevo fallaría en la sync (tabla `itil_items`): migrar primero.
2. **yokup-site** (Pages): portal con «Inventario ITIL», `/mcp/*` y `/help` (`yokup-site/deploy.mjs`).
3. **yokup-site-gate** (desde `origin/main`): `yokup-site/deploy.mjs` o `yokup-site-gate/deploy.sh`.
   Publica el binding `DESK` y las herramientas `itil_*`. Al revés, las herramientas aparecerían en
   `tools/list` y responderían «Yokup rechazó la operación: HTTP 404» hasta publicar yokup-api.
4. **Claves de lectura** por solución (arriba) y entregarlas por canal privado.

Hasta el 01-oct-2026 yokup-rtc no cambiaba. Con la ficha de inventario desde la incidencia:
1) `cd api && npx wrangler d1 execute yokup-db --remote --file migrations/0021_warranty_months.sql`
(yokup-db se migra fichero a fichero: su tabla `d1_migrations` está vacía, así que `migrations apply`
intentaría repetir 0001-0020) y `npx wrangler deploy`;
2) `cd yokup-rtc && npx wrangler deploy` (ruta `/ticket/equipo`); 3) `yokup-site/deploy.mjs`.
No hay secretos nuevos en los workers.

## Pruebas

`node --test api/*.test.mjs` (`api/itil-equipo.test.mjs`: garantía en meses y equipo de la incidencia → CI; `api/itil.test.mjs`: sync que no toca ITIL, siembra solo sin ITIL,
retirada del catálogo al primer CI, upsert idempotente, validación del código, rutas internas,
lectura sin datos privados, CORS, claves, portal y MCP del comercio, mapeos) ·
`cd yokup-site-gate && node --test ./*.test.mjs` (`itil.test.mjs`: scopes, esquema, extremo a
extremo gate → DESK → yokup-api) · `cd yokup-site && node --test ./*.test.mjs`
(`retailer-itil.test.mjs`) · `cd yokup-rtc && npm test`.
