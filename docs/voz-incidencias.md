# Yokup — Central de Incidencias por Voz (MVP)

> Rama: `neo/yokup-voz` (repos `tool` y `admira-telegram-live`).
> Autor: subNeo (Opus 4.8 · equipo AdmiraNeXT), capa 2 bajo Neo.

## Definición (de Neo, capa 1)

Punto de entrada = **widget de voz en el panel de Yokup** (NO teléfono todavía). El
responsable del punto pulsa "🎙️ Reportar por voz", habla natural ("la pantalla principal
no se enciende"), y el sistema **crea la incidencia en el backend Yokup existente** con
título clasificado por LLM + transcripción como nota + audio como evidencia. Dos tramos:

- **TRAMO A (construido YA, sin claves de pago):** STT con la Web Speech API del navegador
  (`webkitSpeechRecognition`, es-ES) como captura; el audio se graba con MediaRecorder para
  adjuntarlo. La transcripción va a un Worker que llama al LLM (Claude API) para: (1) título
  corto, (2) tipología, (3) urgencia, (4) resumen ejecutivo para el técnico. Luego crea la
  incidencia vía el backend Yokup existente.
- **TRAMO B (solo ESQUELETO + doc, NO activar):** sustituir la captura por Cloudflare
  Realtime Agents + RealtimeKit (voz ElevenLabs, latencia baja, futuro teléfono/PSTN v2).

## Arquitectura

```
┌──────────────────────────────┐        POST /api/voz-incidencia        ┌───────────────────────────┐
│  Navegador (voz.html)        │  ── transcript + punto + contacto ──▶  │  Worker admira-telegram    │
│  · Web Speech API (es-ES)    │        { source:"yokup", hp }          │  handleVozIncidenciaPost   │
│  · MediaRecorder (audio)     │                                        │                            │
│    → audio local + metadato  │  ◀── { id, title, tipologia,   ──────  │  1) Clasificar:            │
│  · botón 🎙️  en el nav Yokup  │        urgencia, resumen,              │     · Claude API (si key)  │
└──────────────────────────────┘        classifier }                    │     · stub reglas (si no)  │
                                                                         │  2) INSERT tabla `tasks`   │
   Tablón Yokup / Panel  ◀──── GET /api/tasks?source=yokup ─────────────│     source=yokup           │
                                                                         │     needs=silicio,todo     │
                                                                         │  3) Aviso al Consejo (TG)  │
                                                                         └───────────────────────────┘
```

- **Frontend:** `web/tool/voz.html`. Reutiliza `yokup.css`, `yokup-nav.js` (enlace 🎙️ Voz)
  y `config.js` (`ADMIRA_API`). No hay claves en el navegador.
- **Backend:** worker `admira-telegram` (`admira-telegram-live/src/index.js`), nuevo endpoint
  `POST /api/voz-incidencia`. Reutiliza la MISMA tabla `tasks` y el mismo patrón que
  `POST /api/incidents` (público, honeypot `hp`, `source=yokup`, `needs=silicio`, `status=todo`).
- **URL producción del worker:** `https://admira-telegram.csilvasantin.workers.dev`

### Por qué este worker y no `yokup-api`

El panel de Yokup (`data.js`) habla con `yokup-api.csilvasantin.workers.dev` para sus
intervenciones. Pero el **helpdesk/tablero de incidencias** de silicio vive en el worker
`admira-telegram`, que ya expone `/api/incidents` y `/api/tasks?source=yokup` y avisa al
Consejo por Telegram. La incidencia por voz es una incidencia de helpdesk → va a
`admira-telegram`, coherente con lo que ya recoge el equipo. (Si en el futuro se quiere
también en el panel de intervenciones, se añade un `origin` o se replica; fuera del MVP.)

## Flujo de datos (Tramo A)

1. Usuario pulsa 🎙️ → `webkitSpeechRecognition` (es-ES, `continuous`, `interimResults`)
   transcribe en vivo; en paralelo `MediaRecorder` graba el audio.
2. Usuario pulsa ⏹ → se para STT y audio; puede editar el texto a mano.
3. Usuario pulsa «Crear incidencia» → `POST /api/voz-incidencia` con:
   `{ transcript, source:"yokup", punto, contact, audio_note, hp, reporter? }`.
4. Worker clasifica (Claude o stub) → `{ title, tipologia, urgencia, resumen }`.
5. Worker inserta en `tasks` (`source=yokup`, `needs=silicio`, `status=todo`), guarda el
   resumen + transcripción íntegra en `detail`, y avisa al Consejo por Telegram.
6. Respuesta al navegador con el `id` y la clasificación; aparece en
   `GET /api/tasks?source=yokup` y en el Tablón.

### Contrato del endpoint

`POST /api/voz-incidencia` (público, CORS familia Admira + localhost)

```jsonc
// request
{
  "transcript": "la pantalla principal no se enciende",  // obligatorio
  "source": "yokup",            // "yokup" | "admira" (default yokup)
  "punto": "Tienda Gran Vía",   // opcional
  "contact": "Ana 600...",      // opcional
  "audio_note": "grabación ~12s",// opcional, metadato del audio (el blob NO se sube aún)
  "reporter": "ana@...",        // opcional (email si hay sesión)
  "hp": ""                      // honeypot: si viene relleno se descarta como bot
}
// response
{ "ok": true, "id": 26, "classifier": "claude"|"stub"|"stub-fallback",
  "title": "...", "tipologia": "pantalla", "urgencia": "alta", "resumen": "..." }
```

Tipologías: `pantalla | player | red | montaje | contenido | electrico | otro`.
Urgencias: `baja | media | alta | critica`.

## Clave LLM (Claude) — cómo activar la clasificación real

El worker busca la clave con `getSecret(env, "ANTHROPIC_API_KEY")` y, si no,
`getSecret(env, "CLAUDE_API_KEY")`. `getSecret` acepta tanto secreto plano del Worker como
binding al Cloudflare Secrets Store.

- **Si NO hay clave:** el clasificador cae al **stub por reglas** (`clasificarPorReglas`,
  heurística es-ES) y lo reporta con `classifier: "stub"`. La incidencia se crea igual.
- **Si hay clave:** usa Claude (`claude-haiku-4-5`, Messages API) con `classifier: "claude"`.

Estado en el MacBook Air actual: **no hay CLI de la Cúpula** en esta máquina (el acceso a la
bóveda es vía CLI `agora` en otra máquina — ver memoria `reference_cupula_secretos.md`). Por
eso **no se pudo materializar ni subir la clave desde aquí**. Paso para Carlos:

```bash
# Opción A · secreto plano del Worker (rápido):
cd admira-telegram-live
wrangler secret put ANTHROPIC_API_KEY   # pega el valor cuando lo pida

# Opción B · binding al Secrets Store (bóveda de la cuenta) en wrangler.toml:
# [[secrets_store_secrets]]
# binding = "ANTHROPIC_API_KEY"
# store_id = "<STORE_ID de la bóveda>"
# secret_name = "ANTHROPIC_API_KEY"
```

Sin ese paso, el MVP funciona en modo stub (útil para demo). Con la clave, la clasificación
pasa a ser LLM real sin tocar el frontend.

## Audio como evidencia — estado y TODO (R2)

En el MVP el audio se graba y se **reproduce localmente** para el usuario, pero el blob **no
se sube** al backend (evitamos montar infra pesada). Se manda solo el metadato (`audio_note`
con la duración) y la transcripción íntegra queda en `detail`.

Para adjuntar el audio de verdad (patrón Cloudflare recomendado):

1. Crear bucket **R2** (`wrangler r2 bucket create yokup-voz-audio`) y bindearlo al worker.
2. Nuevo `POST /api/voz-audio` que reciba el blob (multipart) y lo guarde en R2 con una key
   `yokup/voz/<id>.webm`; devolver la URL firmada / pública.
3. En `voz.html`, tras crear la incidencia, subir `audioBlob` y hacer `PATCH` de la nota con
   el enlace (o mandarlo junto en un endpoint que haga las dos cosas).

## TRAMO B — Cloudflare Realtime Agents + RealtimeKit (NO activar)

Objetivo: sustituir la captura STT del navegador por un **agente de voz de baja latencia**
(voz ElevenLabs) y habilitar el futuro **teléfono/PSTN (v2)**.

Construido con el **Cloudflare Agents SDK** (clase `Agent` con voz — `withVoice` /
`@cloudflare/voice`, experimental; ver skill `agents-sdk` y docs
https://developers.cloudflare.com/agents/api-reference/voice/) + **RealtimeKit** para el
canal WebRTC.

Flujo previsto:

1. El navegador pide al Worker un **token de sesión RealtimeKit** (server-side, con
   `REALTIMEKIT_APP_ID` + `REALTIMEKIT_API_KEY`). Token efímero, con scope.
2. El SDK de RealtimeKit abre el canal de voz WebRTC; el Realtime Agent transcribe y dialoga
   (ElevenLabs).
3. Al cerrar, el Agent llama a la MISMA lógica de clasificación + creación de incidencia
   (`/api/voz-incidencia` o un método `@callable` del Agent) → tabla `tasks`.

El esqueleto (pseudocódigo comentado) está al final de `web/tool/voz.html`, sección
"TRAMO B — ESQUELETO (NO ACTIVAR)".

### Claves que FALTAN para Tramo B (a la Cúpula / Secrets Store, NUNCA al navegador)

| Clave | Para qué | Dónde va |
|-------|----------|----------|
| `REALTIMEKIT_APP_ID`  | Id de la app RealtimeKit | Secret del Worker / Secrets Store |
| `REALTIMEKIT_API_KEY` | Auth server-side para emitir tokens de sesión | Secret del Worker / Secrets Store |
| `ELEVENLABS_API_KEY`  | Voz TTS/STT del agente | Secret del Worker / Secrets Store |

Pasos de activación (cuando haya claves y OK de Carlos):

1. Subir las 3 claves (`wrangler secret put ...` o binding Secrets Store).
2. Añadir la clase `Agent` de voz + config Durable Object en `wrangler.toml` (ver skill
   `agents-sdk`: `durable_objects` + `migrations` + `nodejs_compat`).
3. Endpoint `POST /api/rtk-token` en el worker que emita el token de sesión.
4. Descomentar/implementar `iniciarVozRealtime()` en `voz.html` y añadir un botón
   «Hablar en tiempo real» junto al micro actual.

## Verificación hecha

- **Backend base:** `POST /api/incidents` (mismo patrón que el nuevo endpoint) → creó
  incidencia **#25** `source=yokup`, visible en `GET /api/tasks?source=yokup`. (incidencia
  de prueba; requiere PANEL_KEY para marcar `done` — pendiente de limpiar por Carlos/Neo).
- **Worker:** `node --check src/index.js` → sintaxis OK.
- **Clasificador stub:** test unitario en node de `clasificarPorReglas` con 6 frases reales
  (pantalla/player/red/contenido/montaje + "humo"→critica) → clasificación correcta.
- **Widget (preview navegador, `web/tool/voz.html`):** carga sin errores de consola; el nav
  muestra "🎙️ Voz"; al escribir la transcripción se habilita «Crear incidencia»; el click
  dispara `POST https://admira-telegram.csilvasantin.workers.dev/api/voz-incidencia` con el
  body correcto (`transcript, source:yokup, punto, contact, hp, audio_note`) y renderiza el
  resultado (id + tipología + urgencia + clasificador + resumen).
  - **Nota honesta:** la voz real (Web Speech API) NO se pudo probar headless (necesita gesto
    de usuario + micro). Se verificó el camino equivalente: transcripción a mano/simulada +
    POST. La captura de voz en sí queda para prueba manual de Carlos en Chrome con micro.
  - **Bug encontrado y corregido en verificación:** el bloque de comentario del Tramo B tenía
    comentarios `/* */` anidados que cerraban el bloque antes de tiempo y rompían TODO el
    `<script>` (ningún listener se enganchaba). Se sustituyeron por texto plano. Sin la
    verificación en navegador, el widget habría llegado a producción inservible.
- **Endpoint `/api/voz-incidencia` en vivo:** NO probado contra producción porque no está
  desplegado (solo en la rama) y esta máquina no tiene `wrangler` global. Prueba pendiente:
  `wrangler dev` o tras `wrangler deploy` en staging, con `curl`:
  ```bash
  curl -X POST https://admira-telegram.csilvasantin.workers.dev/api/voz-incidencia \
    -H 'Content-Type: application/json' \
    -d '{"transcript":"la pantalla principal no se enciende","source":"yokup","punto":"Tienda Gran Vía"}'
  ```

## Despliegue

- **NO desplegado a producción** de yokup.com ni del worker sin OK de Carlos.
- PR(s) desde `neo/yokup-voz` para cross-review.
- El frontend es estático (Pages); el endpoint requiere `wrangler deploy` del worker
  `admira-telegram`.
