# Versionado móvil compartido

Fuente única: `mobile-release.json`. Versión visible: `AAAAMMDD.revisión`, con fecha Europe/Madrid. Ejemplo: 20261017.1, 20261017.2; al cambiar el día, 20261018.1. No se reinicia ni se reduce el contador interno de instalación de iOS/Android.

Antes de preparar una nueva actualización publicable ejecuta **una vez** `python3 scripts/mobile-release.py` y regenera Xcode. Recompilar, probar o reintentar una instalación de la misma actualización no incrementa otra revisión. Gradle lee la fuente común; la versión de Swift la genera el script. Confirma la versión visible y los metadatos del binario, publica manifiesto SHA y conserva las descargas anteriores.

Both apps share one date and revision. Advance once per new published update; retries keep the same version. Native installation counters remain monotonic.
