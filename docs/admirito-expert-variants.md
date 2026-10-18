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
- Fold: ayuda compartida, Bugito rojo visible y `/default` verde comprobados. Creativo llega al acceso protegido de Studio; necesita sesión web propia. La instalación de la última corrección de navegación Google y los resultados finales de iPhone se registrarán al terminar la comprobación.

El contrato de variantes no genera incidencias ni contenido de pago por sí solo. No se modifica la automatización Hue ni se declara verificado el RGB pendiente.
