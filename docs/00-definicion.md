# Yokup — Plataforma de intervenciones técnicas

> Documento vivo de definición. Estado: **v0.2 — decisiones tomadas** · Fecha: 2026-06-01

## 0. Decisiones tomadas ✅

| Tema | Decisión |
|------|----------|
| **Persistencia** | Backend real + **Postgres (Supabase)**. (Alt. nativa a tu infra: Cloudflare D1) |
| **Integración Admira** | **Webhook** Admira → endpoint Yokup (firmado) |
| **Asignación** | **Marketplace**: los técnicos ven trabajos por zona y los aceptan |
| **Geografía** | **España primero**, base preparada para internacionalizar (i18n) |
| **Frontend** | HTML/JS/CSS vanilla, design system `admira-design` (tokens/nav) |
| **Equipo** | = una `surface` de un store (pantalla, escaparate, mostrador, vending, pwa) |

## 1. Qué es Yokup (en una frase)

Plataforma que gestiona **intervenciones técnicas** (incidencias, instalaciones,
desinstalaciones, mantenimiento…) sobre los equipos instalados en **puntos de venta**
—estancos, kioscos, loterías y cualquier centro con cartelería digital, hilo musical
o metahumans/kioscos interactivos—, conectando a quien necesita el servicio con los
**técnicos (freelance o empresas)** que lo ejecutan, y dejando todo trazado y valorado.

## 2. Actores (roles)

| Rol | Quién es | Qué hace |
|-----|----------|----------|
| **Punto de venta / Cliente** | Estanquero, kiosquero, lotero, centro | Recibe la intervención y **valora** al técnico al cerrarse |
| **Técnico** | Freelance o empresa de instalación/reparación | Se da de alta, acepta intervenciones, las ejecuta y reporta |
| **Operador / Back-office Yokup** | Equipo Yokup | Supervisa, asigna, resuelve escalados, gestiona altas |
| **Sistema Admira** | Plataforma origen | **Da de alta incidencias automáticamente** vía integración |
| **(?) Administrador de marca/cuenta** | ¿Dueño de una red de centros? | *Por confirmar* |

## 3. El equipo / punto de venta (objeto central)

En el ecosistema Admira un **store** tiene varias **surfaces** (`window.OMNIP_LOCATIONS_DEFAULT`
en `admira-app/locations.js`, servido por el worker `omnipublicity-api` sobre KV):

```js
{ id:'xtanco', name:'Xtanco', kind:'Estanco · Retail físico',
  addr:'…', coords:[lng,lat],
  surfaces:[ { name:'LED Frontal', surface:'pantalla', status:'live', pixerScreens:[…] }, … ] }
```

→ En Yokup, **un "equipo" = una `surface`** (o el hardware asociado a ella). Tipos:
`pantalla` (cartelería digital), `escaparate`, `mostrador`, `vending`, `pwa`,
+ audio/hilo musical y metahumans/kioscos. La intervención apunta a `store_id` + `surface`.

## 4. La intervención (objeto de trabajo)

Tipos: **incidencia · instalación · desinstalación · mantenimiento** (extensible).

Ciclo de vida propuesto (a validar):

```
NUEVA → ASIGNADA → ACEPTADA → EN_CURSO → RESUELTA → VALORADA → CERRADA
                      │
                      └─→ RECHAZADA / REASIGNADA
```

Origen de una intervención:
1. **Automático desde Admira** (un equipo reporta un fallo → se crea la incidencia).
2. **Manual** (un centro u operador la abre).

## 5. Integración con Admira (clave del producto)

Las incidencias entran **solas** desde Admira. Falta decidir el mecanismo:
webhook de Admira → endpoint Yokup, polling, cola de eventos, o BD compartida.
*Ver sección de Preguntas abiertas.*

## 6. Flujo de valoración

Al cerrarse la intervención, el punto de venta **valora al técnico**
(puntuación + comentario). Esto alimenta la reputación del técnico y métricas de calidad.

---

## 7. Preguntas abiertas (pendientes, no bloquean el arranque)

1. **Pagos**: ¿Yokup gestiona pago al técnico / cobro al cliente, o solo el flujo
   operativo? (asumimos *solo operativo* en MVP).
2. **App técnico**: ¿app móvil (fotos en sitio, firma, geoloc) o web responsive?
   (asumimos *web responsive* con cámara en MVP).
3. **Evento en Admira**: ¿existe ya la detección de fallo de surface, o hay que
   crear el disparador del webhook en Admira?
4. **Maestro de centros**: confirmamos reutilizar `omnipublicity-api` como fuente
   de stores/surfaces (Yokup no duplica el catálogo).

## 8. Stack propuesto (alineado con el ecosistema Admira real)

> El resto de Admira son **sitios HTML/JS/CSS planos** (sin build, desplegados por
> CNAME). El catálogo de centros ya vive en `admira-app/locations.js` como array JS
> con `id_admira`, `type`, `screens`, `products`, geo, etc. Yokup debe encajar ahí.

- **Frontend**: HTML + JS + CSS vanilla (mismo patrón que admira-app/studio)
- **Datos de centros**: reutilizar `locations.js` / `id_admira` como clave de enlace
- **Persistencia de intervenciones**: pendiente — opciones según pregunta abierta:
  - A) Backend ligero + Postgres/Supabase (si necesitamos multi-rol y escritura real)
  - B) Servicio/worker tipo `admira-live-worker` (ya tienes ese patrón)
- **Integración Admira**: endpoint de ingesta de incidencias (webhook firmado)
- **Roles** desde el día 1: centro · técnico (freelance/empresa) · operador

> Nota: en Admira ya existe `marketplace.html` y `backoffice.html`. Conviene revisar
> si Yokup reaprovecha esos patrones de UI (marketplace de técnicos / back-office).

## 9. Modelo de datos (v1, Postgres/Supabase)

```
store            (espejo/cache de omnipublicity-api: id, name, kind, addr, coords, region)
surface          (id, store_id→store, name, type[pantalla|escaparate|mostrador|vending|pwa|audio|kiosk], pixer_screens)
technician       (id, tipo[freelance|empresa], nombre, zonas[], skills[], rating_avg, estado[activo|pendiente|baja])
intervention     (id, store_id, surface_id, tipo[incidencia|instalacion|desinstalacion|mantenimiento],
                  origen[admira|manual], estado, prioridad, descripcion, creada_en, fuente_evento_id)
intervention_event (id, intervention_id, tipo, actor, payload, ts)   -- timeline/auditoría
offer            (id, intervention_id, technician_id, estado[ofertada|aceptada|rechazada|expirada], ts)  -- marketplace
rating           (id, intervention_id, technician_id, store_id, estrellas 1-5, comentario, ts)
webhook_inbox    (id, fuente, firma_ok, payload_raw, procesado, ts)  -- ingesta idempotente desde Admira
```

Ciclo (marketplace): `NUEVA → PUBLICADA(oferta a técnicos de la zona) → ACEPTADA → EN_CURSO →
RESUELTA → VALORADA → CERRADA`, con ramas `EXPIRADA/REASIGNADA`.

## 10. Roadmap por fases

- **F0 ✅ — Esqueleto + datos**: web (panel/tablón/equipos), design system enganchado,
  esquema Supabase (`db/schema.sql`), datos de stores/surfaces desde `omnipublicity-api`.
  Verificado en navegador (3 páginas, flujo aceptar trabajo, responsive).
- **F0.5 ✅ — Landing + altas conectadas**: `index.html` explica cómo funciona (el bucle
  + las dos caras) con CTAs, stats, cierre y footer. Páginas `alta-punto.html` y
  `alta-instalador.html` con explicación paso a paso + formulario. Flujo end-to-end
  conectado y verificado:
    · alta de instalador → el tablón se filtra por sus zonas/especialidades (toggle "solo mis trabajos / todos")
    · alta de punto → aparece en *Equipos* marcado "nuevo · alta manual"
    · reportar incidencia → entra en el *Panel* con su `surface_type`.
- **F0.6 ✅ — Ciclo de valoración**: el técnico hace avanzar su trabajo en el Tablón
  (*Mis trabajos*: aceptada → en_curso → resuelta); el punto de venta valora con
  estrellas + comentario desde el *Panel* (resuelta → cerrada). El rating recalcula la
  media del técnico (incremental) y se muestra en su cabecera del Tablón. Verificado:
  media incremental 5→4→4 correcta; estados y KPIs coherentes.
- **F0.7 ✅ — Backend conmutable (Supabase-ready)**: `web/config.js` elige backend
  `local` (mock) | `api`. Worker `yokup-api` (`api/`) habla con Supabase por REST con
  la `service_role` como secret (nunca en el navegador); incluye ingesta
  `/api/ingest/admira` idempotente + firmada (lista para F1). `data.js` refactorizado a
  adaptador (cache + escritura optimista). Verificado: modo `local` intacto y modo `api`
  contra worker simulado (hidratación, alta técnico, ciclo aceptar→resuelta, rating 5/1,
  POST×3/PATCH×4). Pendiente del usuario: crear proyecto Supabase + desplegar worker
  (ver `api/README.md`).
- **F0.8 ✅ — Back-office del operador + vídeo explainer**:
  · `backoffice.html` con 3 pestañas: **Operativa** (supervisar todas las intervenciones con
    filtros estado/zona/prioridad/origen + búsqueda; **asignar/reasignar** técnico; cancelar),
    **Altas** (validar/rechazar/suspender técnicos; ver puntos dados de alta) y **Métricas**
    (KPIs, carga por zona en barras, ranking de técnicos por valoración).
  · `data.js` ampliado con `updateTechnician`/`updateStore` en ambos backends.
  · `video.html`: explainer animado de 7 escenas (intro → 5 fases → cierre) con timeline de
    progreso, autoplay, controles (play/prev/next/restart), dots y teclado. Responsive.
  · Guión + storyboard para vídeo real en `docs/guion-video.md`.
  Verificado end-to-end: validar técnico → asignable en Operativa → asignar cambia estado;
  métricas y ranking correctos; explainer en desktop y móvil sin errores de consola.
- **F1 — Ingesta Admira**: endpoint webhook firmado + `webhook_inbox` idempotente →
  crea `intervention` en estado NUEVA. Alta manual también.
- **F2 — Marketplace técnico**: alta de técnico, tablón de trabajos por zona, aceptar/rechazar.
- **F3 — Ejecución + valoración**: estados, timeline, cierre, valoración del centro.
- **F4 — Back-office Yokup**: panel operador (supervisión, escalados, métricas, rating).
- **F5 — i18n / multipaís**: internacionalización sobre la base ya preparada.
