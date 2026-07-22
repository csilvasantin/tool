# Tandas de misiones

Cada ventana de decisión de misiones contiene exactamente cinco misiones y una
sexta opción terminal, **Volver atrás**. El Worker sólo admite una por agente y
día natural de Madrid, salvo `user_override:true` cuando Carlos la solicita.

Al elegir una misión (o vencer el reloj), se crea una tanda persistente:

1. Se activa la opción elegida.
2. Las otras cuatro se guardan en el orden mostrado, haciendo *wrap* desde la
   elegida; no se crean tickets hasta que les toca.
3. Una misión sólo libera la siguiente si su cierre incluye `evidence` y
   `accepted_by` en `POST /ticket/status`. Eso escribe el evento `accept`.
4. La cola se pausa —sin abrir otro reloj— ante `cancelled`, un `blocked` con
   `requires_carlos:true`, o `new_priority:true`/`pause_batch:true`.

Los tickets de una tanda usan `source=decision-batch`. Sus tareas son
canónicas: Subagente implementa y verifica; Infraagente documenta hechos
autorizados. El Agente conserva la aceptación del cierre.

El cron también vence decisiones y activa tandas, por lo que no depende de que
alguien tenga abierta la interfaz de Yokup.
