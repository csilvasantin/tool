# CLI aplazadas: política 1078

Orden de Carlos: los agentes **CLI** de todos los equipos permanecen pausados por
defecto mientras se trabaja con Desktop APP. La política versionada está en
`src/cli-policy.js` y en el módulo homónimo de `admira-telegram/src`. Es persistente
entre reinicios y despliegues; guardar Learning/Training, arrancar desde una ficha o
reconectar un watcher no la desactiva. No existe un botón ni endpoint de excepción.
`GET /fleet/runtime-policy` expone `cli_paused:true`, motivo y revisión1078.

La política bloquea arranque, envío de misión/texto operativo, nuevos vínculos de
trabajo/actividad CLI, Learning/Training CLI y publicación automática de resultados
CLI. El bot veta también órdenes pendientes y su ACK de arranque, por lo que una
cola anterior no se reactiva al volver la máquina. Se conserva la auditoría de las
órdenes rechazadas; no se cierran ni borran misiones humanas o su historial.

La clave de modos proviene exclusivamente de `modeTargetKey`: termina en `|app`
o `|cli`; las guardas SQL y de JavaScript comprueban ese contrato. Las claves de
comandos del bot usan otro separador y **no** se interpretan por sufijo: allí se
valida el campo `host` exacto. Un arranque sin host válido se rechaza, nunca se
supone APP. En el catálogo antiguo `/fleet/cli`, sólo `kind:'cli'` representa al
agente CLI; `kind:'session'` es terminal humano y `kind:'app'` es aplicación y se
preservan. Los comandos de pruebas, shells auxiliares y subprocesos internos no
son objetivos de esta política.

OnIdle automático antes no identificaba superficie. Ahora sólo abre o materializa
trabajo automático cuando hay **una APP exacta, fresca y verificada** de esa
familia/equipo. Cero, dos procesos, ausencia de sesión o sólo CLI bloquean con un
motivo legible. No se cambia la elección humana histórica ni se inventa una
superficie a partir de una tarea reciente.

## Estado físico y parada segura

- `cli_paused:true` / `operational_state:'paused_by_policy'` indican la prohibición
  de trabajo, no prueban que un proceso haya terminado.
- Un trabajo reciente sin sesión vinculada queda `assigned_stale` con
  `activity_reason:'session_unverified'`, conservando título, fechas y puntos.
- La parada CLI sólo se encola si un watcher fresco anuncia
  `cli_pause_preserve_session`. Un adaptador antiguo que usa `tmux kill-session`
  recibe `cli_safe_pause_unavailable`: no se le entrega una parada destructiva.
- El adaptador puede confirmar `status:'paused'` únicamente tras comprobar el
  estado suspendido del runtime exacto. `operational_state:'paused'` en el snapshot
  es una observación explícita del watcher; el proceso continúa abierto. Sin esa
  confirmación se informa solicitada, fallida o no alcanzable. Nunca `closed` por
  falta de señal.

La instalación y las paradas reales son trabajo de QA/operaciones, con doble
censo, identidad y PID exactos. La política del servidor por sí sola no detiene un
proceso ni un daemon antiguo desconectado. El ejecutor Grok legado reconcilia un
`grok.desired` local antes de consultar la API: debe deshabilitarse su launchagent
o actualizarse de forma explícita en cada equipo. **No escribir `stopped` ni
`paused` a ciegas**: su versión antigua puede matar tmux o rechazar el valor. No
modificar el watcher Desktop ni las aplicaciones al deshabilitar ese daemon CLI.

## Reversión sólo por una futura orden explícita

La reversión requiere un cambio versionado y verificado en ambos repositorios y
los adaptadores instalados; no basta cambiar un booleano. Debe incluir migración
explícita que retire `cli_policy_commit_fence_v1078` y
`cli_policy_run_fence_v1078` y recree `automation_commit_fence` y
`automation_run_publication_fence` con la política nueva, conservando sus demás
guardas de parada/concurrencia. No ejecutar esa migración ahora.

Después se revisan los destinos individualmente, su sesión/propietario, las
órdenes rechazadas y los daemons deshabilitados. Ningún trabajo se reencola ni se
reanuda automáticamente. Las sesiones suspendidas sólo reciben continuación por
orden explícita después de verificar de nuevo el proceso; se mantiene su contexto.
