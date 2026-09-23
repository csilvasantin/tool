# Cadena humana de llamadas

En `/llamadas`, cada incidencia conserva su cola de contactos y un historial de ciclos. La cadena indica el siguiente paso: confirmar el fallo con el comercio, preparar una propuesta, recoger las dos aceptaciones, seguir la intervención y pedir la valoración del comercio. Una valoración negativa abre un contacto de revisión con el técnico; solo la valoración satisfactoria permite cerrar.

La política inicial es de **3 intentos por ciclo, separados por 10 minutos**. Puede cambiarse por incidencia (1–10 intentos; 1–1440 minutos), indicando responsable de coordinación y motivo. Sin respuesta, ocupado y buzón reprograman el trabajo; al agotar el límite o recibir un rechazo/resultado sin clasificar, el contacto queda escalado en la cola. El responsable puede corregir los datos y abrir un nuevo ciclo con motivo, conservando todos los intentos anteriores. El responsable es una etiqueta operativa; no concede permisos ni envía avisos externos.

Los reintentos vuelven a estar disponibles mediante la sincronización periódica o al actualizar la cola. **No marcan teléfonos automáticamente**. Una pausa bloquea nuevas conversaciones; debe finalizarse una conversación activa antes de pausar. La fecha de reintento se conserva al pausar/reanudar. El cierre detiene los trabajos pendientes, incluidos los escalados, y no elimina conversaciones activas sin documentar su resultado.

Una propuesta nueva reinicia los dos contactos y exige aceptaciones de esa versión. No se puede modificar la propuesta durante una conversación activa. Registrar un resultado de llamada no equivale a aceptar una cita. La base de datos impide conversaciones simultáneas para una misma incidencia, incluso entre contactos distintos.

## API y despliegue

- Aplicar `migrations/0014_call_chains.sql` antes del Worker.
- `GET /api/calls/cases/:id` añade `chain` (política, revisión, fase y siguiente paso), `cycle` e `attempt_count` en los trabajos.
- `POST /api/calls/cases/:id/chain`: `action` = `policy`, `pause`, `resume` o `restart`; siempre `revision` y `reason`. `policy` recibe `coordinator`, `max_attempts`, `retry_minutes`; `restart` recibe `job_id`.
- Los permisos de comercio y la autenticación son los mismos que en llamadas. Una edición de política obsoleta devuelve 409.
- Pruebas: `node --test api/*.test.mjs`. Piloto aislado: `node api/tools/calls-pilot-server.mjs`, abrir `http://127.0.0.1:8788/llamadas`.

La telefonía PSTN/IA, los contactos alternativos automáticos, los avisos al coordinador y las políticas comunes por circuito quedan fuera de esta fase humana.
