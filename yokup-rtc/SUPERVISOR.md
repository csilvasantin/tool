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

## Operación

Las tablas se crean de forma idempotente desde `applySchema`. No se debe ejecutar
`wrangler d1 migrations apply` hasta reconciliar el ledger histórico 0005–0010.
El MVP usa los bindings existentes `DB` y `AI`; no necesita Durable Objects ni
guardar fotogramas en el R2 público.

La vigilancia de navegador requiere que la pestaña y la sesión Yokup sigan
activas. Una futura instalación desatendida debe usar una credencial de monitor
limitada y renovable, no ampliar la duración de la sesión humana.
