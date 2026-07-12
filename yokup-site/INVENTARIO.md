# Inventario del espejo de yokup.com

Espejo del sitio vivo (Cloudflare Pages, proyecto `yokup`) recuperado el **2026-07-12**
crawleando desde `/` y `/app` (curl -A Mozilla -L) y cerrando el grafo de
href/src/import/fetch/url(). El fuente original se perdió (scratchpad borrado); este
directorio es ahora la fuente de verdad local.

Worker de datos (externo, NO en este repo): `https://yokup-rtc.csilvasantin.workers.dev`

## Archivos reales servidos (200, contenido propio) — 15

| Ruta prod | Archivo local | Tipo | Notas |
|-----------|---------------|------|-------|
| `/` | `index.html` | HTML | Landing (Edición Clear Channel, maplibre). Fuera del perímetro. |
| `/app` | `app.html` | HTML | App del técnico (PWA). Fuera del perímetro. |
| `/incidencias` | `incidencias.html` | HTML | **Perímetro** · bandeja de tickets |
| `/ticket?id=…` | `ticket.html` | HTML | **Perímetro** · ficha de ticket (querystring, página única) |
| `/agentes` | `agentes.html` | HTML | **Perímetro** · panel de agentes |
| `/asistencia` | `asistencia.html` | HTML | **Perímetro** · videollamada WebRTC |
| `/intervencion` | `intervencion.html` | HTML | **Perímetro** · ficha de intervención |
| `/acceso.js` | `acceso.js` | JS | Gate Google + parche fetch (Bearer). NO SE TOCA. |
| `/avatar-widget.js` | `avatar-widget.js` | JS (module) | Copiloto avatar. NO SE TOCA. |
| `/sw.js` | `sw.js` | JS | Service worker (push de incidencias) |
| `/manifest.webmanifest` | `manifest.webmanifest` | JSON | Manifest PWA |
| `/app/apple-touch-icon.png` | `app/apple-touch-icon.png` | PNG | |
| `/app/icon-192.png` | `app/icon-192.png` | PNG | Referenciado por manifest + sw.js |
| `/app/icon-512.png` | `app/icon-512.png` | PNG | |
| `/app/yokup.apk` | `app/yokup.apk` | APK | ~4 MB, build Android del player |

## Dependencias externas (CDN, NO espejadas — se cargan de su origen)

- `https://www.carlossilva.info/admira-design/tokens.css` (tokens de diseño Admira)
- `https://digitalavatar.ai/embed.js` (avatar, fuente única)
- `https://unpkg.com/maplibre-gl@5.6.0/...` (mapa de la landing)
- `https://accounts.google.com/gsi/client` (login Google, cargado por acceso.js)

## Rutas sondeadas que NO son archivos reales (fallback SPA o gestionadas por Cloudflare)

Cloudflare Pages sirve el HTML de la landing (25 766 b) como fallback para rutas sin
archivo. Distinguidas por firma del landing («Clear Channel × Yokup») + content-type.

- `/favicon.ico`, `/favicon.svg`, `/favicon.png` → fallback (NO hay favicon propio; el
  sitio no declara `<link rel=icon>`, usa apple-touch-icon en `/app/`).
- `/og.png`, `/og-yokup.png`, `/apple-touch-icon.png` (raíz) → fallback (no existen).
- `/manifest.json` → fallback (el real es `/manifest.webmanifest`).
- `/sitemap.xml` → fallback (no hay sitemap).
- `/404.html` → devuelve el landing (no hay página 404 propia; el fallback ES el landing).
- `/robots.txt` → **gestionado por Cloudflare** (bloque «Content-Signal» inyectado) +
  fallback del landing anexado. NO es un archivo del proyecto → no se guarda.
- `/_headers`, `/_redirects` → **NO recuperables**: Cloudflare Pages los consume en
  build y no los sirve; la petición cae en el fallback SPA. Su contenido real (reglas de
  cabeceras/redirecciones, incluida la muy probable regla SPA `/* /index.html 200`) NO
  se puede reconstruir desde el sitio vivo. **Posible hueco del espejo vs prod.**

## Dudas / posibles huecos frente a prod

1. `_headers` y `_redirects` no son recuperables (ver arriba). Es lo único que puede
   faltar respecto al proyecto Pages original.
2. No se encontró `icon-192.png` por crawl (referenciado solo desde manifest/sw.js, que
   no son HTML); se descargó por sondeo directo. El resto de assets salió del grafo HTML.
3. El `.apk` se espejó completo (~4 MB); si prod lo regenera, quedaría desfasado.
