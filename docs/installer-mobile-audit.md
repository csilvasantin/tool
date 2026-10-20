# Auditoría móvil del instalador / Installer mobile audit

## ES · 20-oct-2026 · SubOraculo

El recorrido comienza en la portada pública y su CTA, continúa con cuenta → zona → especialidades, bienvenida/panel, ficha, aceptar → avance → fotos → cierre. El frontend se comprueba con los assets locales y después con los publicados; todas las escrituras se redirigen al Worker real en workerd con D1 y R2 privados en un directorio temporal. Ningún alta, intervención ni foto de prueba se crea en producción.

Correcciones:

- Atrás/Adelante del navegador recorren el alta y los diálogos dentro de la misma página, conservando los borradores en memoria. Una escritura en curso mantiene su pantalla hasta tener resultado. El historial guarda identificadores de vista; nunca contraseñas, coordenadas, notas ni imágenes. Tras salir/caducar la sesión, el historial no vuelve a abrir un espacio privado.
- La comprobación inicial de sesión tiene carga, error y reintento explícitos. El alta permanece oculta desde el HTML inicial hasta conocer si hay una sesión, evitando competir con una lectura inicial lenta. Un fallo de conexión no equivale a una sesión inválida.
- La validación del nombre/ciudad/contraseña considera la longitud tras recortar espacios, igual que el contrato del servidor, antes de avanzar. El formulario declara POST como respaldo y no envía contraseñas en una URL si falla JavaScript.
- Los archivos de cámara/galería sin indicación MIME pueden pasar al decodificador. Los archivos vacíos, no admitidos, corruptos o demasiado grandes siguen rechazándose; el servidor conserva sus límites y validación del formato real.
- Si se pierde la respuesta del cierre, solo una lectura nueva, autenticada y con propiedad puede confirmar que el estado real ya es `resolved`. Un fallo de subida o una comprobación fallida conservan el formulario y nunca se convierten en un cierre exitoso.

Prueba completa reproducible (dependencias como en `installer-workspace.md`):

```sh
QA_JOURNEY=1 QA_NODE_MODULES=/ruta/node_modules node scripts/qa-installer-mobile-server.mjs
PLAYWRIGHT_MODULE=/ruta/node_modules/playwright node scripts/qa-installer-journey.cjs
# Servidor nuevo para repetir con el frontend público:
LIVE_ASSETS=1 PLAYWRIGHT_MODULE=/ruta/node_modules/playwright node scripts/qa-installer-journey.cjs
```

El modo `QA_JOURNEY` comienza sin sesión del instalador: el propio recorrido crea la cuenta mediante `/register`, guarda la cookie real y la restaura tras recargar. Usa fixtures sintéticos de comercio/equipo y ciudad en aislamiento. El geocodificador público se comprueba por separado con una búsqueda de ciudad, sin ubicación precisa. Los casos Google usan un callback SDK aislado y las pruebas de backend; no se inicia una cuenta Google humana de prueba.

Se verifican ES/EN y 375/390/768 px en portada, cuenta, zona, especialidades, panel y ficha; cierre móvil, validaciones, búsqueda vacía/fallida y ubicación denegada, Atrás/Adelante, perfil/cancelación, sesión lenta/error/reintento/caducidad, avances conservados, imagen corrupta, archivo sin MIME, ambas entradas cámara/galería, previsualización fallida y recuperada, error de subida/cierre, respuesta perdida, deduplicación y fotos conservadas tras recargar. El servidor de QA permanece solo en loopback, sin credenciales productivas. La prueba comprueba HttpOnly/Secure/SameSite de la cookie y ausencia de contraseña en almacenamiento e historial.

Límites: headless no comprueba cámara física, permisos nativos, selector real de galería ni comportamiento particular de Safari/iOS. Los borradores aún no enviados permanecen solo en memoria y se pierden al cerrar/recargar; las fotos ya guardadas se recuperan del servidor. La recepción de Telegram no demuestra lectura humana. Los avisos automáticos siguen el estado real de `/health`.

## EN

The full journey starts at the public home CTA and uses the actual account, area, skills, workspace and incident UI. All writes go to an isolated workerd Worker with persistent local D1/private R2. QA creates a real isolated account, uses its actual HttpOnly/Secure/SameSite cookie, and verifies restoration after reload. Production receives no test accounts, jobs or photos.

Browser Back/Forward now traverses wizard steps and dialogs while retaining in-memory drafts and guarding in-flight writes. Initial session loading has a distinct error/retry state. Whitespace validation matches the server. Missing image MIME hints no longer prevent decoding, while corrupt/empty/oversized images remain rejected. Lost closure responses require a fresh owner-authorized server read before reporting a resolved job.

The reproducible journey checks ES/EN at 375/390/768 px, validation and location errors, session recovery/expiry, draft retention, both camera/gallery file inputs, private persisted photos, upload/preview/closure failures, lost responses, deduplication and reload. Headless file fixtures do not prove a physical camera, a native photo picker or Safari/iOS behavior. Google callback tests are isolated, not a human OAuth session. Unsubmitted drafts do not survive page reload; uploaded photos do.

Comprobaciones de regresión: 1.680 pruebas del sitio; 186 de API pasan y una se omite por un fixture ajeno al instalador. También pasan el E2E previo de intervención y los casos de alta/Google con callback aislado. La nueva prueba de recorrido único exige terminar sin errores de JavaScript ni comprobaciones fallidas.

## Recuperación automática de cierre · 20-oct-2026

Si se pierde la respuesta de `/resolve` y tampoco puede verificarse el estado, el cliente conserva texto y fotos y marca el cierre como no confirmado. Consulta el estado autenticado cada tres segundos y al recibir `online` o volver a la pestaña; nunca reenvía fotos ni el cierre automáticamente. Solo un estado `resolved` del servidor, con propiedad y la misma sesión, actualiza la bandeja y muestra la ficha Resuelta. Si el servidor confirma que sigue en curso, conserva el formulario para reintentar manualmente. Salir o caducar la sesión cancela el seguimiento. Los borradores siguen siendo del documento actual; recargar no conserva pendientes sin enviar.

La prueba ampliada corta la respuesta después de persistir el cierre y bloquea la consulta posterior. Comprueba que no aparece éxito falso, que al recuperar la conexión se abre la ficha Resuelta sin clics y que permanece una sola foto. También mantiene las pruebas de fallos de subida, sesión, navegación y persistencia.

EN: Uncertain closures use authenticated read-only reconciliation every three seconds and on online/visibility events. Only owner-confirmed resolved state updates the UI; recovery never automatically resubmits a closure or photo. Session changes cancel recovery. The isolated journey drops the committed closure response and blocks reconciliation, then verifies automatic resolved detail and a single persisted photo after connectivity returns.

### Sesión caducada durante la recuperación

`QA_EXPIRE_DURING_CLOSURE=1` ejecuta el mismo recorrido y caduca la sesión después de perder la respuesta de cierre, mientras la lectura de reconciliación sigue bloqueada. Al volver la conexión exige iniciar sesión, oculta los diálogos privados y cancela la recuperación de la sesión anterior. Tras entrar con la misma cuenta, la ficha del servidor conserva estado resuelto, solución y una foto (un solo objeto privado), sin repetir subidas. La variante pasa 100 comprobaciones sin errores de JavaScript en el entorno aislado.

EN: `QA_EXPIRE_DURING_CLOSURE=1` expires the session during uncertain-closure recovery. Reconnection requires sign-in and hides private dialogs. Signing back in restores the actual resolved job and its single persisted photo without another upload; 100 isolated checks pass.
