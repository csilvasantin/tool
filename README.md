# Yokup

Plataforma de **intervenciones técnicas** (incidencias · instalaciones · desinstalaciones ·
mantenimiento) sobre los equipos de puntos de venta —estancos, kioscos, loterías, centros con
cartelería digital / hilo musical / metahumans—, conectando esos centros con **técnicos**
(freelance o empresas) en un modelo **marketplace**. Las incidencias entran automáticamente
desde **Admira** vía webhook. Al cerrar, el centro **valora al técnico**.

> Definición completa y decisiones: [`docs/00-definicion.md`](docs/00-definicion.md)

## Estado de despliegue

- **Web (live)**: **https://www.yokup.com/tool/** (y **https://yokup.com/tool/**). El dominio
  `yokup.com` está fijado en ESTE repo (`web/CNAME`); la app vive en la subruta `/tool/` y la
  raíz redirige a `/tool/`. Publicado por `.github/workflows/pages.yml` (carpeta `web/`) en cada
  push a `main`.
- **Estructura de la web**: la app está en `web/tool/` (todos los HTML/JS/CSS/media). En la raíz
  `web/` sólo quedan `CNAME` (dominio), `index.html` (redirección a `/tool/`) y `404.html`
  (reenvía enlaces antiguos de la raíz a `/tool/…`; para paths ya bajo `/tool/` muestra un 404
  simple). Todas las rutas internas son relativas, así que funcionan igual bajo `/tool/`.
- **Auth**: ✅ login real con **Supabase magic link**. El redirect del enlace mágico usa
  `location.origin + location.pathname`, por lo que vuelve correctamente a la página bajo `/tool/`.
  Lectura pública; escribir requiere sesión (RLS: anon SELECT, authenticated ALL).
  ⚠️ Añadir en el dashboard de Supabase (proyecto `aswwjkfejdfglpxlgbjl`) las Redirect URLs /
  Site URL con el nuevo path: `https://www.yokup.com/tool/*` y `https://yokup.com/tool/*`.
- **Backend**: ✅ **en producción con Supabase** (modo `supabase`, directo desde el navegador
  con la anon key + RLS demo, sin worker). Proyecto `aswwjkfejdfglpxlgbjl` (eu-central-1).
  Esquema: `db/schema-demo.sql` + `db/rls-demo.sql`. Verificado el ciclo completo escribiendo
  en la BD real. La arquitectura con worker (`api/`) queda disponible como alternativa futura.
  > Nota seguridad: la anon key en `config.js` es pública por diseño; RLS demo abre acceso
  > anónimo (aceptable para demo). Endurecer con Supabase Auth antes de producción real.

### Cómo dejar la web en www.yokup.com/tool

Ya está montado así. El dominio custom (`web/CNAME` = `yokup.com`) hace que Pages sirva desde
la raíz del dominio, y la subruta `/tool/` la damos nosotros con la carpeta `web/tool/`:

1. **Dominio fijado en el repo**: `web/CNAME` contiene `yokup.com` (no tocar; si se moviera a
   `web/tool/` Pages perdería el dominio). DNS y config de Pages ya apuntan aquí.
2. **App en subruta**: todo el frontend vive en `web/tool/`, por lo que se sirve en
   `https://www.yokup.com/tool/` (y `https://yokup.com/tool/`).
3. **Raíz → /tool/**: `web/index.html` redirige (meta refresh + `location.replace('/tool/')`).
4. **Enlaces antiguos**: `web/404.html` reenvía paths viejos de la raíz (p.ej. `/panel.html`) a
   `/tool/…`.
5. **CORS del worker** ya contempla `https://www.yokup.com`.

## Estructura

```
yokup/
├─ web/                   # Frontend estático (HTML/JS/CSS vanilla, estilo Admira)
│  ├─ index.html          # Landing "cómo funciona" (el bucle + las dos caras)
│  ├─ video.html          # Vídeo explainer animado (7 escenas, autoplay + controles)
│  ├─ alta-punto.html     # Explicación + alta de punto de venta
│  ├─ alta-instalador.html# Explicación + alta de instalador (freelance/empresa)
│  ├─ panel.html          # Panel de intervenciones (KPIs + listado + valoración)
│  ├─ marketplace.html    # Tablón de trabajos por zona (los técnicos aceptan)
│  ├─ equipos.html        # Catálogo de equipos (surfaces) por punto de venta
│  ├─ backoffice.html     # Operador: supervisar · asignar/reasignar · validar altas · métricas
│  ├─ data.js             # Capa de datos: stores desde omnipublicity-api + altas/intervenciones (mock LS)
│  ├─ yokup-nav.js        # Navegación
│  └─ yokup.css           # Estilos (paleta Admira + acento Yokup)
│  ├─ config.js          # Selector de backend: 'local' (mock) | 'api' (worker)
├─ api/                  # Cloudflare Worker (yokup-api) + Supabase — ver api/README.md
│  ├─ src/index.js
│  └─ wrangler.toml
├─ db/
│  └─ schema.sql        # Esquema PostgreSQL / Supabase (v1)
└─ docs/
   └─ 00-definicion.md  # Documento de definición
```

## Backend conmutable

El frontend funciona con dos backends, elegidos en [`web/config.js`](web/config.js):

- **`local`** (por defecto): mock en `localStorage`. Demo navegable sin servidor.
- **`api`**: Cloudflare Worker `yokup-api` + Supabase. Ver [`api/README.md`](api/README.md)
  para crear el proyecto Supabase (con `db/schema.sql`), desplegar el worker y enchufarlo.

La API de `data.js` es idéntica para ambos: lecturas síncronas (cache hidratada en modo
`api` vía `await Yokup.ready`) y escrituras optimistas que persisten en segundo plano.

## Stack

- **Frontend**: HTML/JS/CSS vanilla. Reutiliza `tokens.css` del design system `admira-design`.
- **Datos de centros**: `omnipublicity-api` (Cloudflare Worker + KV), mismo maestro que Admira.
  Un "equipo" en Yokup = una `surface` de un store.
- **Persistencia (F1+)**: PostgreSQL / Supabase (ver `db/schema.sql`).
- **Integración**: webhook firmado Admira → endpoint de ingesta (`webhook_inbox`, idempotente).

## Desarrollo local

```bash
cd web && python3 -m http.server 8788
# http://localhost:8788   (config en .claude/launch.json del workspace: "yokup-static")
```

En F0 las intervenciones se guardan en `localStorage` (mock) hasta conectar la API real (F1).

## Roadmap

- **F0 ✅** Esqueleto + datos: web, esquema Supabase, seed de stores/surfaces desde Admira.
- **F1** Ingesta Admira: endpoint webhook firmado + alta de intervenciones.
- **F2** Marketplace técnico: alta de técnico, tablón por zona, aceptar/rechazar.
- **F3** Ejecución + valoración.
- **F4** Back-office Yokup (operador, métricas).
- **F5** i18n / multipaís.
```
