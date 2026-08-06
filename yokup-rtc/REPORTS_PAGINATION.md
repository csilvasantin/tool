# Paginación del origen de Informes

## Auditoría de carga

El consumidor histórico usa `GET /tasks/all?scope=fleet`. Su consulta principal
no tenía `LIMIT`, no filtraba `report` y devolvía todas las tareas del ámbito,
incluidas las que todavía no son informes. Después adjunta referencias visibles
por lotes. Las imágenes no se descargan en el Worker: D1 sólo devuelve sus URLs,
pero el feed repetía `live_shot` y `process_image` con el mismo valor.

La modalidad paginada ejecuta una consulta de datos con `LIMIT + 1` para saber si
hay otra página y devuelve sólo filas con informe. Sin `include_total` mantiene
una consulta principal, más las mismas lecturas por lotes necesarias para las
referencias visibles. `include_total=1` añade un `COUNT(*)` deliberado. La query
nueva no repite `live_shot` y nunca descarga el binario de las capturas.

Proyección aproximada de volumen: con 300 tareas en el ámbito, la carga legacy
materializa 300 filas; la primera página materializa como máximo 31 y entrega 30,
una reducción del 89,7 % de filas en la consulta principal. Con 1.000 tareas, la
reducción es del 96,9 %. El ahorro real depende de cuántas tareas tengan informe.

## Contrato opt-in

`GET /tasks/all?scope=fleet&paginated=1&limit=30`

- `limit`: 1–100; por defecto 30.
- `cursor`: valor opaco recibido como `next_cursor`.
- `updated_from`: epoch-ms inclusivo aplicado en SQL a `mission_tasks.updated_at`.
- `updated_to`: epoch-ms exclusivo aplicado en SQL.
- `include_total=1`: calcula el total después de scope y fecha, antes del cursor.

La respuesta es:

```json
{
  "tasks": [],
  "next_cursor": null,
  "has_more": false,
  "total": null
}
```

El orden es descendente por `updated_at`, `mission_id` y `code`; las tres piezas
forman el cursor para no duplicar ni saltar empates. `total` es `null` salvo que
se solicite. Sin `paginated=1`, `/tasks/all` conserva exactamente `{ "tasks": [] }`.

Cada fila paginada añade, sin retirar `owner` ni `agent_identity`:

- `executor`: identidad canónica exacta, incluida la capa Sub/Infra.
- `role`: `main`, `sub` o `infra`.
- `family_key`: clave estable de persona + máquina, por ejemplo `morfeo@mbp16`.
- `family_name`: identidad principal sin capa, por ejemplo `MorfeoMBP16`.

El feed legacy conserva el significado histórico de `role` (rol de la misión)
para no romper `/tareas`; publica la capa del ejecutor como `executor_role`. En
la modalidad paginada, `mission_role` conserva aquel valor y `role` identifica
al ejecutor, que es el contrato nuevo consumido por Informes.

La máquina física forma parte de la clave: dos personas homónimas en equipos
distintos no se agrupan. Las identidades externas usan owner y máquina en una
clave `external:` separada.
