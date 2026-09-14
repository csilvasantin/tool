# Alta de ubicaciones desde Excel

Misión Yokup #301 · DCL-56308f2ae49a4f93b9cf305a. 14 septiembre 2026.

En `/retailer`, tras crear la cuenta o entrar, «Importar Excel» aparece junto al selector de establecimientos. Descarga una plantilla `.xlsx` con una hoja vacía de ubicaciones y otra de instrucciones. Admite `.xlsx` y `.xls`, hasta 5 MB, 500 establecimientos por archivo y 32 hojas. Permite elegir hoja, revisar filas, corregir el archivo y confirmar. Para más ubicaciones se pueden importar varios archivos.

Plantilla directa: `https://www.yokup.com/templates/ubicaciones-retailer.xlsx`.

Columnas: `codigo` (opcional, referencia propia), `nombre`, `tipo`, `pais` (dos letras), `ciudad`, `direccion`, `latitud`, `longitud`. Se admiten también sus nombres ingleses. Tipos: estanco, kiosco, supermercado, hostelería u otro. Coordenadas obligatorias, con punto o coma decimal. No se geocodifica automáticamente una dirección ni se sustituyen coordenadas vacías por cero. Las cabeceras comienzan en A1. Las fórmulas se rechazan; pegar sus valores antes de importar.

El archivo se procesa en un Web Worker local al navegador, con un límite de lectura de 15 segundos. Solo se envían las filas al backend propio; no se guarda el binario original ni se envía a servicios de terceros. Se usa SheetJS CE 0.20.3, copia local obtenida del [CDN oficial](https://docs.sheetjs.com/docs/getting-started/installation/standalone/); licencia en `yokup-site/vendor/SHEETJS-LICENSE.txt`.

## Persistencia y duplicados

La API vuelve a validar el contenido y la cuenta. La vista previa no escribe. Si hay una fila incorrecta, no se importa ninguna. El lote se guarda en una sola transacción: establecimientos, referencias de importación y recibo. Un fallo revierte las tres partes. Repetir el mismo `request_key` y cuerpo recupera el resultado; reutilizarlo con otros datos da 409.

Deduplicación dentro del archivo y contra los establecimientos del titular: país, ciudad, dirección y nombre normalizados; además el código propio debe identificar una sola ubicación. Si existen datos distintos, se pide corregir y no se sobrescriben. Las coordenadas forman parte de la comparación del contenido. No se fusionan cuentas ni se toma el código propio como ID de Admira. El lote conserva el nombre de archivo y los recuentos. El historial muestra las últimas 20 importaciones y cuántas altas ha confirmado Admira.

## API de comercio

Sesión de retailer y origen autorizado. Base `/api/retailer`.

- `POST /sites/import-preview`: `{rows:[{external_ref,name,kind,country,city,address,latitude,longitude,source_row?}]}`. Devuelve filas y resumen de nuevas, duplicadas y errores.
- `POST /sites/import`: mismo `rows`, más `request_key` (8–100 caracteres) y `filename` (máximo 160). Sin errores, guarda todo y devuelve el recibo. 422 conserva los errores por fila; 409 indica conflicto; 401 exige autenticación.
- `GET /site-imports`: historial del titular con recuentos de sincronización.

Máximo 512 KiB de JSON y 30 solicitudes de previsualización/importación por hora y cuenta. Cada sentencia de inserción agrupa ocho ubicaciones para respetar el límite de parámetros de D1. El importador no crea dispositivos ni activa su monitorización.

## Alta real en Admira: contrato preparado, conexión pendiente

Guardar en Yokup no prueba que exista un alta en admira.app. Las ubicaciones importadas quedan `pending` en `retailer_site_import_items`. Solo el servicio central autenticado puede confirmar el ID real asignado. No hay productor de Admira configurado en esta entrega.

Se reutiliza la autenticación HMAC de `docs/retailer-portal.md`, con `ADMIRA_CIRCUIT_SECRET`, timestamp y firma del método, ruta y cuerpo exactos. Este secreto pertenece exclusivamente al backend central y nunca se entrega al navegador ni a los comercios.

1. `POST /api/circuit/site-imports`, cuerpo `{circuit_id,retailer_id,after?}`: devuelve hasta 100 ubicaciones pendientes del titular y `next_after` para paginar. El servicio central debe comprobar que el comercio está autorizado a dar de alta ubicaciones en ese circuito. No se deriva esa autorización de un Excel.
2. El adaptador real crea o recupera la ubicación en el inventario de Admira usando el UUID Yokup como clave externa idempotente. Persiste el ID resultante antes de confirmar. Si el alta real falla, reintenta y mantiene el registro pendiente; el adaptador y su política de reintentos todavía deben implementarse sobre la API real.
3. Solo tras comprobar el alta: `POST /api/circuit/site-imports/confirm`, cuerpo `{circuit_id,retailer_id,yokup_site_id,admira_store_id}`. Cambia a `synced`. Repetir la misma confirmación es seguro; otro circuito/ID o un ID ya ligado a otra ubicación da 409. Un titular incorrecto da 404.

Este enlace es de establecimiento. Los equipos se enlazan después mediante el contrato existente `/api/circuit/link`; no se inventan dispositivos ni se transmite control IoT desde la importación. Los MCP actuales conservan sus herramientas; esta entrega no añade una herramienta masiva MCP ni OAuth.

## Despliegue y pruebas

Aplicar una vez `api/migrations/0004_retailer_site_imports.sql` sobre D1, antes del Worker y el frontend. Es una migración aditiva. No modifica registros existentes. Desplegar el frontend mediante el script oficial del proyecto.

Pruebas: `node --test api/*.test.mjs` y `node --test yokup-site/retailer-import.test.mjs`, además de las suites de publicación. Casos específicos: 500 filas, aislamiento de cuentas, duplicados, conflictos de código, validación, transacción fallida y reintento, recibos centrales firmados e inmutables, lectura real XLS/XLSX, fórmulas, elección de hoja, códigos con ceros y números de fila originales. Verificación del formulario en navegador con SQLite local y datos de prueba, nunca sobre comercios reales.
