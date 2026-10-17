# Incidencia real iPhone → Supervisor · 17 octubre 2026

[INC-VK966H · popup en Fold](https://www.admira.app/ticket?id=INC-VK966H): abierta con foto de la cámara trasera del iPhone a las 22:54; recuperada y cerrada con dos imágenes de la Insta360 a las 22:55 y 22:56. Estado canónico `resolved`, confirmado también en Chrome autenticado. Historial conserva las fotos inicial y de recuperación.

El botón de verificación entregó una petición real al canal Supervisor; el iPhone recibió su respuesta canónica. Prueba de versión visible iPhone 20261017.1 correcta. Android firmado 20261017.1 / código 3 instalado por USB. La foto inicial muestra el popup real sobre el contenido del Fold; no es una captura prestada de la Insta360. Las capturas posteriores se revisaron por el operador Oráculo: no se trata de un detector óptico autónomo. No se verificó el audio. No se movieron ventanas ni se inició otra vigilancia.

Six backend tests cover scope, ownership, idempotency after recovery, fresh telemetry/photos, two distinct observations, and relapse reset. Native physical UI tests verify the photo submission, restoration and Supervisor reply. Mobile versions share the date and revision in `mobile-release.json`.
