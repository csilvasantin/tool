# Referencias humanas comunes

`display_ref` es una etiqueta visible adicional. No sustituye `id`,
`mission_id`, `code`, relaciones ni URLs.

## Contrato

- Formato exacto: `NNNN.DD/MM/AAAA.HH:MM`.
- Ejemplo: `0000.04/08/2026.08:49`.
- Zona horaria: `Europe/Madrid`, incluidos los cambios CET/CEST.
- Secuencia única compartida por `objective`, `window`, `mission` y `task`.
- Cada día madrileño empieza en `0000`; al cambiar de día usa otro contador.
- Entidades: objetivo=`ideas.id`, ventana=`decisions.id`, misión=`tickets.id`,
  tarea=`mission_tasks.mission_id + ':' + code`.
- Una vez asignada, la referencia queda persistida y no cambia por ordenación,
  filtros, paginación, actualizaciones de estado ni recreación de un plan.

## Persistencia y backfill

`display_refs` tiene una PK por entidad y `UNIQUE(day,seq)`; el contador se
reserva atómicamente con `UPDATE … RETURNING`. Antes de asignar una referencia de
cualquier día solicitado —también histórico—, el Worker reúne conjuntamente las
cuatro tablas, filtra por esa fecha madrileña y asigna todas las referencias
faltantes en orden `created_at`, tipo y clave técnica. Por tanto, consultar primero
misiones, objetivos, ventanas o tareas, con cualquier orden o página, no cambia la
secuencia común del día. Las altas de hoy precargan igualmente los registros que
ya existían ese día antes de reservar su número.

Las tareas incorporan `created_at`. Para filas antiguas se fija una vez desde
`updated_at`; las nuevas lo escriben al insertarlas. Su referencia persiste aunque
el plan se borre y se regenere con el mismo `mission_id:code`.

## Endpoints

El campo aditivo `display_ref` sale en:

- objetivos: `GET/POST /ideas` y altas persistidas de `/ideas/generate`;
- ventanas: `POST/GET /decisions`, `GET /decisions/:id` y respuestas de elección;
- misiones: `GET /tickets`, `GET /ticket` y `GET /fleet/missions`;
- tareas: `GET /tasks/all`, `GET/POST /mission/:id/tasks` y cambios de estado.
  En el agregado `/tasks/all`, `display_ref` pertenece a la tarea y
  `mission_display_ref` a su misión padre.

## Despliegue

1. Ejecutar `migrations/0003_display_refs.sql` en D1 remoto.
2. Desplegar el Worker.
3. Consultar las cuatro vistas y comprobar que comparten secuencia y que los IDs
   técnicos/enlaces permanecen sin cambios.
