# Plano maestro del Xpacio en Yokup

Misión DCL-fbee86b0016fa4cef7a7726c · Hoy #186 «Plano maestro en Yokup» · tarea a (modelo y API) ·
SubNeoMBP14 · MBP14 · 14-oct-2026.

> Carlos (14-oct-2026): los clientes globales de las cinco soluciones comparten **planos e inventario
> ITIL**. admira.biz comercializa los espacios, admira.app (Yokup) los mantiene, admira.studio adapta
> los contenidos, admira.store los demuestra con el gemelo y todo se lanza desde admira.tv.

Yokup ya era el maestro del ITIL (`docs/itil-yokup.md`). Desde ahora también lo es del **plano**:
el plano vigente de cada establecimiento vive junto a su inventario, con versión e histórico, y las
soluciones lo leen de aquí en lugar de cada una tener su copia. El formato no cambia: es el
`admira.xpacio-plano/1` de clearchannel-tv (`docs/plano-obras.md`, `data/xpacios/*.json`).

## Modelo

Migración `api/migrations/0024_xpacio_plano.sql`, aditiva e idempotente (`IF NOT EXISTS`).
Ninguna tabla existente cambia.

| Tabla | Qué guarda |
|---|---|
| `xpacio_planos` (PK `site_id`) | El plano **vigente** del establecimiento: `admira_store_id` (copia del catálogo; NULL en los propios de Yokup), `plan_id` (el `id` del JSON), `schema`, `version` (la del JSON), `plan_json` (compacto, en el orden en que llegó), `sha256`, `seq`, `screens`, `bytes`, `source` (`portal` \| `mcp-flota` \| `mcp-comercio`), `created_by/at`, `updated_by/at`. Se sustituye, nunca se borra (trigger). |
| `xpacio_plano_versions` | **Histórico append-only**: una fila por cada versión distinta que pasó a vigente, con `seq` 1, 2, 3… por establecimiento (`UNIQUE(site_id, seq)`). Triggers que abortan cualquier `UPDATE` o `DELETE`. |
| `xpacio_plano_fleet_sites` (PK `site_id`) | Establecimientos que la **flota** puede alcanzar por `site_id` (y que la Galaxia con clave puede leer aunque no estén publicados en los mapas): `note`, `granted_by`, `created_at`, `revoked_at`. Sin FK a propósito. La migración siembra el laboratorio `4723419e-5bf2-4f7c-b5d2-b87171503754`. |
| `itil_audit` (ya existía) | Cada versión nueva deja `action = 'plan-update'`, actor, canal, `site_id` y detalle (`Primer plano · <versión> · N pantallas · sha256 <12>`). |

Reglas:

1. **Idempotente.** El hash es el SHA-256 del **JSON canónico** (claves ordenadas, sin espacios). Repetir el
   mismo plano, aunque llegue con otro orden de claves o sangría, devuelve `changed:false` y no escribe nada
   (ni versión, ni auditoría), como el upsert del ITIL. La idempotencia va **antes** que el conflicto: si el
   vigente ya es ese plano, `changed:false` aunque `base_sha256` esté desfasado (no hay nada que pisar).
2. **Cada versión distinta va al histórico.** Volver a un plano anterior es una versión nueva (`seq` sigue
   subiendo): el histórico cuenta qué estuvo vigente y cuándo, no qué contenidos distintos hubo.
3. **Sin pisar a nadie.** `base_sha256` (opcional) es el sha256 que leíste; `''` o `null` = «espero que no
   haya plano». Si el vigente ya es otro: `409 plan_conflict`. Además, el lote (auditoría + versión +
   vigente) va guardado por el hash vigente leído: si alguien escribe entre la lectura y el lote, no se
   aplica nada y también es `409 plan_conflict`.
4. **Identidad.** En un Xpacio del catálogo, el `id` del plano debe ser su `admira_store_id`
   (`400 plan_id_mismatch`). Si el plano trae `yokup.site_id`, debe ser el del establecimiento
   (`400 plan_site_mismatch`). Un establecimiento propio (sin `admira_store_id`) usa el slug que quiera
   (`lab-gran-de-gracia-51`).
5. **Límite**: 256 KB del JSON compacto (`413 plan_too_large`). Los planos reales pesan 7-9 KB.
   Hasta 60 versiones nuevas por establecimiento y hora.

### Validación (estructural)

`api/src/xpacio-plano-model.js` (`validatePlan`, puro). No copia `plano-core.mjs`: la validación
geométrica (solapes, techo, puertas tapadas, alturas) sigue en clearchannel-tv. Aquí, lo que hace que un
plano sea legible por todas las soluciones:

- Todo el JSON: profundidad ≤ 12, claves ≤ 80, textos ≤ 4000 sin caracteres de control, números finitos.
- `schema` = `admira.xpacio-plano/1`; `id` (`^[A-Za-z0-9][\w.-]{0,159}$`); `version` (1-80); `nombre` ≤ 160.
- `planta`: `ancho` y `fondo` > 0 y ≤ 500 m; `alto` > 0 y ≤ 30 m.
- `paredes`: 3-200, `id` único, extremos `a` y `b` como `[x, y]` (|v| ≤ 1000 m), al menos 5 cm; `alto` opcional.
- `pantallas` (≤ 2000): `id` único, `pared` existente, `s` y `z` en metros, `orientacion` vertical u
  horizontal, `pulgadas` (0-1000]; `resolucion`, `aspecto` y `dimensiones` bien formados si vienen;
  `itil` null o un código ITIL válido.
- `dispositivos` (≤ 2000): `id` único, `pared` existente si viene, `s`/`z` numéricos si vienen, `itil` igual.
- `huecos` (con `pared` existente) y `mobiliario` con sus medidas; `criterios` y `yokup` objetos.

Los errores llegan todos juntos en `errors[]` (portal e internas) y los tres primeros en el mensaje.

### Cruce con el ITIL (avisos, nunca errores)

`crossCheck(plan, cis)` compara las pantallas y dispositivos del plano con los CIs **del mismo
establecimiento**. El plano se guarda igual; los avisos salen en `itil_check` (lectura privada y respuesta
del guardado) y en `itil` (Galaxia con clave):

| Código | Cuándo |
|---|---|
| `itil_not_found` | Una pantalla o dispositivo trae `itil` que no es un CI de este establecimiento. |
| `itil_retired` | Apunta a un CI retirado. |
| `itil_category` | Una pantalla apunta a un CI que no es `pantalla` (o un dispositivo `player`/`iot` a otra categoría). |
| `itil_duplicated` | Dos elementos del plano usan el mismo código. |
| `ci_screen_missing` | Un CI activo de categoría `pantalla` con código no aparece en el plano. |
| `catalog_screens` | Hay pantallas provisionales del catálogo (sin código): no se pueden cruzar hasta darles código. |
| `itil_pending` | Pantallas del plano con `itil: null` (por cruzar). |

## Puertas

| Puerta | Quién | Alcance |
|---|---|---|
| Portal `GET\|PUT https://data.yokup.com/api/retailer/plano` (cookie, también en «Ver como») | Titular o miembro con edición (`owner`, `manager`, superusuario); `viewer` solo lee | Sus establecimientos (mismo `ownerSite` que el ITIL). Canal `portal`; vía MCP del comercio (principal), `mcp-comercio`. |
| MCP de flota `https://yokup.com/mcp` 1.5.0 | Clave de flota o `ykm_` con `itil` / `itil:write` | `plano_get` / `plano_upsert` en los Xpacios del catálogo (`admira_store_id`, como el ITIL) y, por `site_id`, **solo** en los establecimientos de `xpacio_plano_fleet_sites`. Un comercio del portal no es de la flota: no permitido e inexistente responden igual, `404 site_not_found`. Vista sin correos: lo guardado desde el portal o el MCP del comercio sale como `titular`; lo de los agentes, con su `Persona · Máquina`. El plano va entero (un agente que lo edite y lo vuelva a guardar no pierde campos). Canal `mcp-flota`. Ver `yokup-site-gate/MCP.md`. |
| Lectura Galaxia `GET https://data.yokup.com/api/plano/xpacios/:id` | Público mínimo; completo con la clave `yki_` del ITIL | Sin datos privados. |

**Dar acceso de flota a un establecimiento** (orden explícita de Carlos; el titular sigue mandando desde el portal):

```sh
cd api && npx wrangler d1 execute yokup-db --remote --command \
 "INSERT INTO xpacio_plano_fleet_sites(site_id,note,granted_by,created_at) VALUES('<site_id>','<nombre del establecimiento>','<Persona · Máquina> · <misión>',$(date +%s)000)"
# Revocar (nada se borra): … --command "UPDATE xpacio_plano_fleet_sites SET revoked_at=$(date +%s)000 WHERE site_id='<site_id>'"
```

`/internal/plano/{get,upsert}` solo responde por el service binding (host `yokup-api.internal` y sin
`CF-Connecting-IP`/`CF-Ray`, el mismo guardado que `/internal/itil/*`); desde Internet, 404.

Pendiente (tareas b y c de la misión): herramientas `plano_*` en el MCP del comercio
(`data.yokup.com/mcp/retailer`), la pantalla del Portal, «Subir plano» de admira.biz escribiendo aquí, y los
consumidores (admira.biz/plano, gemelo de admira.store, admira.studio, admira.tv) leyendo de aquí.

## Lectura para las soluciones de la Galaxia

`GET https://data.yokup.com/api/plano/xpacios/:id`, con el **mismo modelo de acceso** que
`GET /api/itil/xpacios/:admira_store_id` y la **misma clave** `X-Yokup-Itil-Key` (plano e inventario son
la misma ficha del Xpacio; no hace falta otra clave por solución).

**Cómo se direccionan los establecimientos propios de Yokup.** `:id` es el `admira_store_id` de un Xpacio
del catálogo o `yokup-<site_id>` para un establecimiento propio de Yokup (sin `admira_store_id`, como el
laboratorio `4723419e-5bf2-4f7c-b5d2-b87171503754`). Es el mismo id con el que `retailer-map-catalog.js`
(`catalogId`) ya publica esos establecimientos en el mapa comercial, y el prefijo `yokup-` ya está reservado
(la sync del catálogo descarta `yokup-*`, `isXpacio`), así que no choca con ningún `admira_store_id`: una sola
ruta y un solo id para toda la Galaxia. El `yokup-<site_id>` de un Xpacio del catálogo no existe (404): se lee
por su `admira_store_id`.

**Decisión de acceso.** Un plano es la geometría de una tienda de un cliente (qué pantalla hay en qué
pared, a qué altura, dónde están puertas y mobiliario): no debe estar abierto. Por eso:

- **Sin clave**, solo lo mínimo y solo si el Xpacio ya es público en los mapas (catálogo, o un `yokup-*` que
  su titular publicó con «Publicar en los mapas»): `{schema:"yokup.plano/1", access:"public", xpacio:{admira_store_id|id, name, brand?}, has_plan, plan_schema, version, screens}`.
  `Cache-Control: public, max-age=60`; 60 peticiones/min por IP (cubo `plano-pub`, aparte del ITIL).
- Un `yokup-*` sin publicar (o que no existe) sin clave: **401 `key_required`**, igual en ambos casos para no
  revelar si existe.
- **Con `X-Yokup-Itil-Key: yki_…`**: un `yokup-*` solo si está publicado en los mapas o permitido para la flota
  (`xpacio_plano_fleet_sites`); si no, **404** (la clave de una solución no abre el plano de cualquier comercio del
  portal). Devuelve el plano **sin datos privados**, `sha256`, `updated_at`,
  `summary` (paredes, pantallas, dispositivos, enlazados al ITIL) e `itil` (`cis`, `linked`, `warnings`).
  `Cache-Control: private, max-age=60`, `ETag: "<sha256>"` (con `If-None-Match` → 304). 1200/min por clave.
  Clave inválida, revocada o caducada: 401. Restringida a orígenes (403 fuera) y marcas (404 fuera; los
  establecimientos propios no tienen marca, así que una clave con `brands` no los ve).
- **CORS** solo para admira.biz, admira.app, admira.studio, admira.store, admira.tv, xpaceos.com, pixeria.com
  y clearchannel.tv (con y sin www). Otro `Origin`: 403. Sin credenciales. Expone `ETag`.
- Xpacio inexistente o retirado del catálogo: 404.

**Lista blanca** (`publicPlan`, `PLANO_PUBLIC_FIELDS`, como `publicCi` del ITIL): solo viajan los campos conocidos
de `admira.xpacio-plano/1` y con su tipo; un campo conocido con otro tipo tampoco viaja.

| Bloque | Campos que viajan |
|---|---|
| raíz | `schema`, `id`, `version`, `nombre`, `fuente{titulo, medidas, pantallas, itil}`, `planta{ancho, fondo, alto}`, `criterios{alturaMinima, alturaMinimaEscaparate, holguraTecho, separacionMinima, profundidadMueble}`, `contenidos{instalacion, grupo, url}`, `yokup{managed_by, cis}` |
| `paredes[]` | `id`, `nombre`, `a`, `b`, `alto` |
| `huecos[]` | `id`, `tipo`, `nombre`, `pared`, `desde`, `ancho`, `base`, `alto` |
| `mobiliario[]` | `id`, `tipo`, `nombre`, `x`, `y`, `w`, `d`, `alto` |
| `pantallas[]` | `id`, `itil`, `screenId`, `nombre`, `corto`, `tipo`, `grupo`, `grupoNombre`, `subgrupo`, `player`, `orientacion`, `pulgadas`, `resolucion`, `aspecto`, `dimensiones{ancho, alto}`, `escaparate`, `estado`, `pared`, `s`, `z`, `fuente` |
| `dispositivos[]` | `id`, `nombre`, `categoria`, `rol`, `pared`, `s`, `z`, `itil` |

Todo lo demás se queda en Yokup: `direccion`, contactos (`contact_email`, teléfonos), calle y código postal,
coordenadas (`geo`, `location`…), series, MAC/IP, NIF, `yokup.site_id` y `yokup.portal`, la máquina de flota de un
dispositivo (`fleet`) y cualquier campo que alguien añada mañana. Un campo nuevo del esquema que deba viajar se
añade a `PLANO_PUBLIC_FIELDS` con su prueba. Tampoco viajan el autor (`updated_by`) ni la fuente del guardado.

Los orígenes admira.store, admira.studio y admira.tv (y sus variantes sin www) se añadieron también a la
lectura del ITIL (`GALAXY_ORIGINS` es común) y a `api/tools/itil-read-key.mjs` (`--origins`), junto a la
solución `admira-tv`. admira.biz ya estaba en el código desde el 4-oct, aunque faltaba en la documentación.

## Ejemplos

```sh
# Portal (titular). PUT con el plano tal cual sale de clearchannel-tv/data/xpacios/<id>.json.
curl -s https://data.yokup.com/api/retailer/plano \
  -X PUT -H 'Origin: https://www.yokup.com' -H 'Content-Type: application/json' -b "$COOKIE" \
  --data @<(jq -n --slurpfile p lab-gran-de-gracia-51.json \
    '{site_id:"4723419e-5bf2-4f7c-b5d2-b87171503754", plan:$p[0], base_sha256:""}')
# → 201 {created:true, changed:true, seq:1, sha256, itil_check:{cis, linked, warnings:[…]}}
# Repetirlo → 200 {changed:false}. Con otro base_sha256 → 409 plan_conflict.

curl -s 'https://data.yokup.com/api/retailer/plano?site_id=4723419e-5bf2-4f7c-b5d2-b87171503754&history=5' \
  -H 'Origin: https://www.yokup.com' -b "$COOKIE"
# → {site, xpacio, has_plan, current:{version, sha256, seq, updated_by…}, plan, itil_check, history:[…]}
#   &seq=2 abre esa versión del histórico (selected).

# Galaxia: mínimo sin clave (Xpacio público) y completo con la clave yki_ de la solución (sin pegarla en logs).
curl -s https://data.yokup.com/api/plano/xpacios/alsea-sbux-021
curl -s https://data.yokup.com/api/plano/xpacios/yokup-4723419e-5bf2-4f7c-b5d2-b87171503754 \
  -H "X-Yokup-Itil-Key: $YOKUP_ITIL_KEY"

# MCP de flota (credencial con itil / itil:write).
curl -s https://yokup.com/mcp "${H[@]}" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
 "params":{"name":"plano_get","arguments":{"admira_store_id":"alsea-sbux-021","history":3}}}'
```

## Orden de despliegue

No hay secretos nuevos. yokup-db se migra fichero a fichero (su `d1_migrations` está vacía):

1. **Migración**: `cd api && npx wrangler d1 execute yokup-db --remote --file migrations/0024_xpacio_plano.sql`.
   Comprobación: `npx wrangler d1 execute yokup-db --remote --command "SELECT type,name FROM sqlite_master WHERE name LIKE 'xpacio_plano%' ORDER BY type,name"`
   → **3 tablas** (`xpacio_planos`, `xpacio_plano_versions`, `xpacio_plano_fleet_sites`), **2 índices**
   (`xpacio_planos_store`, `xpacio_plano_versions_site`) y **3 triggers** (`xpacio_planos_no_delete`,
   `xpacio_plano_versions_no_update`, `xpacio_plano_versions_no_delete`); y
   `SELECT site_id,revoked_at FROM xpacio_plano_fleet_sites` → el laboratorio, sin revocar.
2. **yokup-api**: `cd api && npx wrangler deploy`. Después de la migración: el código nuevo lee `xpacio_planos`
   (también `/api/retailer/itil`, para `plan_version`).
3. **yokup-site-gate** y 4. **yokup-site** (Pages), al final y juntos: `YOKUP_DEPLOY_AGENT=… YOKUP_DEPLOY_MACHINE=… node yokup-site/deploy.mjs`
   desde `origin/main`. Publica Pages (manifiesto 1.5.0, `llms.txt`, hub `/mcp`) y, a continuación, el gate con
   `plano_get` / `plano_upsert` como una sola release. El gate no se puede publicar antes por separado con
   `yokup-site-gate/deploy.sh`: ese script exige que `yokup-site` en HEAD sea idéntico al sello publicado en Pages,
   y este cambio toca `yokup-site/mcp/*`. Queda una ventana de segundos entre Pages y el gate en la que el
   manifiesto anuncia las herramientas antes de que respondan; yokup-api ya está publicado (paso 2), así que en
   cuanto sale el gate funcionan.

## Pruebas

`node --test api/*.test.mjs` (`api/xpacio-plano.test.mjs`: validación, hash canónico, cruce con el ITIL,
`publicPlan` por lista blanca con campos hostiles, migración idempotente y append-only (y su recuento de objetos),
idempotencia e histórico, idempotencia antes que `base_sha256`, perímetro titular/manager/viewer/otro comercio,
internas solo por binding, flota por `site_id` solo en lo permitido y sin correos, lectura Galaxia sin/con clave,
`yokup-*` solo publicado o permitido, ETag y CORS; y, si `~/Claude/repos/clearchannel-tv` está en la máquina, que los dos planos reales validan) ·
`cd yokup-site-gate && node --test ./*.test.mjs` (`plano.test.mjs`: scopes, esquema, extremo a extremo
gate → DESK → yokup-api).
