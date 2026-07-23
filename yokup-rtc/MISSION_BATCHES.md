# Tandas de misiones

La ventana inicial de decisión contiene exactamente cinco misiones y una sexta
opción terminal, **Volver atrás**.

Al elegir una misión (o vencer el reloj), se crea una tanda persistente:

1. Se activa la opción elegida.
2. Las otras cuatro se guardan en el orden mostrado, haciendo *wrap* desde la
   elegida; no se crean tickets hasta que les toca.
3. Un cierre válido incluye prueba y aceptación: `evidence` + `accepted_by` en
   `POST /ticket/status`, o un informe con prueba y firma válida en
   `POST /fleet/informe`.
4. Tras el cierre, el lote queda en `awaiting_continuation`; no activa la
   siguiente candidata, ni siquiera cuando el cron vuelve a procesar la
   decisión raíz.
5. El coordinador publica una nueva `POST /decisions` de cinco minutos con
   `parent_decision`, `batch_id`, exactamente las candidatas aún en cola y
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
