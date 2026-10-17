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
