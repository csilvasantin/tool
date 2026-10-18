# Entrada DMZ y visor Insta360 · 18 octubre 2026

La portada de admira.app coloca Entrar junto al idioma. Lleva a `/dashboard`, protegido por la verja Google y autorización vigente del servidor (`acceso.js`). Avanzado y Experto pertenecen a la zona autenticada; se conservan cerrados inicialmente. No se introduce almacenamiento de privilegios en el navegador. El cambio de la portada se limita a admira.app; otros dominios mantienen su cabecera.

Admirito iOS y Android incluyen **Insta360 · ver el Lab**. Es una vista remota mediante imágenes JPEG actualizadas cada tres segundos, no vídeo continuo ni control de movimiento. Solo consulta mientras el visor está abierto y la aplicación está activa. Ante fallo retira la imagen anterior para no presentarla como reciente. Cerrar detiene nuevas peticiones. Android cierra el visor al pasar a segundo plano.

`GET /agents/lab-camera/frame` valida la sesión de la cuenta de Carlos y el alcance de dispositivos Admirito iOS/Android. La entrada oficial del operador permite comprobaciones. Otras cuentas, etiquetas de dispositivo y orígenes se rechazan antes de consultar la cámara. No hay enlaces públicos a fotografías del Lab.

El servidor utiliza el secreto `LAB_INSTA360_FRAME_URL`: destino fijo al servicio de cámara existente del Mac Mini, mediante su conexión remota. No admite URL elegida por el cliente, redirecciones ni rutas arbitrarias. Solo devuelve bytes JPEG, sin cookies ni cabeceras del servidor de cámara y sin caché. No entrega la clave privada al teléfono. La cámara sigue teniendo un único capturador go2rtc; el visor no cambia PTZ, presets ni el bucle Supervisor.

Configuración y recuperación: bóveda `ADMIRANEXT_LAB_INSTA360_VIEWER`. El secreto del Worker se conserva en los despliegues. Para revocar el acceso de un móvil se revoca su dispositivo en admira.app; para retirar el servicio completo se elimina el secreto del Worker. No publicar el contenido de la entrada ni del secreto.

## English

The public admira.app home shows Sign in beside the language selector. It opens the existing authenticated DMZ dashboard. Advanced and Expert remain in the authenticated workspace. Both mobile apps provide a private read-only Insta360 viewer, refreshed with JPEG snapshots every three seconds while visible and active. This is not continuous video. The existing Mac camera producer remains the only capture source; private camera credentials stay server-side and in the vault. The API enforces account/device scope and returns no-cache JPEG bytes only.
