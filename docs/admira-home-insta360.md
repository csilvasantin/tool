# Entrada DMZ y visor Insta360 · 18 octubre 2026

La portada de admira.app coloca Entrar junto al idioma. Lleva a `/conversar`, protegido por la verja Google y autorización vigente del servidor (`acceso.js`). Avanzado y Experto pertenecen a la zona autenticada; se conservan cerrados inicialmente. No se introduce almacenamiento de privilegios en el navegador. El cambio de la portada se limita a admira.app; otros dominios mantienen su cabecera.

Admirito iOS y Android incluyen **Insta360 · ver el Lab**. Es una vista remota mediante imágenes JPEG actualizadas cada tres segundos, no vídeo continuo ni control de movimiento. Solo consulta mientras el visor está abierto y la aplicación está activa. Ante fallo retira la imagen anterior para no presentarla como reciente. Cerrar detiene nuevas peticiones. Android cierra el visor al pasar a segundo plano.

`GET /agents/lab-camera/frame` valida la sesión de la cuenta de Carlos y el alcance de dispositivos Admirito iOS/Android. La entrada oficial del operador permite comprobaciones. Otras cuentas, etiquetas de dispositivo y orígenes se rechazan antes de consultar la cámara. No hay enlaces públicos a fotografías del Lab.

El servidor utiliza el secreto `LAB_INSTA360_FRAME_URL`: destino fijo al servicio de cámara existente del Mac Mini, mediante su conexión remota. No admite URL elegida por el cliente, redirecciones ni rutas arbitrarias. Solo devuelve bytes JPEG, sin cookies ni cabeceras del servidor de cámara y sin caché. No entrega la clave privada al teléfono. La cámara sigue teniendo un único capturador go2rtc; el visor no cambia PTZ, presets ni el bucle Supervisor.

Configuración y recuperación: bóveda `ADMIRANEXT_LAB_INSTA360_VIEWER`. El secreto del Worker se conserva en los despliegues. Para revocar el acceso de un móvil se revoca su dispositivo en admira.app; para retirar el servicio completo se elimina el secreto del Worker. No publicar el contenido de la entrada ni del secreto.

## English

The public admira.app home shows Sign in beside the language selector. It opens the existing authenticated DMZ conversation workspace. Advanced and Expert remain in the authenticated workspace. Both mobile apps provide a private read-only Insta360 viewer, refreshed with JPEG snapshots every three seconds while visible and active. This is not continuous video. The existing Mac camera producer remains the only capture source; private camera credentials stay server-side and in the vault. The API enforces account/device scope and returns no-cache JPEG bytes only.

## Comprobaciones de publicación

Portada: Entrar/Sign in visible y adyacente al idioma en 390 y 1440 píxeles; sin controles Avanzado/Experto en la barra pública. Sin sesión, /conversar muestra la verja; sesión oficial autorizada mantiene admira.app y muestra ambos controles cerrados. Cámara: el runtime workerd real devuelve JPEG200 al reutilizar el origen existente. Se usa `redirect: manual` y se rechaza cualquier redirección; `redirect: error` no está implementado en este runtime. Pruebas API: cuatro casos de autorización, alcance, imagen y redirección.

La prueba previa de asignación de establecimientos presentó una colisión intermitente entre identificadores de fixtures creados en el mismo milisegundo. Se separan los instantes del reloj de ese arnés, sin cambiar identificadores ni datos de producción. La validación de asignación de proyecto ya no depende del azar de identificadores.


## Aceptación física y versión final

Versión móvil 20261018.3: instalada en iPhone y Fold por sus canales de desarrollo autorizados. iPhone: prueba nativa real abre, recibe imagen y cierra; captura completa del dispositivo revisada. Fold: Google identifica la cuenta de Carlos; el formulario real aprueba el dispositivo; al volver a la actividad existente se completa la vinculación y el visor nativo muestra imagen actualizada. Se deja abierto por petición de Carlos, en lugar de restaurar el player. Las imágenes completas del Lab permanecen privadas; se publican solo observaciones saneadas.

Se corrige el fallo observado durante la vinculación Android: al abrir el navegador se pausa la consulta y se retoma al volver a Admirito. Los fallos transitorios mantienen el código dentro de su plazo; los intentos nuevos invalidan callbacks anteriores. Los códigos se borran al completar/caducar. El resultado de vinculación y sus errores se muestran sin voz; la recuperación automática de peticiones tampoco habla. La lectura de retorno de sesión contempla múltiples cabeceras de cookie y valida que la credencial se haya guardado antes de anunciar vinculación. El cliente se identifica en sus peticiones al API. No se extraen credenciales del navegador.

API publicada: v.18.10.2026.r4.09:58. Web final v.18.10.2026.r4.10:31, sello limpio. La descarga pública Android 20261018.3 coincide por SHA256 con el APK instalado y comprobado en el Fold. Pruebas web: 1674 correctas; visor API: cuatro casos específicos. Android: compilación y lint correctos; firma de actualización conservada. Evidencias: [comprobaciones saneadas](evidence/insta360-mobile-2026-10-18).

Pendientes conservados: techo RGB compatible y ciclo completo de nueva incidencia/foto/recuperación. En Fold, la barra inferior del sistema puede solaparse con el texto auxiliar del visor; la imagen y los controles principales se ven. No se modificó la cámara ni su posición durante el acceso remoto.

English: Android pairing polling pauses while the browser is in front and resumes when the existing native activity returns. Temporary network failures preserve the live code until expiry. Pairing status and automatic recovery failures are silent; completed/expired codes disappear. Carlos's real browser session approved the native device and the Android viewer received refreshed camera frames. The tested APK matches the installed package. The Fold viewer remains open at Carlos's request. The iPhone functional test passed on 20261018.2; 20261018.3 only advances its shared release stamp and is installed.
