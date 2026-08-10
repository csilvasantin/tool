# Proyecto principal diario por agente

Yokup conserva dos conceptos separados:

- **Proyecto principal de hoy**: declaración explícita y diaria de Carlos para una
  identidad operativa exacta, por ejemplo `OraculoMacMini`.
- **Censo de proyectos**: membresías y responsables estables de `projects` y
  `project_members`.

Declarar el proyecto principal diario no cambia el censo, el responsable estable,
las membresías, los tickets ni sus identificadores.

## Precedencia canónica

Highscore resuelve el proyecto mostrado con este orden:

1. Declaración explícita del día para la identidad exacta.
2. Proyecto del trabajo activo o reciente (presencia, tarea, ventana, misión u
   objetivo). Para el rótulo de actividad, la prioridad interna sigue siendo
   tarea > ventana > misión > objetivo; entre candidatos de proyecto se conserva
   el más reciente.
3. Proyecto estable del censo (`primary_responsible`, `owner` o membresía exacta).
4. `suscositas.com` como respaldo cuando no existe ninguna señal anterior.

La declaración vence al trabajo activo porque expresa una decisión humana para el
día completo. La clave incluye el día de Madrid y la identidad exacta, de modo que
dos máquinas de una misma persona pueden tener proyectos principales distintos.

## Persistencia e idempotencia

La tabla `agent_project_declarations` usa como clave primaria `(day, agent_key)`.
Una repetición idéntica devuelve `status: "unchanged"` sin escribir de nuevo. Una
declaración posterior para el mismo agente y día actualiza la única fila vigente,
conserva `created_at` y renueva `updated_at`.

Solo se aceptan identidades operativas exactas conocidas y proyectos activos del
índice canónico. El proyecto puede indicarse por `id`, `slug` o nombre reconocido.

## API

Declarar o cambiar el proyecto principal de hoy:

```http
POST /projects/principal
Content-Type: application/json

{
  "agent": "OraculoMacMini",
  "project": "xpaceos",
  "declared_by": "Carlos",
  "statement": "hoy el proyecto principal de OraculoMacMini es xpaceos.com"
}
```

Consultar las declaraciones de un día (por defecto, hoy en Madrid):

```http
GET /projects/principal?day=2026-08-05
```

`GET /projects` también expone `principal_declarations` y añade a cada proyecto la
colección `daily_primary_agents`. Highscore, Equipo y Dashboard consumen esa misma
respuesta: Highscore aplica la precedencia canónica; Equipo y Dashboard muestran
`Principal hoy` separado de las membresías estables.
