# Backfill seguro de `tickets.project`

Herramienta operativa para misiones existentes donde falta `tickets.project` o
`tickets.project_id`. Ambos campos se escriben juntos con el mismo `projects.id`.
El modo predeterminado es **dry-run**: no escribe en D1 y emite una auditoría JSON
con `assigned`, `ambiguous` y `unresolved`.

## Fuentes admitidas

Una asignación sólo se propone cuando todas las pruebas disponibles convergen en
un único `projects.id`:

1. vínculo relacional `mission_batch_items → mission_batches → decisions.project`;
2. `tickets.parent_id` y el proyecto ya censado o resuelto 1:1 de la misión padre;
3. `agent_project_declarations` del día de creación de la misión en
   `Europe/Madrid`, para la identidad exacta `assignee + loc`; además, la fila
   debe haberse creado y no haberse modificado después de nacer la misión;
4. vínculo explícito aportado por el operador con proyecto censado y evidencia.

No se leen `subject`, logos, URLs ni dominios. Tampoco se usa pertenencia actual
del agente o de la máquina: no prueba cuál era el proyecto de una misión histórica.
Los valores ya existentes de `tickets.project` o `tickets.project_id` cuentan como
vínculo explícito y deben converger con el resto. Si dos fuentes apuntan a proyectos
distintos, la misión queda en `ambiguous`; si
ninguna fuente válida existe, queda en `unresolved`. Ninguno de esos dos grupos se
modifica.

## Dry-run y auditoría

Desde `yokup-rtc/`:

```sh
node tools/backfill-mission-projects.mjs \
  --audit /ruta/inmutable/backfill-2026-08-05.json
```

El destino por defecto es la D1 remota `yokup-tickets`. Para ensayar contra la D1
local de Wrangler, añadir `--local`. El fichero indicado en `--audit` debe no
existir: se crea con modo exclusivo para no sobrescribir una auditoría anterior.

Los vínculos explícitos son opcionales y tienen este formato:

```json
[
  {
    "mission_id": "FLT-123",
    "project_id": "yokup",
    "evidence": "ticket ADM-42 /projects/mission aprobado por Carlos"
  }
]
```

Se pasan con `--links /ruta/vinculos.json`. Una fila sin los tres campos o con un
`project_id` ausente del censo no autoriza ninguna escritura y permanecerá sin
resolver.

## Aplicación

1. Revisar la auditoría dry-run y resolver fuera de esta herramienta cualquier
   fila ambigua.
2. Conservar esa auditoría y ejecutar otra pasada con el mismo fichero de vínculos:

```sh
node tools/backfill-mission-projects.mjs \
  --links /ruta/vinculos.json \
  --apply --confirm APPLY-1TO1 \
  --audit /ruta/inmutable/backfill-2026-08-05-applied.json
```

La herramienta consulta primero `PRAGMA table_info(tickets)`. En apply, si el
esquema histórico aún no contiene `project_id`, lo añade ella misma con
`ALTER TABLE`; no depende de que una versión futura del worker ejecute
`applySchema`. El dry-run sólo informa `schema.project_id_before` y no altera el
esquema.

La escritura se divide en lotes de hasta 50 filas. Cada lote es un único
`UPDATE … CASE … RETURNING` que asigna `project` y `project_id`, es decir, una sentencia/transacción atómica de
SQLite: cualquier error revierte el lote completo. El `WHERE` vuelve a exigir que
ambos campos sigan vacíos o sean compatibles con el mismo id y que al menos uno
siga vacío, por lo que una asignación concurrente nunca se pisa.
`RETURNING` alimenta el contador real `summary.updated`; al repetir el comando ya
no quedan candidatos vacíos y la segunda pasada informa `updated: 0`. La auditoría
de aplicación añade `applied` y `skipped_after_guard`.

## Verificación local

```sh
node --test backfill-mission-projects.test.mjs
node --check tools/backfill-mission-projects.mjs
```

La auditoría incluye por misión `old_project`, `old_project_id`, `new_project` y
`new_project_id`, además de regla, procedencia y acción.

La herramienta no despliega, no crea proyectos y no cambia títulos, responsables,
estado, fechas ni tareas de las misiones.
