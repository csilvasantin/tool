# Admirito Android · versión inicial de pruebas

App nativa Android 8+ de admira.app. Entrada pública: https://www.admira.app/admirito. Misma cuenta y conversación del iPhone y la web; vinculación revocable de siete días. El secreto se cifra con Android Keystore, sin backups ni credenciales de flota en el APK.

Android 8+ native companion. Shared account and conversation with iPhone/web. Seven-day revocable pairing, Keystore encrypted credential, backups disabled, no fleet secrets in the app.

## Incluido / Included

- Las tres mascotas originales del iPhone y el mismo brillo de ojos. Selección con color, mirada al dedo, reposo grande, interfaz adaptable al plegado y orientación. / Shared mascots, highlighted selection, touch gaze, large idle view, fold/rotation responsive layout.
- Mantener pulsado, grabar nativamente, soltar, transcribir y respuesta hablada. / Native hold-to-talk recording, release to submit and spoken replies.
- Activación «Admirito» opcional mientras la app está visible mediante el reconocedor del sistema; puede usar el proveedor de voz configurado por el usuario. No se promete reconocimiento local ni activación en segundo plano. / Optional foreground wake phrase via system speech provider; not guaranteed on-device or background activation.
- Canales reales Bugito, Supervisor y consejeros, catálogo compartido de demos remotas, siguiente/anterior/parar/continuar. GET recupera peticiones pendientes; no se repite una acción incierta. / Real agent channels and shared remote demos, idempotent pending request recovery.
- Tours permitidos en el motor Experto publicado de admira.biz dentro de una vista separada, sin inyectar la credencial de conversación. / Allowlisted tours through the published Expert engine, separate WebView without conversation credentials.
- Reunión/película con servicio de micrófono y notificación. WAV PCM de 25 segundos, guardado atómico, recuperación de fragmentos cerrados, envío por cuenta, resumen compartido, parada a cinco minutos de señal baja y límite diez horas. / Explicit microphone foreground service, durable WAV chunks, account isolation, summary recovery, five-minute low-sound cutoff, ten-hour cap.
- Foto antes de escuchar, adjunto local por sesión y candidato de película con evidencia de escena y transcripción; puede devolver desconocido. Captura inicial usa la miniatura del proveedor de cámara: calidad inferior a iOS. / Optional local projection photo, scene/transcript candidate or unknown; initial camera thumbnail has lower quality than iOS.
- Estimación opcional de acostarse por fin de película nocturna y primera apertura matutina; no mide sueño ni todos los desbloqueos. / Optional night-film-end bedtime estimate and first morning app opening, not sleep measurement.

## Paridad pendiente / Parity remaining

Primera versión, no paridad completa validada: importación de audio/vídeo, foto de alta resolución y compartir adjuntos, acelerómetro/actividad histórica del diario, mirada por Bonjour desde el Mac, idioma inglés de toda la interfaz, voces elegibles y Meta DAT. No se ha publicado en Google Play. Las pruebas de consumo, interrupciones, noche completa y micrófono Bluetooth/Meta necesitan hardware y tiempo reales.

Initial release, not fully validated parity: media import, full-resolution photo/export, motion/rest history, Bonjour Mac gaze, full English UI, selectable voices and Meta DAT remain pending. No Google Play release. Battery, interruptions, overnight and Bluetooth/Meta microphone testing require real hardware and time.

## Compilar / Build

JDK 17, Android SDK platform 35 + build tools 35, Gradle wrapper. `./gradlew assembleDebug lintDebug`. Release: `./gradlew assembleRelease lintRelease`; local signing properties at `~/.config/admiranext/admirito-android/signing.properties`, never committed. Keep the signing key to update installed builds. Command routing test: compile `Commands.java` and `tests/CommandsTest.java`, run `com.admira.admirito.CommandsTest`.

La app conserva orientación mediante `configChanges`; la interfaz usa el viewport real, no nombres de modelos o dimensiones fijas. No mantiene el micrófono tras cierre forzado. Fragmentos aún abiertos pueden perderse tras una terminación del proceso. Los fragmentos cerrados no se eliminan hasta guardar resumen completo.

Configuration changes preserve the running UI; layout uses actual viewport dimensions. Force-stop ends recording; the current open segment may be lost. Closed audio is retained until the final summary is saved.

Android microphone background rules: https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start

## 0.1.1 · Player del Fold / Fold player

En Cuenta y escuchas → Player en este Fold se abre el canal real de Admira TV a pantalla completa, sin permisos de micrófono ni cuenta de conversación para esta pantalla de pruebas. Cerrar × vuelve a la mascota. Conserva pantalla encendida y se adapta al viewport. No se inicia al arrancar el teléfono.

El player de laboratorio utiliza `virtual-lab-admirito-fold`, su propio productor y cola; la reproducción comunica su pieza y geometría reales. Lee una copia de la playlist pública Starbucks del laboratorio (`macbookpro16`) sin escribirla ni tocar su emisión. La fuente es una playlist de referencia, no una asignación de inventario de restaurantes. El iPhone build 23 controla esta única ranura de laboratorio. Es un banco de pruebas compartido con control público de laboratorio, no un mecanismo de autorización para pantallas de clientes ni un identificador único provisionado para cada instalación.

Account and listening → Player on this Fold opens the real Admira TV channel with an independent producer and laboratory control queue. It reads the reference Starbucks laboratory playlist without changing the MacBook player. The phone reports its own playback, not the source device's telemetry. This fixed public laboratory slot is not customer-device authorization or unique per-install provisioning. Closing the player returns to the mascot; it does not start at phone boot.


Insta360 del Lab: Cuenta → Insta360 · ver el Lab. La vista privada se actualiza cada tres segundos y se detiene al cerrar o salir de la app. Para vincular, pide el código, apruébalo en admira.app con tu cuenta y vuelve a Admirito para terminar. La consulta se pausa durante el navegador; los errores de vinculación se muestran sin voz.

Lab Insta360: Account → Insta360 · view the Lab. Private snapshots refresh every three seconds while foreground. Approve the device code with your own account in the browser, then return to Admirito to finish. Pairing pauses in the background and errors remain silent.

## Selector de playlist / Playlist selector

Cuenta y escuchas → Modo Experto → Player en este Fold. Elige proyecto, local e IoT, o usa `/player PROYECTO LOCAL ID_IOT`. El Fold reproduce con identidad propia y no controla el origen. El banco fijo conserva su botón «Player Lab · Bugito y Supervisor». / Choose the public source in Expert; playback uses an independent identity. The existing fixed Lab player has a separate button. [Guía y pruebas / Guide and evidence](../../docs/admirito-fold-player.md).
