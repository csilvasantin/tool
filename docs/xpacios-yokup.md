# Xpacios de Admira en Yokup: inventario y ciclo de vida

> **ITIL (FLT-101300).** Desde la migración `0020`, Yokup es el MAESTRO de los equipos de cada Xpacio: la sync del catálogo solo siembra equipos (como CI `catalogo`) en Xpacios sin ningún CI ITIL, y nunca retira ni renombra los que manda ITIL. El Xpacio sigue naciendo aquí. Ver `docs/itil-yokup.md`.

Misión Yokup FLT-101292 · MorfeoMacMini · 30-sep-2026.

Cuando se da de alta un Xpacio en admira.app / clearchannel.tv (la misma app; catálogo en omnipublicity-api), Yokup lo da de alta solo. Así se lleva el inventario y el ciclo de vida de sus equipos: garantías, mantenimientos y retiradas. También se pueden comunicar incidencias con el mismo portal y los mismos técnicos.

## Flujo

1. **Pull sin secretos.** `api/src/admira-xpacio-sync.js` lee el GET público `https://brain.digitalavatar.ai/locations` (`env.XPACIO_CATALOG_URL` lo sustituye). Admite el formato actual `{locations:[…],updatedAt,source}` y un array plano. Hoy son ~9.100 locations y ~9 MB.
2. **Alcance.** Solo los Xpacios **con gemelo**, es decir, con `twin` o `xpaceUrl` https no vacío. A 30-sep-2026 son 261: 100 `alsea_starbucks`, 10 `alsea_mexico`, 100 `jti_xtanco` y 51 sin circuito (CaixaBank, Xtanco Valencia, CanalKiosk…).
3. **Sin bucle.** Se excluyen los sitios que Yokup publica en ese mismo catálogo: ids `yokup-…` o `source: yokup-retailer`.
4. **Titular: una cuenta de comercio por marca** (`brand_accounts`). La cuenta se crea la primera vez que aparece la marca.
5. **Alta o actualización** (idempotente por `catalog_hash`). Por cada Xpacio se crea o actualiza un `retailer_sites` y su marca de origen en `admira_xpacio_sites`. Además se crea un `installer_devices` por superficie (`monitoring=0`, sin alertas fantasma) con su vínculo en `retailer_device_links`: `circuit_id=loc.circuit`, `admira_store_id=loc.id`, `admira_device_id='<loc.id>:<slug superficie>'`. Así, cuando Admira envíe eventos firmados con ese `circuit_id` e id, caen en el equipo correcto. El equipo nace con la ficha de ciclo de vida vacía: solo lleva la categoría deducida de la superficie.
6. **Nunca borra.**
   - Si una superficie desaparece, su equipo queda `device_lifecycle.status='retired'` y `admira_xpacio_devices.removed_at`.
   - Si la superficie vuelve, se reactiva, pero solo si la retirada la hizo la sincronización (`updated_by='xpacio-sync'`).
   - Si un Xpacio desaparece, recibe `admira_xpacio_sites.removed_at`. El establecimiento, los equipos y las incidencias siguen ahí, y el portal lo muestra como «ya no figura en el catálogo». Si vuelve, se limpia la marca.
   - Los equipos añadidos a mano no se tocan nunca.
7. **Sin circuito nuevo.** `syncRetailerCircuits` ignora los sites de `admira_xpacio_sites`, porque ya pertenecen a su circuito compartido. Tampoco se pueden «Publicar en mapas» (409): ya están en ellos con su id.

## Mapeo de campos

| Catálogo | Yokup |
|---|---|
| `id` | `admira_xpacio_sites.admira_store_id`, `retailer_device_links.admira_store_id` |
| `name` | `retailer_sites.name` (máximo 120) |
| `addr` | `retailer_sites.address` (máximo 300; si es muy corta, nombre · ciudad) |
| `city` | `city`. Si falta, se toma el último tramo de `addr` sin código postal, comarca (Barcelonès…) ni país. |
| `coords` `[lng,lat]` | `longitude`, `latitude`. Un Xpacio sin coordenadas válidas se cuenta como `invalid` y no se da de alta. |
| `country` | ISO2. Si falta: `alsea_mexico` o una dirección con «México» → `MX`. En los demás casos, `ES`. |
| `kind` | Cafetería/hostelería/restaurante → `hospitality`. Xtanco/estanco/tabaco → `tobacco`. Quiosco/kiosk → `kiosk`. Supermercado → `supermarket`. El resto → `other`. |
| `circuit` | `admira_xpacio_sites.circuit_id` y `retailer_device_links.circuit_id` (null si no hay circuito) |
| `twin` / `xpaceUrl` | `twin_url` (enlace «Gemelo digital ↗» en el portal) |
| `surfaces[].name` | nombre del equipo; su slug es la clave estable de la superficie |
| `surfaces[].surface` | `pantalla`/`escaparate` → skill `screen`; `audio` → `audio`; el resto → `kiosk`. La categoría es `pantalla` para pantalla, escaparate y mostrador, `audio`, `tpv`, `iluminacion` u `otro`. |

## Marcas

Orden de resolución de `brand_key`:

1. Circuito conocido: `alsea_starbucks` y `alsea_mexico` → `alsea` (Alsea). `jti_xtanco` → `jti` (JTI).
2. `external.operator`, `external.sponsor` o `external.brand`, en ese orden. Por ejemplo, CaixaBank → `caixabank`.
3. Prefijo de un circuito desconocido: `mango_retail` → `mango`.
4. Prefijo del id en la lista conocida: `caixabank-`, `canalkiosk-`, `xtanco-`.
5. Si no se puede deducir, `sin-marca`, en la cuenta «Admira · Xpacios sin marca».

Con los datos reales de hoy salen Alsea 110, JTI 100, CaixaBank 49, CanalKiosk 1 y Xtanco 1. Xtanco Valencia no está en el circuito JTI, así que forma su propia marca.

**Añadir o reasignar una marca:** añade el circuito a `CIRCUIT_BRANDS`, y su nombre visible a `BRAND_NAMES`, en `admira-xpacio-sync.js`. Si cambia la marca de un Xpacio, cambia su hash: en la siguiente pasada su establecimiento pasa a la nueva cuenta. Las incidencias antiguas conservan su `retailer_incident_details.retailer_id`.

### Cuentas de marca sintéticas

- Correo `marca+<brand_key>@cuentas.yokup.com` y `password_hash='!xpacio-brand-sin-acceso'`. Ningún PBKDF2 hex puede coincidir con ese valor, y el esquema no cambia.
- No admiten login con contraseña, Google ni demo: `createSession` rechaza hashes que empiezan por `!`. Tampoco admiten recuperación por correo o Google.
- Una sesión propia de marca que se colara se rechaza con 401.
- El registro de correos `@cuentas.yokup.com` está bloqueado.
- La marca solo se enlaza a una cuenta con el hash bloqueado. Si alguien hubiera registrado antes ese correo, la marca no se enlaza, sus Xpacios no se dan de alta y la ejecución registra `brand_account_unavailable`.

## Acceso: «Ver como»

- `GET /api/retailer/accounts` devuelve la cuenta propia, las cuentas de las que eres miembro y, para el superusuario, todas las de marca.
- `POST /api/retailer/switch {retailer_id}` abre una sesión delegada, que dura 8 h (1 h si la abre un superusuario). Se audita en `retailer_access_audit`, tanto si se permite como si se deniega. La sesión anterior se cierra.
- **Superusuario** (sesión Google de /superusuario): puede abrir solo cuentas de marca, nunca suplantar un comercio normal.
- **Miembro** (`retailer_account_members`): hace falta un correo **verificado**. Vale una cuenta de comercio vinculada a Google o una sesión delegada que ya lo verificó. Un correo dado de alta con contraseña no basta, porque cualquiera podría registrarlo.
- Roles:
  - `viewer`: solo lectura.
  - `manager` y `owner`: lectura y escritura del portal. `owner` queda reservado a futuro para gestionar miembros.
- La sesión delegada se revalida en cada petición. Si se revoca al miembro o al superusuario, recibe 401 en la siguiente.
- Desde «Ver como» no se crean tokens MCP.
- Volver a la cuenta propia: se elige en el mismo selector.
- Gestión de miembros (superusuario): `POST /api/portal-admin/xpacios/members {retailer_id, email, role: owner|manager|viewer, action: grant|revoke}`. Revocar cierra también sus sesiones delegadas.

## Ciclo de vida

- `GET /api/retailer/devices/:id/lifecycle` y `PUT` parcial, siempre dentro del perímetro del titular (`ownDevice`).
- Formato de los campos:
  - Fechas: `AAAA-MM-DD` válidas.
  - Enums: categoría y estado.
  - `maintenance_interval_days`: de 1 a 3650.
  - `null` o `''` vacían un dato.
  - `status=retired` fija `retired_at` a hoy si no se indica otra fecha.
- `/dashboard` añade `lifecycle` a cada equipo: `warranty` (none/valid/expiring ≤30 días/expired), `warranty_days` y `maintenance_due`. Añade también las stats `warranty_expiring`, `warranty_expired` y `maintenance_due`, sin contar los equipos retirados.
- `GET /api/retailer/inventory?site_id&status&warranty_within_days&maintenance_due&limit` y `GET /api/retailer/alerts?include_acknowledged&limit`.
- Barrido diario desde el cron (`scheduled_jobs.lifecycle_alerts`, una vez al día UTC). Genera `warranty_30`, `warranty_7`, `warranty_expired` y `maintenance_due` (con `last_maintenance_at`, o `installed_at` si falta, más el intervalo, cuando cae en hoy o antes). La PK `(device_id,kind,due_on)` impide duplicados.
- UI de «Mis equipos»:
  - Chip de garantía: verde si está vigente, ámbar si vence en ≤30 días, rojo si ha vencido y gris sin datos.
  - Diálogo «Ficha del equipo».
  - Cuarta tarjeta «Garantías por vencer».
  - Filtros por establecimiento y por estado.
- MCP: `retailer_inventory_list`, `retailer_device_lifecycle_get`, `retailer_device_lifecycle_update` y `retailer_alerts_list` (ver `docs/portal-mcp.md`).

## Frecuencia, lotes y forzar la sincronización

- Cron cada 2 min → `scheduledXpacioSync`.
- Una pasada nueva como mucho cada 15 min. Cada pasada escribe como máximo 50 Xpacios nuevos o cambiados.
- Si queda trabajo (`pending>0`), la siguiente ejecución del cron continúa sin esperar. La primera carga de 261 tarda unos 6 ciclos, unos 12 min.
- El «cursor» es el propio `catalog_hash`: lo ya aplicado no se vuelve a escribir.
- Un candado de 10 min evita pasadas simultáneas.
- Forzar: `POST /api/portal-admin/xpacios/sync` (superusuario, 6 cada 10 min).
- Estado: `GET /api/portal-admin/xpacios` devuelve las últimas 5 ejecuciones y, por marca, los Xpacios activos y retirados, los equipos y los miembros.

## Riesgos

- **Tamaño del catálogo.** Cada pasada descarga y parsea ~9 MB. En local tarda unos 140 ms de CPU la primera y unos 50 ms las idempotentes, lo que cabe en el plan de pago de Workers. Si crece mucho, conviene que omnipublicity ofrezca un filtro (`?twin=1`) o un ETag.
- **Catálogo recortado o caído.** Si el catálogo trae menos del 50 % de los Xpacios activos conocidos (con 10 o más), no se retira nada y se registra `catalog_shrunk`. Un HTTP de error tampoco toca nada.
- **Orden de despliegue.** La API nueva consulta tablas de `0018` en `/dashboard` y en la sincronización de circuitos. Hay que aplicar la migración antes que la API.
- **Ciudad deducida** en Xpacios sin `city` (CaixaBank, CanalKiosk): es heurística y sirve solo para mostrar.
- **Cambio de marca.** Mueve el establecimiento de cuenta. Las incidencias antiguas conservan el titular con el que se crearon.
- **Pendiente:**
  - Pantalla de miembros y botón de sincronizar en /superusuario (hoy solo API).
  - Reconocer avisos (`acknowledged_at`) desde el portal.
  - MCP para cuentas de marca.
