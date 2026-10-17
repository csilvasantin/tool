# Admirito iOS · asistente personal / personal assistant

Cliente nativo de admira.app. SwiftUI + AVAudioEngine, iOS 17 o posterior. Firma elegida por Carlos: Admira Digital Networks S.L. La app empieza sin escuchar y requiere permiso de micrófono y una acción explícita para iniciar cada sesión.

Native admira.app companion. SwiftUI + AVAudioEngine, iOS 17+. Carlos selected the Admira Digital Networks S.L. signing team. Listening is off on launch and requires microphone permission and an explicit Start action.

## Uso / Use

1. **Vincular / Link:** solicita código, cópialo y abre admira.app en Safari. Entra con tu cuenta, abre «Continuar en otro dispositivo» y aprueba el código. Regresa a Admirito. El secreto del dispositivo nunca entra en URL, portapapeles, logs ni UserDefaults. La sesión revocable se guarda en Keychain, accesible tras el primer desbloqueo; caduca a los siete días. / Request a code, approve it from your signed-in account in Safari, then return. Device secrets stay in memory/Keychain; never URLs, clipboard, logs or UserDefaults.
2. **Reunión / Meeting:** elige Reunión e Iniciar escucha. Pausar conserva lo captado. Terminar y resumir completa transcripción y resumen. / Start, pause or finish a meeting. Finishing queues the transcript and summary.
3. **Película / Movie:** para el caso de Carlos, deja el iPhone cerca del televisor u ordenador, con volumen audible. Se resume solo el audio captado; la app no ve imágenes ni inventa escenas. / Put the iPhone near the TV/computer. Only captured audio is summarized; no visual understanding or invented scenes.
4. **Segundo plano / Background:** la captura utiliza sesión AVAudioSession activa y `UIBackgroundModes=audio`, sin reproducción silenciosa artificial. iOS puede interrumpir por llamadas, cambio de micrófono, cierre forzado o recursos del sistema. La app guarda fragmentos y pasa a Pausada; nunca afirma seguir escuchando tras un cierre. / Active audio recording supports background execution; calls, route changes, force quit or system resource limits can interrupt it. Completed fragments are retained; a relaunched app never claims it is still recording.
5. **Continuidad / Continuity:** transcripciones y resumen usan la cuenta que autorizó el vínculo. El resumen llega a su conversación de admira.app. Las escuchas pendientes no se envían al cambiar de cuenta. / Notes stay bound to the approving account; summaries join the same conversation. Pending recordings never upload under another account.
6. **Preguntar / Ask:** escribe o usa el dictado del teclado; Admirito responde con voz. Interrumpir voz la detiene. Durante una escucha se pausa la conversación hablada para no grabar la propia respuesta del asistente. / Type or use keyboard dictation for spoken replies. Spoken chat is disabled during a recording to avoid feedback.
7. **Archivos / Files:** importación opcional de audio/vídeo accesible. No se captura automáticamente audio interno de otras apps ni se eluden protecciones DRM. / Optional import of accessible media; no silent capture of other apps or DRM bypass.

## Datos y recuperación / Data and recovery

- PCM mono 16 kHz/16 bit, fragmentos de unos 25 s, por debajo del límite de 3 MB del transcriptor. Se detecta silencio digital para evitar transcribirlo. / Small mono PCM segments; digital silence bypasses ASR.
- Audio y manifiestos en Application Support, excluidos de backup y protegidos con `completeUntilFirstUserAuthentication` para permitir escritura con pantalla bloqueada tras iniciar la escucha. / Protected, backup-excluded local storage supports writes after the first unlock.
- Cada fragmento cerrado tiene sidecar durable. Se recuperan fragmentos cerrados tras relanzar. Un fragmento que estuviera abierto al cierre forzado puede perderse. / Closed segments have durable sidecars; an open segment may be lost on force quit.
- Audio eliminado solo después de transcripción, envío y manifiesto local guardado correctamente. Texto y resumen quedan en la cuenta. Los silencios no generan hechos inventados. / Audio is deleted only after successful transcription, upload and durable local state.
- Máximo 1440 fragmentos (~10 h) por escucha; cierre automático al alcanzar el límite. / Each session closes at 1440 segments (~10 h).
- Llamadas y desconexión de micrófono pausan; reanudación explícita. No es sustituto de Siri, no hay activación permanente sin iniciar una sesión y no se afirma integración Meta DAT. / Explicit resume after interruption; no unrequested always-on microphone or Meta DAT claim.

## Desarrollo / Development

Abrir `Admirito.xcodeproj`. El proyecto generado se conserva y `project.yml` permite regenerarlo con XcodeGen. / Open the committed project; regenerate using XcodeGen if needed.

```sh
xcodegen generate --spec ios/Admirito/project.yml --project ios/Admirito
xcodebuild -project ios/Admirito/Admirito.xcodeproj -scheme Admirito -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
# Firma corporativa desde la configuración local, nunca secretos en el proyecto:
xcodebuild -project ios/Admirito/Admirito.xcodeproj -scheme Admirito -destination 'generic/platform=iOS' DEVELOPMENT_TEAM=TU_EQUIPO archive
```

Tests nativos: continuidad de frames al convertir 60 s de audio sintético, fragmentación, tamaños, recuperación tras cierre y manifiesto enviado frente a sidecar antiguo. LiveServiceTests es opt-in: solo imprime un código público de aprobación y requiere aprobación del controlador de prueba. Ninguna credencial de servicio entra en la app. / Native tests cover conversion, segmentation and recovery; live service QA uses native networking and explicit approval without embedding service credentials.

**Validación física pendiente:** micrófono real, pantalla bloqueada durante una reunión/película, calidad a distancia, batería e interrupciones en el iPhone de Carlos. Compilar o simular no prueba esos comportamientos. / Physical iPhone testing remains required for microphone quality, locked-screen recording, battery and interruptions.

Referencias / References: [Apple background recording](https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/record), [Apple ReplayKit](https://developer.apple.com/documentation/replaykit).

### Foto de proyección / Projection photo

Antes de iniciar una escucha en modo Película, pulsa «Fotografiar la proyección». La cámara solo se abre con permiso y por acción expresa. La imagen queda protegida en el almacenamiento local, asociada a esa escucha, y aparece con su resumen. «Compartir foto y resumen» permite exportar ambos juntos.

La lectura de texto se hace con Apple Vision en el iPhone. Es una pista sin verificar: no hay reconocimiento de rostros ni identificación de películas por escenas, ni búsqueda en un catálogo externo. Si no hay título legible, la película sigue sin identificar. El usuario puede escribir el título que reconoce; el OCR no lo confirma automáticamente. La foto no se sincroniza con la conversación web.

Before recording, capture a projection photo. On-device OCR supplies unverified visible text, never a guessed movie identity. The protected local attachment persists with the listening summary and can be shared together. Photos are not uploaded or synced to web conversations; no scene-based film recognition or external catalogue lookup is implemented.

### Reconocimiento por escena y audio / Scene and audio recognition

La compilación 4 añade «Reconocer por escena y audio» al resumen con foto. Solo al pulsarlo se envía una copia reducida de la foto al servicio IA de Admira (Cloudflare Workers AI); se combina con la transcripción de esa misma escucha. No se almacena la imagen en el backend. El resultado conserva pistas y se guarda como candidato sin confirmar, nunca como identidad comprobada. Una coincidencia débil, una cita no presente en la transcripción o una salida inválida devuelve desconocido. La confianza del modelo no constituye una probabilidad calibrada ni garantiza acierto. No hay identificación de personas por sus rostros. Las versiones anteriores solo ofrecían OCR local.

Build 4 adds explicit opt-in scene-and-transcript inference through Admira's Cloudflare AI service. Photo bytes are processed transiently, not stored server-side. Results are cached for the listening session as an unconfirmed candidate or unknown; they never alter the extractive audio summary. Both distinctive visual evidence and an exact audio quote are required. Model confidence is not calibrated, and candidates can still be wrong.

### Horario de descanso y mascota / Rest diary and companion

Compilación 5: «Mi horario de descanso → Estimar mis horarios» es opcional y local. No mide sueño, no lee alarmas ni el uso global del iPhone. Al finalizar una escucha de película entre las 20:00 y las 04:00 propone acostarse a esa hora; si observó dos minutos de quietud consecutiva del acelerómetro durante la escucha, utiliza el comienzo de esa quietud como pista. Ambas son estimaciones corregibles, no pruebas de estar en la cama. No mantiene el micrófono encendido para seguir el horario.

Al abrir Admirito entre las 04:00 y las 15:00, tras al menos dos horas y menos de veinte desde la estimación nocturna, guarda la primera apertura observada. Con permiso de Movimiento consulta también actividad histórica: caminar/correr con confianza media o alta es una pista separada, no confirma cuándo cogiste el teléfono. Si no hay datos o permiso, no inventa una hora. «Corregir horas» permite indicar cuándo te acostaste y cogiste el móvil. La app suspendida no puede observar todas las aperturas de otras apps ni todos los desbloqueos. El diario se conserva con protección local, excluido de copias de seguridad, separado por cuenta.

La nube reutiliza el SVG compartido y las animaciones da-parpadeo y da-bote de admira-next-web/assets/avatar.js. Añade descanso (ojos cerrados y zetas) y arcoíris, con botones y reposo automático al terminar una escucha nocturna con diario activo. Respeta reducir movimiento. El estado de la mascota no afirma que el usuario duerma.

Build 5 adds an opt-in, local rest schedule with editable estimates, not sleep measurement. Night film completion and optional accelerometer stillness provide bedtime clues. The first morning app opening and historical walking/running are separately labelled observations, never global phone pickup or wake-up measurements. Missing motion data stays missing. Native companion reuses the web SVG/blink/bounce and adds resting and rainbow states with reduced-motion support. Overnight behavior still requires a real overnight trial.

### Fiabilidad · 17 octubre / Reliability · October 17

Compilación 6: la cola conserva la petición de trabajo cuando llega el último fragmento durante un envío. La prueba nativa suspende una subida, entrega el fragmento final durante esa espera y comprueba que ambos se guardan y el resumen se completa sin reintento manual.

Corrección del diario: la quietud desde el comienzo de una película ya no adelanta la hora de acostarse. La propuesta es el fin de la escucha manual o el comienzo del silencio final de cinco minutos cuando la parada fue automática; la quietud es solo una pista adicional. Sigue siendo una estimación corregible y no mide sueño. Esto sustituye la regla inicial de la compilación 5 descrita arriba.

Build 6 drains chunks arriving while an upload is suspended, including the final chunk required for the summary. Bedtime is no longer backdated to the start of a potentially hours-long stationary period: use the end of manual listening, or the start of the final five-minute silence for automatic stops. Real overnight and five-minute silence behavior still require physical validation.

### Modo AdmiraNeXT / AdmiraNeXT mode

Compilación 7 incorpora el tercer modo «AdmiraNeXT» junto a Reunión y Película, y conserva la última elección. Usa el modo Experto publicado de admira.biz dentro de una vista web nativa: no copia su gramática, no pide al modelo de conversación que simule una ejecución ni convierte respuestas de IA en órdenes.

Puedes escribir o usar el dictado del teclado. Atajos: `/tour alsea mexico`, `/tour altadis`, `/tour DooH total`, `/parar` y `/help`. Se despachan mediante `AdmiraExperto.exec` con el log DOM original y se muestra el mapa real. Un identificador por envío evita ejecutar dos veces la misma petición en esa página. Una navegación que pierde la respuesta no se reintenta automáticamente.

Este modo no inicia grabación y no se puede seleccionar mientras hay una escucha activa. La sesión web de admira.biz es independiente del vínculo de conversación; no se inyectan cookies ni credenciales nativas. Las acciones conservan sus permisos originales. El puente solo envía desde HTTPS a admira.biz/www.admira.biz; otras páginas pueden abrirse mediante la navegación normal, pero no reciben órdenes del campo nativo.

Build 7 adds a persisted AdmiraNeXT mode backed by the real published biz Expert engine. Commands are passed unchanged through WebKit arguments, not interpolated into JavaScript or interpreted by a second parser. Presets launch Starbucks Mexico, Altadis and total DOOH tours; /parar stops and /help reads the canonical catalogue. Keyboard dictation is supported, not an always-listening command microphone. Website identity/permissions remain separate from paired chat credentials. Dispatch acknowledgements and actual tour playback are distinct, and navigation never triggers automatic replay.

### Dictado de órdenes · compilación 8 / Command dictation · build 8

«Dictar orden» abre expresamente el micrófono del iPhone y muestra su nivel. «Terminar dictado» o el límite de 30 segundos cierra la captura y transcribe un WAV mono de 16 kHz mediante el servicio autenticado de Admira. No usa el reconocimiento de Apple, que devolvió «Retry» en el iPhone de prueba. El audio temporal está protegido, excluido del backup y se elimina después de la petición, también ante error o cancelación. No crea escuchas, notas ni mensajes de conversación. Cambiar de modo o pasar a segundo plano cancela el dictado. Una orden nueva vacía la anterior: una transcripción fallida no puede dejar preparada una orden antigua.

El texto reconocido se muestra sin corregirlo silenciosamente ni ejecutar nada. Hay que revisar la orden y pulsar «Ejecutar»; los atajos y el envío permanecen desactivados mientras se captura o transcribe. La prueba física reconoció `TOUR STARBUCKS MEXICO`, lo envió desde el botón real y verificó el avance del recorrido de `05 / 10` a `06 / 10` en el iPhone mediante Xcode. Un primer `TOR Starbucks México` se rechazó en la prueba y no se ejecutó.

El cliente nativo usa `https://api.admira.biz`, alias oficial del mismo servicio `yokup-rtc` declarado en `yokup-rtc/wrangler.toml`: `api.admira.app` resolvía a direcciones inaccesibles desde esta red. Conserva el vínculo del llavero y la credencial se limita a las peticiones HTTPS de ese API; nunca se inyecta en la vista de admira.biz. La web y el API tienen sesiones separadas.

Build 8 adds an explicitly started, metered iPhone microphone for short commands. Stop or the 30-second limit triggers the existing authenticated Admira transcriber; protected temporary audio is deleted after success, failure or cancellation, and no listening note or chat message is created. The app shows the exact recognized text and requires Execute; it never silently fixes a word or auto-executes. Mode changes/backgrounding cancel capture. Starting dictation clears the previous command, preventing stale execution after failed recognition. Real-device Xcode QA recognized `TOUR STARBUCKS MEXICO`, pressed Execute and observed the ten-stop tour advance from stop five to stop six. The native API uses the existing official `api.admira.biz` alias because the `.app` API addresses were unreachable on the test network; native credentials stay out of WebKit.

### Admirito en reposo · compilación 9 / Standby companion · build 9

Después de 30 segundos sin interacción, Admirito ocupa la pantalla y respeta el aspecto claro/oscuro del sistema. Conserva la nube web, parpadeo, respiración y reducir movimiento. Se adapta a horizontal y vertical. La mascota pequeña permite ampliarlo sin esperar; cerrar devuelve los controles. El reposo no tapa escuchas, dictados, respuestas o un tour en marcha.

Mantener pulsada la nube inicia el micrófono del iPhone con señal visual y vibración. Al soltar, incluso fuera del borde, finaliza la captura y transcribe mediante Admira. La captura tiene el límite de 30 segundos de la compilación 8; si se alcanza mientras sigues pulsando, la ejecución del tour espera a que sueltes. Cerrar, cambiar de pantalla o pasar a segundo plano cancela. No hay micrófono permanente ni activación por palabra clave.

Los tours públicos de Starbucks/Alsea México, Altadis y DooH total pueden arrancar automáticamente tras soltar: se admiten órdenes directas y frases como «Lanza el tour de Starbucks México». La lista es cerrada y delega la ejecución al motor Experto existente. Un reconocimiento dudoso, cliente desconocido, orden adicional o cualquier otra acción queda en el campo para revisión y ejecución expresa. No se corrige `Toar`/`TOR` a `tour` silenciosamente. La nube se reduce al arrancar el tour y el mapa permanece vivo al ampliar/cerrar la mascota; la telemetría lee el estado y progreso del HUD real, sin afirmar control físico de las pantallas.

Prueba física: Xcode esperó el reposo automático, verificó micrófono apagado, mantuvo pulsada la nube durante 12 segundos y reprodujo por los altavoces «Lanza el tour de Starbucks México» con voz española de México. Al soltar apareció `/tour starbucks mexico` y se observó avance de `01 / 10` a `02 / 10`, sin pulsar Ejecutar. La prueba separada de horizontal verificó controles dentro de pantalla y micrófono apagado. Un primer «Toar Starbucks, Mexico» se mantuvo para revisión y no lanzó el recorrido.

Build 9 expands the animated cloud after 30 idle seconds, with system light/dark appearance and portrait/landscape layouts. Hold the cloud to capture a command; release ends capture and processes speech. Closing/backgrounding cancels, and no always-on microphone is used. Only an explicit closed list of public tours auto-runs after release; unclear speech and all other actions require review through the canonical Expert flow. The existing WebKit map remains alive, and actual tour telemetry prevents standby from covering an active route. Real iPhone QA verified automatic standby with the mic off, a 12-second physical hold/release, the spoken Spanish phrase, automatic dispatch, tour progress from stop one to stop two, and a separate landscape layout check. Unit tests cover idle timing/busy gating and Spanish/English tour intent boundaries, including rejection of injected additional commands.
