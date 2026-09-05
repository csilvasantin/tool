# Tandas de misiones

Cuando el equipo está desatendido, OnIdle puede abrir una ventana inicial por
agente y hora de Madrid. Contiene exactamente tres misiones y una cuarta opción
terminal, **Volver atrás**.

Al elegir una misión (o vencer el reloj), se crea una tanda persistente:

1. Se activa la opción elegida.
2. Las otras dos se guardan en el orden mostrado, haciendo *wrap* desde la
   elegida; no se crean tickets hasta que les toca.
3. Un cierre válido incluye prueba y aceptación: `evidence` + `accepted_by` en
   `POST /ticket/status`, o un informe con prueba y firma válida en
   `POST /fleet/informe`.
4. Tras el cierre, el lote queda en `awaiting_continuation`; no activa la
   siguiente candidata, ni siquiera cuando el cron vuelve a procesar la
   decisión raíz.
5. El coordinador publica una nueva `POST /decisions` de cinco minutos con
   `parent_decision`, `batch_id`, las candidatas aún en cola —una o dos— y
   **Volver atrás** como última opción. La elección o el vencimiento devuelve el
   lote a `active` y activa exactamente una misión.
6. La cola se pausa ante `cancelled`, un `blocked` con
   `requires_carlos:true`, o `new_priority:true`/`pause_batch:true`.

Los tickets de una tanda usan `source=decision-batch`. Sus tareas son
canónicas: Subagente implementa y verifica; Infraagente documenta hechos
autorizados. El Agente conserva la aceptación del cierre.

El cron también vence decisiones y activa tandas, por lo que no depende de que
alguien tenga abierta la interfaz de Yokup.

## Reparación de una autoactivación antigua

`POST /fleet/batch/requeue-pristine` con `{"mission":"MIS-…"}` reencola una
misión que el contrato anterior activó automáticamente. Falla cerrado si ya hay
una tarea iniciada o terminada, report, imagen, prueba, progreso en vivo, evento
real, cierre o una continuación pendiente. Si sigue intacta, elimina únicamente
el ticket, las tres tareas pendientes y el evento sintético de activación, y
deja el lote en `awaiting_continuation`. Repetir la misma llamada es un no-op
idempotente.

## Contrato «ventana↔misión de una pieza» (05/09/2026 · misión DCL-d65ad512)

Lo que fallaba: la ventana creaba un contenedor sintético (`MIS-DEC-…-NN`) y el agente
declaraba su trabajo aparte (`DCL-…`, `POST /declare`). Nadie enlazaba los dos hilos:
la tanda se quedaba `active` para siempre con el contenedor vacío, la DCL flotaba sin
lote y `/fleet/missions` (sin filtro por agente y capado a 120) la escondía en cuanto
otro agente producía cien misiones en un día.

Ahora hay tres vías, todas canónicas y sin crédito duplicado:

1. **Antes de la ventana** — `POST /declare` las candidatas y `POST /decisions` con
   `option_targets:[{target_mission_id},…,null,null]`. Al elegir o vencer, el lote activa
   ESA misión (nada de contenedor). Verificado en vivo con la ventana 2783: al vencer,
   `batch.active_mission_id = DCL-d65ad512…`. Script: `admira-vault/ventana.sh`.
2. **Después de la ventana** — `POST /declare` con `decision_id`: si la tanda ya activó
   un contenedor, el worker llama a la adopción canónica (`adoptBatchTargetMission`, la
   misma de `/fleet/batch/adopt`) y responde `batch_adoption`. El contenedor queda
   cancelado como `equivalent_mission`; la DCL pasa a ser la misión activa del lote.
3. **Por título** — sin referencia, `activateNextMissionBatchItem` adopta la misión VIVA
   del proyecto cuyo título coincide (`findLiveTwinMission`). Declarar con el mismo
   asunto que la opción sirve como enlace implícito.

Cierre: `POST /declare` con `resolve:true` (o el informe) llama a
`reconcileBatchTargetMission` y responde `batch_reconciliation`; la tanda pasa a
`awaiting_continuation` o `completed`. Script: `admira-vault/mision.sh cerrar <DCL> …`
(evidencia de proceso → informe con captura → resolve, en ese orden).

`GET /fleet/missions` admite `agent`, `machine`, `project_id`, `status` (`open`,
`in_progress`, `unconcluded`, `resolved`, `cancelled` o `active`), `limit` (≤500) y
`offset`; con filtros responde además `total`, `limit`, `offset` y `filters`. Sin
parámetros conserva el contrato histórico de 120 filas.
