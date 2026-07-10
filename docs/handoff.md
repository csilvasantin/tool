# Handoff — estado y continuación

> Documento de traspaso para retomar el trabajo desde **cualquier ordenador/sesión**
> (contenedores efímeros: se empieza de cero cada vez). Última actualización: 2026-07-10.

## Contexto de repos y rama

- Repo de trabajo actual: **`csilvasantin/tool`** (proyecto **Yokup** — marketplace de
  intervenciones técnicas; web estática + Cloudflare Worker `api/` + Supabase).
- Rama de desarrollo: **`claude/sleepy-babbage-Sp9Ua`**.
- **PR #1** (LISTO para merge, ya no borrador): https://github.com/csilvasantin/tool/pull/1
- Repos relacionados (Pixeria, aún fuera de scope de esta sesión):
  - `csilvasantin/pixeria.com` — **Astro**, canónico (= www.pixeria.com).
  - `csilvasantin/pixeria` — HTML, versión antigua (a archivar/descartar).

## Hecho en esta sesión (todo en PR #1)

1. **Integración Telegram + Grok** en el Worker (`api/`):
   - `POST /api/telegram/webhook` — comandos (`/pendientes`, `/tecnicos`,
     `/intervencion <id>`), texto libre vía Grok, y análisis de fotos con visión.
   - Aviso al grupo **GrokControl** al entrar una intervención por el webhook de Admira,
     con triaje de Grok (resumen + prioridad).
   - Módulos: `api/src/grok.js`, `api/src/telegram.js`, `api/src/bot.js`.
   - Guía: `docs/telegram-grok.md`. Todo **degrada en silencio** si faltan secrets.
2. **SessionStart hook** (independiente del ordenador): `.claude/hooks/session-start.sh`
   (npm install en `api/`) + `.claude/settings.json`. `api/package-lock.json` fijado.
3. **Plan de fusión Pixeria** (opción A cerrada): `docs/plan-fusion-pixeria.md`.

## Pendiente / próximos pasos

### A) Desplegar el bot de Telegram (fuera de esta sesión — red bloqueada aquí)
Desde el contenedor **no** se puede llegar a `api.telegram.org` ni a `api.x.ai`
(política de red: `403 host_not_allowed`). El bot funciona **una vez desplegado en
Cloudflare**. Pasos (ver `docs/telegram-grok.md`):
- `wrangler secret put` de `TELEGRAM_BOT_TOKEN`, `TELEGRAM_SECRET_TOKEN`, `XAI_API_KEY`.
- Chat ids en `wrangler.toml [vars]`: `TELEGRAM_CHAT_GROKCONTROL`,
  `TELEGRAM_CHAT_GROKADMIRANEXT`. Modelos: `XAI_MODEL`, `XAI_VISION_MODEL`.
- `npm run deploy` y registrar el webhook (`setWebhook` con el mismo secret).

**Datos a pedir al otro ordenador** (el que ya tenía el bot escribiendo en GrokControl):
long-polling o webhook, token del bot, chat ids reales, modelo exacto de Grok
(texto y visión), y si las imágenes de GrokAdmiraNext se analizan o solo se archivan.

### B) Ejecutar la fusión Pixeria (requiere sesión con otro scope)
No se puede desde esta sesión (solo alcanza `tool`). Abrir sesión con:
- **Principal = `csilvasantin/pixeria.com`** (con permiso de escritura).
- En scope además: `csilvasantin/pixeria` y `csilvasantin/tool`.
Luego (detalle y comandos en `docs/plan-fusion-pixeria.md`):
- `git subtree add --prefix=apps/yokup <tool> main`
- `git subtree add --prefix=legacy/pixeria-html <pixeria> main` (opcional)
- Replicar el SessionStart hook en el monorepo.
- Ajustar build/deploy unificado (Astro raíz + Yokup en subpath) y dominio/CNAME.

## Blockers conocidos (de entorno, no de código)

- **Red**: solo hosts permitidos (GitHub vía proxy). Telegram, xAI y pixeria.com
  bloqueados desde el contenedor.
- **Scope GitHub**: esta sesión fijada a `csilvasantin/tool`; sin `add_repo`/`list_repos`.
- **`send_later`** no disponible → no hay auto-check-in programado del PR.

## HandON — espacio de trabajo (macOS)

Un solo comando **`handon`** (carpeta `HandON/`, sin scripts sueltos) monta los 4
escritorios en cualquier Mac. Layout: Spaces 1-3 con navegador a la izquierda y CLI de
LLM a la derecha (1: Chrome admira + Claude · 2: Chrome gmail + Codex · 3: Firefox +
Grok), Space 4: Safari a pantalla completa.

- `HandON/handon install` — instala yabai+jq y enlaza el comando.
- `handon` — monta el espacio de trabajo.
- `handon autostart` — auto-arranque al iniciar sesión.
- Config por-máquina en `~/.handon.conf` (perfiles de Chrome, CLIs). El script es idéntico
  en todos los equipos. Paso manual: SIP para yabai. Detalle en `HandON/README.md`.

## Suscripción activa

Sesión **suscrita a la actividad del PR #1** (comentarios de revisión / CI). No hay CI
que aplique (el workflow `pages.yml` solo corre en cambios de `web/`).
