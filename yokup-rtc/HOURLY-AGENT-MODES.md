# Modos horarios por agente y superficie

`GET /fleet/agent/mode` devuelve todas las superficies conocidas, preferencias
persistidas, `available_modes`, `support_reason`, proyecto, próxima oportunidad y
último resultado. Usa sesión Google. Sin selección explícita el modo es `manual`.

`POST /fleet/agent/mode` recibe `{persona|agent,machine,runtime,host,mode}`; `host`
es `app|cli`, `mode` es `manual|learning|training`. El proyecto se resuelve desde
la última declaración principal explícita; conserva validez entre días mientras
siga asignado canónicamente al mismo agente/equipo. Un `project_id` opcional debe
coincidir. Nunca se usa el filtro visible del Dashboard como asignación.

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
debe publicar en Pixeria tipo `capsula`, con etiqueta `HMODE-…`, conocimiento en
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
