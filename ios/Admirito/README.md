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
