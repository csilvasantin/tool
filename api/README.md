# yokup-api — Cloudflare Worker

API entre el frontend estático de Yokup y **Cloudflare D1** (SQLite). D1 es la fuente
de verdad; el navegador nunca ve claves ni toca la base directamente.

```
navegador (web/tool) ──fetch──▶ yokup-api (Worker) ──binding env.DB──▶ D1 (yokup-db)
```

> Migrado desde Supabase (jul 2026). El modo `supabase` del frontend queda como
> rollback histórico, pero el proyecto Supabase original ya no existe (NXDOMAIN).

## Recursos desplegados

| Qué | Valor |
|-----|-------|
| Worker | `https://yokup-api.csilvasantin.workers.dev` |
| D1 database | `yokup-db` — id `0c087ca2-ae5b-4589-a377-e9e615603c8d` |
| Binding en el Worker | `env.DB` |

## Puesta en marcha / mantenimiento

```bash
cd api
npm install
npx wrangler login                 # una vez

# Crear la base (ya hecha; solo si montas otra):
# npx wrangler d1 create yokup-db   -> copia el database_id a wrangler.toml

# Aplicar esquema y seed (idempotentes):
npx wrangler d1 execute yokup-db --remote --file=../db/schema-d1.sql
npx wrangler d1 execute yokup-db --remote --file=../db/seed-d1.sql

# (Opcional) Secret para validar el webhook de Admira (F1):
npx wrangler secret put ADMIRA_WEBHOOK_SECRET

npm run deploy                     # imprime la URL del Worker
npm run tail                       # logs en vivo
```

## Conectar el frontend

En [`../web/tool/config.js`](../web/tool/config.js):
```js
window.YOKUP_CONFIG = {
  BACKEND: 'api',
  YOKUP_API: 'https://yokup-api.csilvasantin.workers.dev',
};
```
Tip: sin tocar config, fuerza el backend con `?backend=api` en la URL.

CORS: el Worker refleja el Origin solo si está en `ALLOWED_ORIGINS` (`src/index.js`);
ya incluye `https://www.yokup.com`, `https://yokup.com`, `csilvasantin.github.io` y
localhost. Cualquier otro Origin recibe fallback a `https://www.yokup.com` (no reflejado).

## Endpoints

| Método | Ruta | Qué hace |
|--------|------|----------|
| GET | `/api/health` | ping |
| GET/POST | `/api/interventions` | listar / crear intervención |
| PATCH | `/api/interventions/:id` | actualizar (estado, técnico…) |
| GET/POST | `/api/technicians` | listar / alta técnico |
| PATCH | `/api/technicians/:id` | actualizar técnico |
| GET/POST | `/api/stores` | puntos dados de alta en Yokup |
| GET/POST | `/api/ratings` | valoraciones (recalcula rating del técnico) |
| POST | `/api/ingest/admira` | webhook de Admira (idempotente, firmado) — F1 |

Las respuestas de POST/PATCH devuelven la fila en un **array** de un elemento
(compatibilidad con el frontend, que esperaba `return=representation` de PostgREST).

## Notas de diseño

- **D1/SQLite**: los arrays (`zones`, `skills`, `equipment`) se guardan como JSON TEXT y
  se rehidratan a arrays al leer; los booleanos (`from_admira`) como INTEGER 0/1. Ver
  el mapeo en `JSON_ARRAY_COLS` / `BOOL_COLS` de `src/index.js` y `db/schema-d1.sql`.
- **Idempotencia del webhook**: `webhook_inbox` dedupe por `(source, event_id)`; si llega
  repetido, no crea otra intervención.
- **Firma**: HMAC-SHA256 del body con `ADMIRA_WEBHOOK_SECRET` (cabecera
  `X-Yokup-Signature: sha256=…`). Si el secret no está configurado, acepta (modo dev) —
  configúralo antes de exponer el webhook.
- **Rating**: la media incremental se recalcula server-side en `/api/ratings` y también
  optimista en el cliente, para que el número aparezca al instante.

## Pendiente (fase 2)

- **Auth**: Google/whitelist estilo admira.live. Hoy la API es abierta (demo). Antes de
  producción real, añadir capa de identidad y restringir escrituras.
