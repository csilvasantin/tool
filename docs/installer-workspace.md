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
