# Ubicaciones del comercio en los mapas

Misión #305 · DCL-ae524c500bf6193c614a6237 · 14 septiembre 2026.

La confirmación «Importar y publicar en mapas» guarda las ubicaciones privadas y su proyección pública en una única transacción D1. No existe una cola remota que pueda confirmar una importación sin haber registrado sus puntos. Los fallos revierten el lote completo y permiten reintentar con la misma clave. Las importaciones antiguas y las altas manuales conservan su privacidad hasta que el titular pulsa «Publicar en mapas» o vuelve a importar el archivo con publicación explícita.

La proyección `admira_retailer_locations` contiene un ID estable `yokup-<site_id>` y un JSON público: nombre, tipo, dirección, ciudad, país, coordenadas `[longitud,latitud]`, procedencia y lista vacía de soportes. No incluye titular, email, referencias privadas, incidencias, dispositivos, precios ni inventario publicitario supuesto. Los datos expuestos se describen antes de confirmar.

El Worker `omnipublicity-api` (dominio `brain.digitalavatar.ai`) añade esta proyección al catálogo legado de KV mediante su binding `RETAILER_CATALOG` a `yokup-db`. El código solo lee la tabla pública y vuelve a aplicar una lista de campos permitidos; el binding D1 no es una credencial de solo lectura a nivel de base de datos. No se utiliza el PUT que sustituye todo el catálogo legado. Los IDs reservados Yokup prevalecen si colisionan con datos antiguos.

Lecturas públicas del catálogo: `GET /locations`, `GET /locations?view=summary`, `GET /locations?slim=1`, `GET /locations/:id` y la vista ligera `GET /locations?source=yokup`. Esta última responde sin caché, incluye `mapCatalogConfigured` y evita descargar el catálogo legado completo. Ninguna de estas lecturas da permiso de escritura.

admira.app y clearchannel.tv comparten el proyecto Cloudflare Pages `clearchannel-tv`. Su aplicación carga la vista ligera al abrir el mapa y cada 60 segundos mientras está visible. Un enlace `/?locationId=yokup-<site_id>` recupera además el detalle si el punto aún no está cargado, centra el mapa y abre su ficha. Una caída de red conserva los puntos ya cargados; al recuperar conexión se reintenta en el siguiente intervalo. Un mapa ya abierto puede tardar hasta un minuto en mostrar una nueva importación.

Yokup lista los establecimientos con búsqueda y páginas de 20, estado de publicación y enlaces a ambos mapas. «Publicado» acredita el registro persistido en el catálogo compartido; no acredita que el dispositivo de un visitante haya descargado el mapa ni que exista monitorización IoT. La sincronización de circuitos de `admira-circuit-sync.js` (incorporada desde main) se mantiene operativa en paralelo, con su propio estado y reintentos; la conexión de equipos continúa separada.

Orden de despliegue: aplicar migración 0006 en yokup-db; desplegar omnipublicity-api con el nuevo binding; desplegar API de Yokup; publicar clearchannel-tv y Yokup por sus scripts oficiales. No desplegar el repositorio admira-app, que está deprecado. No crear ubicaciones ficticias en producción. Validación local: transacción y rollback, aislamiento por titular, repetición idempotente, publicación de altas antiguas, catálogo sin datos privados, deduplicación del mapa, enlace directo y conservación ante fallos de red.
