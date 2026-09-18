# Incidencias automáticas de players

Misión FLT-100514 · 16-sep-2026 · MorfeoMacMini · MacMini. Origen: bandeja #3320·b (Carlos, 14-sep-2026): yokup es la herramienta de gestión de incidencias de los players de admira.tv.

## Qué hace el worker (yokup-rtc)

`reconcile(env)` corre dentro de `runScheduledRoutine` como máximo cada 120 s. Lee el censo público `https://api.admira.store/signage/screens` (es donde laten los players Android, macOS, Linux y web de admira.tv; `api.yokup.com/incidents` lo sirve tal cual, pero tras la verja Google) y, por cada pantalla:

| Censo | Incidencia activa | Acción |
|---|---|---|
| `online:false` | no hay | Abre `INC-…` (`createTicket`): asunto «Pantalla sin señal de emisión», prioridad urgente, técnico auto-asignado, triage IA, evento `log` + `assign` (+ `ai`). |
| `online:false` | hay, último evento `recover` | Evento `relapse`: recayó antes de 5 min sana; el contador de cierre vuelve a cero. No abre otra incidencia. |
| `online:true` | hay, último evento distinto de `recover` | Evento `recover` con su hora. |
| `online:true` | hay, `recover` hace ≥ 5 min | **Cierre automático**: `status='resolved'`, `resolved_at`, evento `close` («Agente IoT») y aviso a suscriptores. |
| `online:true` | no hay | Nada. |

Una sola incidencia activa por player: lo garantiza el índice parcial `idx_active_screen` sobre `tickets(screen)`. Una incidencia resuelta o cancelada no se reabre; una caída posterior abre otra nueva.

Hasta el 16-sep el `recover` quedaba «pendiente de verificación y cierre» y nadie verificaba: tcl-terminator llevaba desde las 17:01 emitiendo con su incidencia abierta, y reuniones-2-mupi desde las 14:18.

## Qué NO cubre todavía y por qué

- **Pantalla en negro y contador de crashes.** El latido de los players hoy trae `device` (pantalla, sistema, hardware, software, almacenamiento, red), `showing_id`, `version` y `last_seen`. No trae `last_content_ok`, errores ni crashes, así que yokup no puede detectarlos: es trabajo del player (misión de admira.tv, encargo #3320·a). Cuando el latido los traiga, se añaden aquí dos ramas más del mismo `reconcile`.
- **Umbral de «offline».** Lo decide el censo de api.admira.store, no yokup: el 16-sep una pantalla con 260 s sin latir seguía `online:true`. El «más de 3 minutos» del encargo depende de ese umbral.
- **Pantallas que desaparecen del censo.** El censo sólo lista pantallas recientes; una que lleva mucho fuera deja de aparecer y su incidencia se queda abierta hasta que un humano la cierre (alcampo-* del 15-sep, smoke-edad, xtore-f7q5un). Es lo correcto: siguen caídas.
- **Runbook automático** (ping, reload, restart, reboot, rollback). El MCP ya permite confirmar qué players publican capacidad remota y el Supervisor enlaza a su mando oficial después de identificar la emisión. Yokup no ejecuta todavía comandos por sí solo: esa automatización necesita una política explícita de autorización, auditoría y recuperación. Mientras tanto, el runbook es manual (abajo).

## Vigilante en el MacMini

`~/Claude/admira-vault/vigila-players.sh`, launchd `com.admira.vigila-players` cada 120 s, log en `/tmp/vigila-players.log`. Pide `api.yokup.com/version.json` (público), lo que arrastra la rutina del worker aunque nadie tenga yokup abierto (el cron de Cloudflare no dispara en esta cuenta, FLT-1016), lee el censo público de api.admira.store y deja en el log qué players están fuera y desde cuándo. No abre ni cierra nada: el juicio es del worker.

## Runbook manual mientras Yokup no ejecuta comandos remotos

1. Abrir la incidencia en https://www.yokup.com/incidencias y leer el triage IA.
2. Comprobar el censo: `bash ~/Claude/admira-vault/vigila-players.sh` (o `api.yokup.com/incidents`). Si `age_seconds` crece, el player no llega a api.admira.store: red o app caída.
3. Si la máquina es de la flota (macmini, dgx-spark, macbookairazul…), entrar por SSH y mirar el proceso del player; reiniciarlo sólo con el OK de Carlos si es un equipo que él usa.
4. Si es un Android o un equipo de cliente, avisar en AgoraMatrix con el id de la incidencia.
5. Al volver la señal el worker anota `recover` y cierra solo a los 5 min. Si no cierra, mirar `events` de la incidencia: un `relapse` significa que cayó otra vez.

## Verificar en producción (solo lectura)

```sh
cd yokup-rtc && npx wrangler d1 execute yokup-tickets --remote --json --command \
"SELECT t.id,t.screen,t.status,t.resolved_at,(SELECT kind FROM events e WHERE e.ticket_id=t.id ORDER BY e.id DESC LIMIT 1) last_kind FROM tickets t WHERE t.source='agent-iot' ORDER BY t.created_at DESC LIMIT 10"
```

Pruebas: `node --test reconcile-autoclose.test.mjs` (arnés SQLite en memoria con las funciones reales del worker).
