# Agente Supervisor de pantallas

`/supervisor` usa la cámara del navegador para observar cartelería digital sin
capturar audio. El navegador reduce cada fotograma a JPEG y lo envía a
`POST /supervisor/analyze`; el Worker lo analiza con Workers AI y descarta el
binario al terminar. D1 conserva únicamente estado, métricas, resúmenes y las
referencias de ticket: no almacena fotografías.

## Contrato

La ruta está protegida por la sesión Google de Yokup. Cada petición incluye:

- `observation_id`: UUID o identificador único, usado como clave idempotente.
- `captured_at`: epoch en milisegundos, con tolerancia de diez minutos.
- `project_id`, `station_id`, `label`, `location`, `expected_screens`.
- `canonical_screen` opcional: identificador real del player Admira. Si existe,
  el ticket reutiliza ese recurso y se deduplica con proof-of-play.
- `image`: data URI JPEG/PNG/WebP, limitada a 3,5 MB.
- `metrics.luminance` y `metrics.dark_ratio`, calculadas localmente.

Dos lecturas críticas consecutivas con confianza mínima de 0,82 confirman una
incidencia. Una escena oscura, una pantalla no visible o una predicción dudosa
se reportan como advertencia, pero no abren un ticket. Un solo fotograma nunca
se clasifica como contenido congelado.

La respuesta entrega `speech` sólo después de que el ticket ya existe. Su
`once_key`, reclamado de forma única en D1 por ticket y tipo de incidencia,
permite que el cliente pronuncie el aviso como máximo una vez incluso si llegan
dos observaciones concurrentes. Una
recuperación añade al ticket el evento «pendiente de verificación humana»; no lo
cierra automáticamente.

## Identidad de la emisión y mando

El análisis extrae de cada objetivo una huella visual acotada: texto legible,
descripción del contenido y colores dominantes. Este paso es ciego al catálogo:
el modelo no recibe títulos, proyectos ni IDs de player y cualquier intento de
devolverlos se descarta. En paralelo, el Worker consulta el MCP público de Admira
en modo estrictamente de lectura:

1. `circuits` descubre los proyectos/canales accesibles.
2. `circuit_screens` acredita a qué proyecto pertenece cada player; la ubicación
   o el parecido del identificador nunca se usan para inferirlo.
3. `on_air` aporta el contenido en antena y `player_status` confirma señal
   reciente, software y capacidad de mando.

La imagen no se envía al MCP. La correlación se hace después en código y sólo el
OCR cuenta como evidencia de identidad; descripciones semánticas, colores,
confianza o candidatos sugeridos por el modelo nunca eligen un player. Todos los
títulos conocidos compiten, incluidos players sin proyecto o con señal antigua,
para impedir una falsa unicidad. Un player sin proyecto jamás puede resultar
`matched`.

Sólo se publica una identidad cuando queda un ganador textual inequívoco, con
proyecto único, señal reciente y confianza calculada por el servidor de al menos
0,80. Contenido compartido, empate, catálogo parcial, telemetría contradictoria,
caída del MCP o falta de OCR distintivo producen `ambiguous`, `unmatched` o
`unavailable`, sin inventar una identidad. Un player sin proyecto que no tiene
pieza en ninguna de las dos lecturas MCP y figura `offline` no bloquea la
correlación por el mero hecho de conservar un latido reciente.

Una coincidencia `matched` devuelve proyecto, player, contenido y evidencias. Si
Admira confirma además `remote_commands`, el Worker construye localmente el único
enlace permitido:
`https://admira.tv/remotecontrol/?screen=<player>&solo=1`. El navegador vuelve a
validar host, ruta, parámetros y player antes de mostrarlo bajo la pantalla. El
Supervisor no ejecuta comandos remotos por sí mismo.

## Operación

Las tablas se crean de forma idempotente desde `applySchema`. No se debe ejecutar
`wrangler d1 migrations apply` hasta reconciliar el ledger histórico 0005–0010.
El MVP usa los bindings existentes `DB` y `AI`; no necesita Durable Objects ni
guardar fotogramas en el R2 público. La consulta MCP usa HTTPS saliente y falla
cerrada: una indisponibilidad de Admira no interrumpe el diagnóstico visual, pero
sí impide atribuir player o mostrar su mando.

La vigilancia de navegador requiere que la pestaña y la sesión Yokup sigan
activas. Una futura instalación desatendida debe usar una credencial de monitor
limitada y renovable, no ampliar la duración de la sesión humana.
