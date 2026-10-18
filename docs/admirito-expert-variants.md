# Admirito en Experto / Admirito in Expert

Un único contrato compartido, publicado en `admiranext.com/suite/admirito.mjs`, sobre el trabajo de Trinity en PR #219 · llamadas unificadas. PR #221 · integración de variantes añade el verde estándar y compatibilidad con cargadores anteriores.

| Orden / Command | Resultado / Result |
|---|---|
| `/admirito`, `/default`, `/admirito default` | Admirito verde estándar, siempre visible; repetir no lo oculta / Standard green, repeated calls keep it visible |
| `/admirito creativo`, `/creativo` | El Creativo: locuciones y música en Studio / Voice-overs and music in Studio |
| `/admirito arquitecto`, `/arquitecto` | Crear, reformar e inventariar / Create, renovate and survey |
| `/admirito bugito`, `/bugito` | Bugito flotante; el banco de fallos conserva autorización / Floating Bugito, authorized fault bench unchanged |
| `/admirito supervisor`, `/supervisor` | Cámara y supervisión existentes / Existing camera and supervision |
| `/admirito help`, `/help admirito`, `/help default` | Ayuda ES/EN; conserva idioma / Bilingual help, current language preserved |

El subcomando admite barra: `/admirito /bugito`, `/admirito /default`, `/admirito /help`. Los alias anteriores y `/admirito on|off` siguen disponibles. Creativo conserva espacios y saltos de línea en Studio. Desde otro host, un encargo con texto no se añade a una URL ni se envía sin adaptador.

## Móviles / Mobile

Versión compartida 20261018.9: iPhone build34, Android versionCode12. El modo Experto delega las órdenes en el motor publicado. La navegación permite los hosts oficiales de la suite; Google puede mostrar su identificación normal, donde el puente de órdenes permanece desactivado. La vinculación de conversación no concede una sesión web de Studio ni permisos sobre otros proyectos.

Las respuestas se muestran en pantalla. El conector comprueba los comandos compartidos, sin depender del adaptador de tours. El iPhone comprueba de nuevo el puente al enviar, sin reintentar automáticamente una orden tras navegar. El botón nativo tiene identidad accesible propia, diferenciada del botón de la consola web. Una respuesta pendiente de conversación no deshabilita por sí sola la consola Experto; la escucha activa conserva su protección.

## Verificación / Verification

- 56 pruebas de motor, namespace, avatar, Bugito, Arquitecto, Supervisor, transporte e idioma correctas.
- 1674 pruebas web de admira.app correctas; cuatro pruebas de puente móvil correctas; Android compila y pasa lint; iOS compila firmado.
- Chrome real: selección verde idempotente desde Bugito con cargador nuevo y anterior.
- Consolas web reales: ayuda y verde en Studio; ayuda, Bugito y verde en Store, TV y App, utilizando el acceso normal de Google donde corresponde. Creativo real visto en Studio.
- Fold: ayuda compartida, Bugito rojo visible y `/default` verde comprobados. Creativo llega al acceso protegido de Studio; necesita sesión web propia. La última corrección Google quedó instalada y el APK instalado coincide por SHA-256 con el publicado. Google abrió su identificación normal; la sesión de Studio requiere completarla en el teléfono.
- iPhone físico: prueba nativa completa correcta, con ayuda, Bugito visible y transición al verde mediante `/admirito` y `/default`. El botón nativo se identifica como `suiteExecute`, sin confundirlo con el botón de la web.
- Publicación admira.app: `v.18.10.2026.r8.14:13`, commit `f57ef9e` · variantes en vistas móviles, firma `OraculoMini · MacMini`, árbol limpio. Descarga pública e instalación del Fold tienen el mismo SHA-256.
- La consola web autenticada de Biz no se dio por comprobada: el acceso Google de IAB no completó el popup. Su motor real sí ejecutó las variantes a través de los clientes nativos. Las capturas de teléfonos y sesiones se conservan en privado; la bóveda guarda rutas y hashes, no credenciales de navegador.

El contrato de variantes no genera incidencias ni contenido de pago por sí solo. No se modifica la automatización Hue ni se declara verificado el RGB pendiente.

## Corrección de continuidad · 20261018.10

Experto mantiene la vista abierta durante la inactividad; la mascota sigue disponible al invocarla manualmente. Cada navegación retira el resultado de la página anterior y descarta sus respuestas tardías, sin repetir la orden. Android pausa la activación por voz mientras está abierta la consola.

Expert stays visible while idle; the pet remains available when explicitly opened. Navigation clears the previous page's result and ignores its late responses without replaying the command. Android pauses wake recognition while the console is open.

## Comprobación adicional de variantes · 18 octubre

Probado desde Experto con la versión 20261018.10, sin lanzar fallos ni generar contenido:

| Orden | iPhone | Fold |
|---|---|---|
| `/admirito arquitecto` | Estudio y Arquitecto con casco visibles | Estudio y Arquitecto con casco visibles |
| `/admirito bugito` | Bugito rojo visible | Bugito rojo visible |
| `/admirito supervisor` | Acceso Google completado; vista de análisis y controles de cámara abiertos | Llega a Admira Live, pero Google queda en blanco y no conserva la sesión: pendiente |
| `/admirito` | Respuesta de verde estándar y mascota verde visibles | Respuesta de verde estándar y mascota verde visibles |

Supervisor en iPhone se comprobó como acceso a la vista de cámara; el reproductor indicaba pausa. No se movió la cámara ni se verificó vídeo en directo en esta prueba. La instrumentación temporal de diagnóstico Android solo mostró el dominio externo; se retiró y se restauró el APK público.

Additional physical checks: Architect, red Bugito and return to standard green passed on both phones. Supervisor opened its analysis/camera controls on iPhone after normal Google sign-in, with playback paused. Fold Supervisor remains pending because the embedded Google page becomes blank and the session is not retained. No PTZ movements, fault injection or content generation. Temporary Android diagnostics were removed and the public APK restored.

## Comercial · quinto asistente compartido

Comercial se publica en admira.biz para vender campañas a anunciantes: brief, audiencia, ubicaciones del mapa y propuesta descargable con las estimaciones del planificador existente. Se invoca mediante `/comercial` o `/admirito comercial`; `/admirito` cierra su panel y vuelve al verde estándar. No se transporta el brief por URL ni se reserva o publica una campaña.

Entrada: https://www.admira.biz/?asistente=comercial&lang=es. Guía de funcionamiento: https://github.com/csilvasantin/clearchannel-tv/blob/main/docs/comercial.md.

La llamada compartida está probada en navegador público de escritorio/móvil y en el modo Experto del iPhone, con retorno al verde. La comprobación física de Comercial en el Fold queda pendiente de reconectar USB. Esto no resuelve el acceso de Google pendiente de Supervisor en el Fold. No hace falta una nueva instalación nativa: se utiliza el motor compartido publicado.

Commercial is the fifth shared assistant, focused on advertiser campaigns. Desktop/mobile web and the native iPhone Expert command plus standard-green return passed. Physical Fold verification is pending USB reconnection; its separate Supervisor Google issue remains open. Existing native apps use the updated shared engine.
