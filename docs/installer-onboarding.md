# Alta de instaladores / Installer signup

## ES

Ruta: `/instalador?alta=1#onboarding`.

1. **Cuenta:** Google o nombre, correo y contraseña de al menos 12 caracteres.
2. **Zona:** país y búsqueda explícita de ciudad, o ubicación del dispositivo. El punto puede ajustarse en el mapa; el radio se elige entre 1 y 200 km. No se piden coordenadas al usuario.
3. **Especialidades:** selección múltiple y disponibilidad. La cuenta solo se crea al confirmar el último paso.

Se mantienen los endpoints de registro, acceso, Google y edición existentes. Atrás y el cambio de idioma conservan los datos durante la visita. Un error no muestra éxito ni vacía el formulario. Cambiar una ciudad elegida o el país invalida su punto anterior. No se guardan contraseñas ni borradores en almacenamiento local. Se conserva el radio, `notify_zone` y `demo` al editar un perfil existente.

La búsqueda usa `/api/installer-location`, que consulta Photon sobre datos OpenStreetMap con peticiones explícitas, límite de resultados y timeout. Se cachean búsquedas de ciudades; las consultas de ubicación precisa no se cachean. Referencia: https://github.com/komoot/photon/blob/master/docs/api-v1.md. Si el servicio falla, se ofrecen ubicación y mapa. Si el navegador deniega ubicación, sigue disponible la búsqueda de ciudad. La selección de zona no exige permiso de geolocalización.

El alta y los avisos automáticos son estados distintos: la disponibilidad real de avisos procede de `/health`. No se anuncia activación de producción por completar un perfil.

Validación realizada: guardado, recarga con sesión y edición contra el backend real con SQLite aislado; errores de guardado y correo duplicado; validación por paso; retorno sin pérdida de datos; bloqueo de doble envío; búsqueda de ciudad real; permiso de ubicación denegado; ciudad sin resultados y servicio caído; ES/EN; vistas de 375, 390, 768 y 1440 px. El adaptador Google se prueba con callback aislado y sus pruebas existentes de servidor; no se crea ninguna cuenta Google real de prueba.

## EN

The same URL opens a three-step flow: **account → work area → specialties**. Google and email sign-in retain their existing server contracts. City search or device location selects a map point; a 1–200 km radius sets the preferred work area. Coordinates are not requested from the user.

Back navigation and language changes preserve entered values during the visit. Only the final confirmation writes the profile. Save failures retain the form; duplicate email returns to the account step. Changing a selected city or country invalidates stale coordinates. Editing preserves existing radius and notification/demo preferences. Passwords and drafts are never persisted locally.

Photon city searches are deliberate and bounded; precise reverse lookups are not cached. The flow keeps map/location alternatives for failed searches and city search for denied location permission. Automatic job alerts remain separately governed by actual server health.

QA covers isolated backend persistence, session restoration, editing, validation, error recovery, duplicate submission prevention, Google callback integration, real city lookup, responsive layouts, and ES/EN. Public verification does not create production test accounts.
