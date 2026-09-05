# Modos horarios por agente y superficie

`GET /fleet/agent/mode` devuelve todas las superficies conocidas, preferencias
persistidas, `available_modes`, `support_reason`, proyecto, próxima oportunidad y
último resultado. Usa sesión Google. Sin selección explícita el modo es `manual`.

`POST /fleet/agent/mode` recibe `{persona|agent,machine,runtime,host,mode}`; `host`
es `app|cli`, `mode` es `manual|learning|training`. El proyecto se resuelve desde
el mismo resolver canónico usado por las fichas: declaración principal de hoy
en Europe/Madrid, última misión real de hoy o ayer, última declaración anterior
como default persistente, y AdmiraNeXT. Un `project_id` opcional debe coincidir
y el proyecto debe seguir asignado canónicamente al mismo agente/equipo. Nunca se usa el filtro visible del Dashboard como asignación.

El cron existente y su lease ejecutan `agentHourlyModes`. Cada superficie tiene
una oportunidad por hora real UTC, empezando en la hora siguiente a activarse.
La restricción UNIQUE `(identity_key,hour_start)` cubre ticks simultáneos, alias y
cambios de modo. No se recuperan horas perdidas. Horas con actividad, máquina sin
señal o consumidor no disponible quedan registradas con motivo. Una oportunidad
no equivale a una entrega completada. El OnIdle general conserva su límite y
marcador anteriores; Training seleccionado es un flujo distinto y explícito.
Un lease adicional por familia y equipo impide que dos superficies/runtime de
la misma identidad trabajen a la vez. Se libera al cerrar o fallar y vence a los
45 minutos; el consumidor verifica que sigue perteneciendo a su run.

Para actuar se exige snapshot de proceso/censo de menos de 30 segundos, medida
HID reciente con al menos 300 segundos sin uso humano y ausencia de misiones,
tareas o decisiones activas de la familia en ese equipo. Cada adaptador debe
anunciar capacidad específica por runtime. No se ofrece soporte automático
para CLI ni para una Desktop App cuyo compositor no esté verificado. Una
capacidad describe implementación, no permiso para borrar un borrador: el
consumidor vuelve a comprobar actividad, destino, compositor y borrador.

Learning despacha una cápsula al consumidor real desktop/terminal. Un ACK del
consumidor solo pasa a `awaiting_delivery`; nunca completa la cápsula. El agente
debe publicar en Pixeria tipo `capsula`, con etiqueta del hash de 28 caracteres del run, conocimiento en
`comment` y fuente HTTPS en `prompt`, y llamar a
`POST /fleet/agent/mode/complete` con `{run_id,capsule_id}`. El servidor comprueba
el índice fresco de Pixeria, el tipo, etiqueta, contenido mínimo y fuente antes
de guardar el enlace. Una cápsula no puede completar dos oportunidades.

Training usa tres propuestas canónicas vigentes si existen. Si faltan, encarga
investigación al consumidor, sin fabricar una ventana ni reciclar títulos
caducados. El agente registra y cierra la investigación en Yokup y responde al
mismo `/complete` con `{run_id,proposals:[{title,evidence,source_url,observed_at}]}`.
Son exactamente tres títulos concretos con acción y métrica, evidencia observada
en los últimos 15 minutos y fuentes HTTPS del proyecto (si es GitHub, del mismo
repositorio). El servidor verifica disponibilidad de las fuentes, rechaza títulos
cerrados o propuestos recientemente, repite guardas y publica la decisión con
cinco opciones: tres mejoras, Volver atrás y Custom. La selección/vencimiento
usa el motor de tandas existente. Un CAS evita publicar dos decisiones desde
callbacks simultáneos.

`GET /fleet/agent/mode/guard?run_id=…` es la comprobación inmediata del consumidor.
Usa el token de ejecutor existente o sesión Google; niega ejecuciones tras pasar
a Manual, cambiar proyecto, expirar la oportunidad o aparecer trabajo activo.
El ejecutor debe incluir también `agent|persona,machine,runtime,host`; esos campos
deben coincidir con el destino exacto guardado para el run.
`/complete` y `/runs?id=…` admiten esas mismas identidades autenticadas; una sesión
que complete debe pertenecer a quien configuró el modo. No hay tokens en prompts.

Las reservas/arranques/despachos sin resolución vencen a los 45 minutos con
`delivery_timeout`. No se reinyectan automáticamente. El arranque se reconcilia
con proceso real antes de producir trabajo y se reclama atómicamente al
reanudar. `starting`, `dispatched` y `awaiting_delivery` siguen pendientes;
`completed` requiere cápsula verificada o URL de decisión persistida.

La reparación local de presencia corresponde al repo `admira-telegram`: el
watcher heredado apuntaba a un dominio workers.dev que devolvía 404. La resolución
al dominio canónico recupera snapshots reales sin cambiar el valor de la bóveda
ni cerrar/reabrir aplicaciones. Los cambios de consumidor y telemetría HID viven
en ese mismo repo, separados del motor de Yokup.

## Ejecutor CLI aislado y disponibilidad real

La cola `POST /api/fleet/agent/hourly-run` del bot recibe el destino exacto y
`{run_id,mode,project_id,project_url}`. El watcher consume `hourly_run` en un
proceso propio, con límite de 480 segundos; nunca escribe en un pane de tmux.
Yokup exige `hourly_cli_claude` y el destino exacto en `machine.hourly_targets`.
`hourly_unavailable` comunica falta de verificación de acceso sin publicar datos
privados. La preferencia permanece Manual salvo selección explícita de Carlos.

El único adaptador implementado en esta ampliación es Claude CLI con su perfil
OAuth local actual. En la comprobación del 5 de septiembre de 2026, la ejecución
mínima devolvió sesión OAuth caducada que no pudo renovarse. Por eso su capacidad
permanece vacía: la infraestructura instalada NO significa Claude CLI operativo.
`auth status` positivo por sí solo no habilita el adaptador. Un smoke mínimo con
el mismo aislamiento debe haber devuelto JSON válido y creado el marcador local.

El runner usa un directorio temporal y permite únicamente respuesta estructurada:
`--tools ''`, MCP vacío estricto, sin persistencia de sesión ni configuración de
proyecto. Conserva HOME/USER/LOGNAME/SHELL para usar la misma cuenta del llavero,
sin heredar claves API de otros proveedores. No requiere ni infiere un checkout.
El wrapper aporta hasta cuatro fuentes públicas del proyecto, con fecha, hash y
texto real. Resuelve DNS, rechaza direcciones privadas y fija la dirección
validada en TLS; no sigue redirecciones. Hay límites de bytes, intentos y tiempo.
El modelo no recibe credenciales y solo puede citar fuentes suministradas.

`POST /fleet/agent/mode/work` acepta `start`, `report`, `publish_claim` y `fail`.
El alta atómica crea una misión/tarea antes de investigar y liga su id al run;
solo ese id se excluye de la guarda de actividad del propio run. Una repetición
no inicia otra investigación. El informe conserva exclusivamente respuesta final
y metadatos operativos, sin razonamiento, mensajes privados ni secretos.
La ruta pública `mode/transcript?run_id=…` renderiza esa evidencia con HTML
escapado y CSP sin scripts. Se captura mediante Browser Rendering como
`agent/session_transcript`, se sube por `/fleet/media` y se registra en
`/fleet/progress`. Después de la entrega real se captura la cápsula/decisión,
se cierra por `/fleet/informe`, se sincroniza y se verifica el ticket exacto con
su prueba. `/mode/runs?id=…` incluye ese ticket en `work`.

Un CAS reclama la publicación una sola vez; un resultado ambiguo no se reintenta.
Pixeria publica la cápsula textual por su `/stock/publish` existente; su etiqueta
es el hash de 28 caracteres del run (sin `HMODE-`, porque Stock limita etiquetas
a 30). `/complete` verifica el asset real o publica la decisión validada. Un ACK
nunca sustituye esa comprobación. Manual, actividad humana, cambio de perfil o
fallo deja informe `unconcluded`; tampoco se borra una entrega ya verificada si
lo que falla es su cierre. No se anuncia éxito por un ticket sin cerrar.

La señal `waiting` de una sesión no tiene todavía una fuente canónica fresca.
Un proceso abierto, el modo seleccionado o el tiempo HID no demuestran que un
turno esté esperando. No se intercepta IPC privado para inferirlo. Codex Desktop,
Codex CLI, Grok y OpenCode siguen sin adaptador de investigación verificado.


## Proyecto principal visible y ejecución coherente

`GET /fleet/agent/mode` resuelve también las tarjetas Manual. Cada item aporta
`project_id`, `project_name`, `project_source`, `project_source_ref`,
`project_source_day`, `project_source_at`, `project_resolved_day` y
`project_available`. Las fuentes son `daily_primary`, `last_mission`,
`configured_default` y `admiranext_fallback`, en ese orden.

La declaración de hoy manda sobre cualquier misión. Una misión cuenta como real
si tiene inicio, cierre o informe material de una tarea; debe pertenecer a la
misma persona y máquina y tener actividad hoy o ayer según Europe/Madrid. Una
misión de varios días puede aportar su informe de tarea reciente o captura real
de proceso. `updated_at` del ticket y un latido sin captura no rejuvenecen trabajo.
Se excluyen colas sin iniciar, ventanas de decisión, cancelaciones y fechas
futuras. Al acabar ayer deja de ganar ese nivel; la última declaración anterior
persiste como default explícito, sin inferir pertenencias a proyectos.

El fallback usa el proyecto canónico `admiranext` (AdmiraNeXT), distinto de
`galaxia-admira`. Si el censo no lo confirma, su nombre es solo una referencia de
fallback y `project_available:false` impide tratarlo como asignación operativa.
Empates exactos entre aliases con proyectos distintos producen
`project_issue:project_ambiguous`, `project_available:false` y referencias del
conflicto; no se elige un proyecto por orden alfabético.

Los datos se leen en bloque por inventario, sin peticiones por tarjeta ni filtros
globales del Dashboard. `mode_project_id` y `mode_project_name` conservan la
selección guardada para un modo. Si difiere del principal actual,
`project_mismatch:true` muestra `blocked / principal_project_changed` y la guarda
impide trabajar en el proyecto anterior. Las preferencias no se editan ni se
habilitan automáticamente: Carlos debe volver a elegir el modo. El mismo resolver
se aplica al guardar, despachar y verificar una entrega.

Este cambio no infiere el estado Waiting ni convierte ausencia de señal en un
proceso cerrado; los contadores del inventario siguen particiones separadas.

Las señales sin superficie identificada también reciben proyecto en el GET:
`host:'unknown'`, `metadata_only:true`, `available_modes:[]`. Son metadatos de
lectura; POST de modo, guardas y control mantienen su validación estricta de
`app|cli`. No se inventa una superficie para resolver el proyecto.

## Prioridad de trabajo asignado (DCL-36161f, 2026-09-05)

Learning/Training ceden ante misiones asignadas open, in_progress o unconcluded,
y tareas del executor/owner real, sin caducidad por presencia. Familia y equipo
canónicos comparten veto entre CLI/App; otra máquina no lo hereda. Solo se omite
la investigación HWR enlazada al run/destino exactos, y las ya pausadas por este
mecanismo. Los prefijos de nombre no conceden excepciones.

Guardas antes de despacho, claim y entrega; consumidor revalida después del claim
y antes de publicar. El barrido previo a expirar decisiones pausa runs y ventanas
Training cuando aparece trabajo asignado. paused/human_mission_assigned conserva
texto, activos y transcripción, sin fabricar cierre. Respuestas tardías no reviven
la ejecución. automatic_work_pauses conserva causa y estado anterior. La selección
de modo permanece; la siguiente hora reevalúa disponibilidad sin repetir el run.

Academy antiguo no tiene consumidor verificado con guard de publicación: queda
paused/consumer_unverified. Cron y GET no crean ventanas; smith/pending devuelve
job:null; progress, result y Coach launch rechazan despacho/entrega. Solo se pausan
ventanas pending; decided/expired y entregas verificadas conservan historia. Se
reanuda mediante el selector Learning/Training en un destino soportado, no mediante
la cola antigua. No se afirma controlar publicaciones de scripts externos desconocidos.

Highscore reúne puntos por persona+rol+equipo canónico; agent es la persona y
machine el equipo. Alias Mini/MacMini convergen; máquinas distintas se separan,
conservando totales globales. Snapshots usan clave compuesta y no reasignan muestras
históricas ambiguas. El corredor sigue exigiendo trabajo material o sesión exacta:
la asignación sin señal veta formación pero no inventa actividad. host solo aparece
con una sesión exacta enlazada; no se infiere interfaz ni runtime del ticket.

### Observación de aplicaciones sin trabajo vinculado

`GET /highscore/active-work` devuelve `observations` además de `participants`.
Una observación contiene `agent`, `family_key`, `machine`, `host`, `runtime`,
`observed_at` (milisegundos), `process_state: open`,
`activity_state: unverified` y `reason: no_linked_work`. Requiere PID válido,
fuente `process_snapshot`, verificación y señal de los últimos 30 segundos;
rechaza estado cerrado/desconocido explícito, offline y fecha futura fuera de la
tolerancia. No expone PID, texto del foco, conversación ni identificadores de sesión.

Las observaciones quedan fuera del corredor, sus contadores y puntuaciones.
Una familia con trabajo actual verificable no aparece como hueco aunque use varias
superficies; otra máquina conserva su identidad. Un trabajo histórico terminado
no acredita la actividad actual. Reclamar la misión real y vincular su progreso
retira la observación cuando el siguiente GET reconoce ese trabajo.

Una aplicación abierta no prueba ejecución, espera ni inactividad. Este campo no
habilita Learning/Training ni sustituye sus guardas. La comprobación acotada de
Claude Desktop del 5 de septiembre no encontró un indicador AX Stop/generación
inequívoco; no se añadió telemetría busy/Waiting inferida. El trabajo que sólo se
ve en la aplicación necesita declaración/vinculación factual para ser corredor.

### Vinculación explícita de progreso a la sesión

`POST /fleet/progress` y las actualizaciones de estado de tarea admiten
`work_session: {runtime: "Claude", host: "app", session_id: "desktop:claude"}`.
Los tres campos deben venir juntos y corresponder a la sesión real del agente;
no se deducen de una captura. Persona y máquina proceden del actor y misión
validados, no de ese objeto. El servicio de presencia exige una sola sesión
abierta y fresca que coincida; nunca escoge entre APP y CLI arbitrariamente.

La respuesta de progreso y la tarea actualizada incluyen
`work_binding: {bound: true, reason: "bound"}` o `bound: false` con motivo seguro
(`ambiguous_session`, `session_not_found`, `invalid_session_selector`,
`service_unavailable`, `binding_unavailable` o `invalid_binding`). Sin selector
se conserva el enlace automático únicamente cuando la sesión es única. Un fallo
de enlace no borra ni rechaza el progreso factual ya registrado: `ok` acredita
ese progreso, mientras `work_binding.bound` acredita por separado el vínculo.
No debe comunicarse que la sesión quedó enlazada cuando `bound` sea falso.

### Identidad por superficie y metadatos observados

En Mac Mini, la configuración explícita distingue Codex APP (Oraculo) de Codex
CLI (Trinity). Los controles comparan persona, máquina, runtime, host, sesión y
PID exactos; un selector APP no puede apuntar al proceso CLI ni a su responsable.
Esta corrección no renombra misiones, tareas o puntuaciones históricas.

El merge de presencia sólo toma declaraciones de la misma familia, máquina,
runtime y superficie. El modelo procede del snapshot de esa sesión; ni un latido
CLI ni un slot cerrado rellenan el LLM de APP. Cuando cambia el dueño real de una
encarnación de proceso, su antiguo `work_ref` se vacía para evitar trasladar una
misión al nuevo dueño; los alias físicos Mini/MacMini y roles Sub/Infra de la
misma familia conservan el vínculo. Después se requiere un enlace explícito de
la misión o tarea real con `work_session`.

Dashboard no construye identidades desde cuenta/runtime ni usa el primer Claude
como respaldo de un reporter de navegador. Un reporter sólo complementa su
propia identidad declarada, sin verificar el proceso. Dashboard y Highscore
muestran LLM únicamente con snapshot verificado fresco (30 segundos); el valor
queda vacío si la fuente no lo conoce.
