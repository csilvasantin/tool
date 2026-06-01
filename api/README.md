# yokup-api — Cloudflare Worker

API entre el frontend estático de Yokup y **Supabase** (PostgREST). La `service_role`
key vive **solo** aquí como secret del worker; nunca llega al navegador.

```
navegador (web/) ──fetch──▶ yokup-api (Worker) ──REST service_role──▶ Supabase (Postgres)
```

## Puesta en marcha (todo lo que necesitas hacer tú)

### 1. Crear el proyecto Supabase
1. En [supabase.com](https://supabase.com) crea un proyecto nuevo.
2. SQL Editor → pega y ejecuta [`../db/schema.sql`](../db/schema.sql).
3. Project Settings → API: copia la **Project URL** y la **service_role** key
   (la secreta, no la anon). La service_role NO se pone en el frontend.

### 2. Desplegar el worker
```bash
cd yokup/api
npm install
npx wrangler login                 # una vez

# Secrets (no se guardan en el repo):
npm run secret:url                 # pega la Project URL  (https://<ref>.supabase.co)
npm run secret:key                 # pega la service_role key
# Opcional, para validar el webhook de Admira (F1):
npx wrangler secret put ADMIRA_WEBHOOK_SECRET

npm run deploy                     # imprime la URL: https://yokup-api.<sub>.workers.dev
npm run tail                       # logs en vivo
```

### 3. Conectar el frontend
En [`../web/config.js`](../web/config.js):
```js
window.YOKUP_CONFIG = {
  BACKEND: 'api',                                  // cambia 'local' -> 'api'
  YOKUP_API: 'https://yokup-api.<sub>.workers.dev' // la URL que imprimió el deploy
};
```
Tip: sin tocar config, puedes forzar el backend con `?backend=api` en la URL.

> Añade tu dominio de producción a `ALLOWED_ORIGINS` en `src/index.js` (ahora trae
> `yokup.app` y `localhost:8788`).

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

## Notas de diseño
- **Idempotencia del webhook**: `webhook_inbox` dedupe por `(source, event_id)`; si llega
  repetido, no crea otra intervención.
- **Firma**: HMAC-SHA256 del body con `ADMIRA_WEBHOOK_SECRET` (cabecera `X-Yokup-Signature: sha256=…`).
  Si el secret no está configurado, acepta (modo dev) — configúralo antes de exponer el webhook.
- **Rating**: el cálculo de media incremental se hace server-side en `/api/ratings` y
  también optimista en el cliente, para que el número aparezca al instante.
