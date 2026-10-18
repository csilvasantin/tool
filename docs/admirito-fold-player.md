# Selector de playlist del Fold / Fold playlist selector

## Español

En Admirito Android → Cuenta y escuchas → Modo Experto → Player en este Fold, selecciona proyecto, local y dispositivo IoT. «Reproducir en este Fold» comprueba la playlist asignada y abre el renderer canónico de Admira.tv. También puedes ejecutar `/player PROYECTO LOCAL ID_IOT` en el campo de Experto o en la conversación local. `/player` sin argumentos abre el selector.

El contrato coincide con el [iPhone](admirito-iphone-player.md): proyectos declarados en `project_id` o `projects[]`, y el prefijo exacto `alsea-sbux-` para Starbucks; sin inferir asociaciones por nombres. Se resuelve `idIoT` al primer origen `player`, `instance` o `screen` válido. Los locales sin IoT no permiten iniciar reproducción. Una playlist vacía o con medios no reproducibles muestra un error; no se sustituye por Stock general. Ante un fallo posterior de consulta, conserva la última playlist confirmada.

El Fold conserva una identidad virtual propia para sus controles, circuito y telemetría. El dispositivo de origen no recibe órdenes ni cambia su reproducción. La selección pública no concede acceso a `/proyecto` ni a inventarios privados. El renderer se muestra solo cuando confirma la playlist asignada. Vídeo inicialmente silenciado; no se acredita audio audible.

«Volver a Admirito» libera el WebView. Al salir de la app, se pausa; al regresar, «Reanudar en este Fold» requiere una pulsación explícita. El reconocimiento por voz queda suspendido mientras el selector/player está abierto.

El botón separado «Player Lab · Bugito y Supervisor» conserva la identidad fija `virtual-lab-admirito-fold`, su fuente aprobada y el circuito de incidencias existente. Ese banco de pruebas no se traslada automáticamente al IoT que selecciones. Se explicita también su circuito para que el almacenamiento web compartido no herede la identidad del selector.

## English

Admirito Android → Account/listening → Expert → Player on this Fold selects an explicit project, location and IoT. The native Expert field also accepts `/player PROJECT LOCATION IOT_ID`. Catalogue membership and source preference match iPhone. Playback uses the canonical Admira.tv renderer with an independent virtual identity and leaves the source device unchanged. Empty/unsafe assignments fail visibly; there is no general Stock fallback. Playback starts muted. Closing releases the renderer; backgrounding pauses and returning requires explicit Resume. The separate fixed Lab player for Bugito/Supervisor remains available.

## Release and verification

Android 20261018.6, versionCode9. Signed update preserves the existing pairing and signing key. iPhone retains its installed20261018.5; shared source release metadata advances for the next build.

Build and release lint passed. Three on-device instrumentation contract tests passed (commands, catalogue association and unplayable assignments). On the physical Fold, Expert → project starbucks → Starbucks Paseo de Gracia → iPad horizontal played the assigned video. Native time advanced through 7, 9 and 10 seconds, with a real [phone capture](evidence/admirito-fold-selector-2026-10-18/fold-player.png). Backgrounding displayed the paused state; explicit Resume returned to advancing playback. Playback is muted. Public APK, build and installed APK hashes match.
