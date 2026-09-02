# Contrato de vistas de Informes

## Baseline auditado

`informes.html` filtra, ordena, agrupa y pagina una sola colección (`ALL`) y la
representa como tabla adaptable. No monta `YkCabezal`, por lo que el conmutador
genérico `#viewTgl` no existe en esta página ni cambia su renderer. Ese control,
además, es iconográfico y no nombra explícitamente «Cuadrícula» y «Lista».

La integración debe conservar un único pipeline:

1. `loadPage` obtiene páginas y `mergeTasks` deduplica por `mission_id + code`.
2. `applyFilter` aplica proyecto y fecha.
3. `YkInformesSort.sort` fija el orden.
4. Sólo entonces la vista elegida proyecta esas mismas filas.

Nunca debe existir un filtro, sort, contador o cursor separado por vista.

## Contrato de producto

- Sin preferencia guardada, la primera visita abre `grid` (Cuadrícula). Montar el
  selector no escribe localStorage; sólo una elección explícita se persiste.
- El selector es un grupo «Vista de informes» con dos botones nativos:
  «Cuadrícula» y «Lista». Cada botón expone `aria-pressed`, `aria-label` y
  `aria-controls`; Intro/Espacio funcionan por semántica nativa.
- Cambiar de vista no vuelve a consultar la API, no ejecuta filtros ni ordenación,
  no reinicia el cursor y no altera grupos plegados. Sólo vuelve a representar el
  array ya preparado por `applyFilter`.
- Para cualquier snapshot, ambas vistas tienen las mismas claves
  `mission_id + code`, en el mismo orden, y los mismos `visible`, `loaded`,
  `total` y `hasMore`.
- `loading`, `error`, `empty` y «Cargar más» son estados compartidos. El estado
  vacío conserva el alcance de proyecto/fecha y el error conserva `role=alert`.
- «Anomalías de informe» usa la misma preferencia Cuadrícula/Lista, pero continúa
  como dataset global/histórico separado. Su clave es `debt_kind + id + code` y
  nunca entra en `ALL`, filtros, puntos, conteos o paginación; tampoco se le
  inventa un `report` para hacerla parecer un informe real.
- Un informe de tarea abre `/tareas?mission=<id>#<code>`. Un cierre de misión
  (`report_scope=mission` o, en legado, código `zN`) abre `/ticket?id=<id>`.
- Cuadrícula y Lista deben mostrar el mismo texto completo accesible, evidencias,
  PDF, tiempo y puntos; compactar visualmente no autoriza omitir datos del árbol
  accesible.
- A 520 px la cuadrícula queda en una columna. Ninguna tarjeta, texto, miniatura o
  control puede imponer un ancho mayor que el contenedor ni crear scroll lateral.

## Puntos exactos de integración

1. Cargar `yk-informes-view.css` y `yk-informes-view.js` junto a los módulos
   `yk-informes-*` de `informes.html`.
2. Insertar un contenedor del selector después de `#tfilter` y antes de `#debe`.
3. Montar `YkInformesView` con `targets: [$("reps"), $("debe")]` y
   `onChange: () => applyFilter()`. Así ambos datasets comparten sólo la vista.
4. En `render(list)`, obtener una sola vez `rowsForView(list)` y bifurcar sólo el
   marcado (`grid`/`list`). No mover la bifurcación a `applyFilter` ni `loadPage`.
5. Convertir el rótulo de tarea en enlace mediante `detailHref(t)`; mantener el
   enlace de misión existente. Para `z1/z2`, rotular «Informe de misión», no
   «Tarea Z1».
6. Mantener `updatePageState()` fuera de la bifurcación, después del render común.
7. En `loadDebe`, proyectar `d.debts` con `anomalyContract`; no concatenarlo con
   `ALL` ni aplicar `DFILTER`/`PROJECT_SCOPE`, porque la deuda vieja debe seguir
   visible hasta que se resuelva.

## Riesgos de integración

- El CSS móvil actual ya transforma la tabla en tarjetas a 900 px; hay que evitar
  que ese media query convierta también la nueva Lista en una segunda cuadrícula.
- `COLUMN_RESIZE.apply()` sólo corresponde a Lista. Aplicarlo sobre Cuadrícula no
  debe inyectar anchos guardados en las tarjetas.
- Los grupos están abiertos por visita deliberadamente. La preferencia de vista
  no debe reutilizar ni persistir `COLLAPSED_FAMILIES`.
- `PAGE.total` cuenta informes servidos, mientras `visible` excluye grupos
  plegados. Cambiar la maqueta no puede reinterpretar ninguno de los dos.
- El backend actual no expone `report_scope`; `zN` es el fallback compatible. Si
  se añade el campo explícito, debe prevalecer sin migrar filas históricas.
