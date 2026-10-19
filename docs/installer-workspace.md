# Panel del instalador / Installer workspace

## ES

Ruta: `/instalador`, tras acceso o alta real. La bienvenida muestra el nombre guardado, ciudad/país, radio, especialidades y disponibilidad. La portada de registro se oculta al entrar. Integraciones avanzadas quedan plegadas.

- **Disponibles:** ofertas abiertas de la bandeja, todavía sin asignar al instalador.
- **En curso:** únicamente intervenciones asignadas al usuario.
- **Resueltas:** únicamente trabajos resueltos por el usuario.
- **Todas:** avisos recibidos, incluidos los asignados a otro profesional. Los contadores de pestaña corresponden a los avisos cargados; el servidor limita la lista a los 100 más recientes. Los indicadores de sin leer/en curso/resueltas proceden de las estadísticas del servidor.

Las acciones reutilizan los endpoints existentes: aceptar, marcar leído, registrar avance y cerrar con solución y evidencia HTTPS verificada por el servidor. Un avance se escribe en un diálogo, conserva el texto si falla y se comparte con el comercio. La dirección y el enlace de ruta se muestran solo en trabajos propios. La interfaz no inventa historial, trabajos, valoraciones, distancia ni éxito de una escritura.

Pausar/reactivar usa el perfil canónico guardado, conservando zona, especialidades, radio y preferencias de avisos/demo. Una respuesta fallida no cambia el estado mostrado. Los perfiles demo no activan trabajos reales. Los accesos rápidos a zona/especialidades permiten editar y volver al panel sin guardar. Cambiar idioma mientras se edita no sustituye el borrador por el perfil guardado.

Carga inicial, bandeja vacía y fallo de actualización son estados distintos. Antes de recibir datos se muestran guiones, no ceros. Si falla una actualización se conserva la última respuesta con su hora y se bloquean acciones sobre esa lista hasta actualizarla. Una escritura espera a cualquier lectura anterior y vuelve a consultar la bandeja antes de representar el resultado. Las acciones simultáneas del mismo trabajo se bloquean mientras se guardan. La disponibilidad de avisos automáticos sigue el estado real de `/health`.

QA: modelo de filtros y escritura de perfil; pruebas existentes de API y Desk; Chromium con backend real y SQLite aislado (ofertas, trabajos propios, histórico y avisos asignados a terceros). Se verifica aceptación → avance → cierre con evidencia, rechazo de evidencia inválida, errores sin pérdida de texto, disponibilidad persistida, privacidad, edición/cancelación, sin leer, estados inicial/error, refresco concurrente, teclado, ES/EN y 375/390/768/1440 px. Ninguna cuenta o intervención de prueba se crea en producción.

## EN

After sign-in or signup, the dashboard shows the saved profile, work area, specialties and availability. Jobs are separated into **Available**, **In progress**, **Resolved** and **All**. Owned work and history are filtered by server ownership; other professionals’ jobs stay outside the installer’s own work/history tabs. Private addresses and directions are shown only for owned work.

All changes use existing authenticated server endpoints. Availability updates preserve saved profile preferences. Job actions are confirmed by a fresh inbox response, including when another refresh was already running. Failed progress/closure forms retain their text. A stale inbox retains its last data and timestamp, with job mutations blocked until a successful refresh. Initial loading never appears as an empty inbox with zero jobs.

The dashboard supports profile editing/cancellation, keyboard tabs, ES/EN and mobile layouts. Automatic alert readiness remains separate from profile completion. Advanced integrations are collapsed by default. End-to-end QA uses the actual backend with isolated SQLite data, never production test accounts or jobs.

## Ficha móvil / Mobile intervention detail (2026-10-19)

ES: cada tarjeta abre **Ver intervención** con estado real, descripción, equipo, comercio vinculado (si existe), cita confirmada y actividad registrada. La API exige un aviso destinado al usuario; dirección/coordenadas, fotos e historial solo se devuelven al instalador propietario. No hay privilegios basados en el navegador. La aceptación cambia de pestaña después de confirmación del servidor. Una ficha sin actualizar bloquea sus acciones y permite reintentar.

El cierre ofrece **Tomar foto** (cámara trasera cuando el móvil admite `capture=environment`) o **Elegir de galería**, con vista previa, retirada antes de subir y hasta seis fotos. El navegador decodifica, reduce a 2000 px y convierte a JPEG, eliminando metadatos de la imagen original. La subida admite JPEG/PNG/WebP con firma binaria y hasta 8 MiB por archivo; el lector del servidor limita también cuerpos sin Content-Length. Los ficheros originales del dispositivo admiten hasta 30 MiB y 60 millones de píxeles antes de reducir. HEIC depende del decodificador del navegador: si no se puede convertir, se ofrece un error conservando los demás datos.

`POST /api/installer/incidents/:id/photos` guarda los bytes en el bucket privado `INSTALLER_EVIDENCE` y su asociación/huella SHA-256 en D1. Se comprueba la escritura leyendo R2 antes de confirmar. Los reintentos con la misma imagen y trabajo reutilizan su identificador. `GET /api/installer/evidence/:id` requiere sesión, asociación al instalador y propiedad actual del trabajo, sin caché pública. No se reutiliza el bucket público de las misiones. Las fotos quedan asociadas al trabajo tanto antes como después del cierre; los objetos no se publican por URL abierta ni se comparten con la base de conocimiento pública.

`POST /resolve` acepta `evidence_ids` de este trabajo; comprueba bytes, tamaño, formato y huella en R2 antes de la actualización condicional a `resolved`. La opción secundaria `evidence_url` conserva el contrato anterior de URL HTTPS viva. Una selección local, un fallo de subida o una respuesta perdida no cierran nada. Si la subida sí llegó y su respuesta se perdió, el reintento recupera las fotos del servidor y deduplica. Los borradores de solución/avance y las fotos seleccionadas se conservan en memoria durante errores, cancelación y reapertura del formulario en esa sesión; no se escriben en localStorage. **Recargar/cerrar la página pierde los borradores aún no subidos**; las fotos ya subidas se recuperan del servidor. Cerrar sesión elimina los borradores y previsualizaciones. La foto acredita el archivo aportado, no verifica por sí sola una reparación física.

EN: **View job** opens the actual incident, linked retailer/device, appointment and recorded activity. Only a notified installer can open it; location, photos and history require current server ownership. Acceptance and closure are confirmed by the server. Camera/gallery selection supports previews and six private photos, resized to JPEG with original image metadata removed. The API persists and reads back R2 bytes, records an incident/owner/hash association in D1, deduplicates retries and verifies every selected photo before closing. Private image reads require the current owner's session. Existing HTTPS evidence links remain a secondary option. Failed uploads, lost responses and failed closure retain selected photos and text in memory; uploaded photos survive reload. Unsubmitted text/local files do not survive page reload or sign-out. Camera capture hints depend on device/browser support; headless QA does not prove physical camera operation.

### Deploy / Publicación

Cuenta Cloudflare autenticada de gmail, misma que `yokup-rtc`. Migración aditiva, bucket separado sin dominio público y Worker antes que Pages:

```sh
cd api
npx wrangler@4.119.0 r2 bucket create yokup-installer-evidence # only once / solo una vez
npx wrangler@4.119.0 r2 bucket dev-url get yokup-installer-evidence
npx wrangler@4.119.0 r2 bucket domain list yokup-installer-evidence
npx wrangler@4.119.0 d1 execute yokup-db --remote --file migrations/0025_installer_evidence.sql
npx wrangler@4.119.0 deploy
cd ../yokup-site
YOKUP_DEPLOY_AGENT=OraculoMacMini YOKUP_DEPLOY_MACHINE=MacMini node deploy.mjs --admira-app-only
```

El deploy de Pages requiere commit publicado en origin/main y árbol limpio. No forzar bloqueos. El rollback del frontend/Worker puede dejar la tabla y bucket aditivos para preservar fotos. No borrar imágenes durante rollback.

QA: `node --test api/*.test.mjs` y `cd yokup-site && node --test *.test.mjs`. El recorrido headless usa el Worker real en workerd, D1 y R2 locales persistentes: aceptar → avance → foto guardada → cierre; fallo de escritura/subida/cierre, respuesta de subida perdida, deduplicación, borradores conservados al reabrir, privacidad de terceros, datos obsoletos, disponibilidad y ES/EN a 375/390/768/1440 px. Fixtures sintéticos solo en aislamiento; ninguna cuenta, incidencia ni foto privada de Carlos en producción.

Reproducir el E2E (Node con `node:sqlite`, Python 3, Chromium de Playwright; nunca cambia ventanas):

```sh
npm install --prefix /tmp/installer-mobile-deps --no-package-lock --no-save --no-audit --no-fund wrangler@4.119.0
QA_NODE_MODULES=/tmp/installer-mobile-deps/node_modules node scripts/qa-installer-mobile-server.mjs # terminal de QA; puerto local 8901
# En otra terminal, usando la instalación local de Playwright:
PLAYWRIGHT_MODULE=/ruta/a/node_modules/playwright node scripts/qa-installer-mobile.cjs
# Tras publicar, misma API aislada y assets públicos:
LIVE_ASSETS=1 PLAYWRIGHT_MODULE=/ruta/a/node_modules/playwright node scripts/qa-installer-mobile.cjs
```

Iniciar un servidor nuevo por cada ejecución del recorrido. El servidor anuncia el directorio temporal de D1/R2; conserva bytes en disco para verificar la persistencia. Detener el proceso de QA al terminar. Evidencia visual sintética: `/tmp/installer-mobile-photo-error.png` y `/tmp/installer-mobile-resolved.png`.

Después de detener el servidor, verificar el directorio de persistencia anunciado con `QA_NODE_MODULES=/tmp/installer-mobile-deps/node_modules node scripts/qa-installer-mobile-persistence.mjs /ruta/anunciada`. El verificador reabre D1/R2 en un proceso nuevo y compara bytes/tamaño y estado resuelto, sin llamadas de producción.
