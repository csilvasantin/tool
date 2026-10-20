# Revisión aislada de comercio y mantenimiento — 20/10/2026

Sin despliegues ni escrituras en producción. Datos sintéticos nuevos en el servidor privado existente; preservadas las cuentas y fotos del recorrido del usuario.

## Resultado

- Alta móvil HTTPS, guardado de establecimiento y persistencia después de recargar: correctos; sin errores JavaScript. Bloqueadas 12 peticiones externas durante la prueba de navegador.
- Publicación en mapas: rechazada por el puente de prueba (404).
- Otro comercio no puede consultar la ficha ni crear un equipo en el establecimiento ajeno (404).
- Instalador ajeno no puede cerrar ni leer fotos privadas. Lectura sin sesión: 401.
- Fotos ausentes o corruptas impiden el cierre y no cambian el mantenimiento.
- Reenvío de la misma imagen devuelve el mismo identificador; lectura privada conserva los bytes.
- Mantenimiento explícito: aceptación, avance, foto persistida y cierre contra workerd/D1/R2 locales. Último mantenimiento 2026-10-20, siguiente 2027-01-18 con 90 días; aviso pendiente false.
- Reintento de cierre resuelto: 409; un único registro de mantenimiento. Avería normal no cambia la fecha.
- Fallo inducido al actualizar la fecha: la transacción revierte y conserva el estado assigned.

## Corrección de revisión

Un mantenimiento debe aportar evidence_ids verificados. Se ha bloqueado el cierre alternativo por URL, aunque ya hubiera una fila de foto asociada. No se infiere mantenimiento del título.

## Validación

- API: 187 correctas, 0 fallidas, 1 omitida (fixture externo de planos clearchannel-tv).
- Web: 1680 correctas, 0 fallidas.
- Logs locales: /tmp/retailer-phone-qa/final-api-suite.log, final-site-suite.log, final-mobile-signup.log y final-maintenance.log.
- La cámara física y las dos imágenes fueron confirmadas por Carlos en su recorrido anterior; esta revisión automática utiliza imagen sintética.

## Antes de publicar

Aplicar la migración 0026_maintenance_completion.sql en el despliegue autorizado, antes de activar la API que usa purpose, y publicar después el selector del formulario. Esta revisión no aplica la migración ni publica código en producción. Intervenciones antiguas conservan repair; no se reclasifican ni se actualizan fechas retroactivamente.
