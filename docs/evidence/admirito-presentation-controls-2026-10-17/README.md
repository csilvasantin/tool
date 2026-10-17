# Admirito · controles de presentación · 17 octubre 2026

Build 15 instalado por USB. Implementación `f550fdb`. Cambios nativos: controles exactos siguiente/anterior/para la demo, contexto de último destino por cuenta y consulta al agente para frases desconocidas. Reutiliza la API de invocaciones ya publicada, sin otro despliegue de servidor.

23 pruebas nativas, 2 omitidas por límites del simulador, cero fallos. Se comprueban órdenes completas, rechazo de acciones añadidas, instrucción de avanzar exactamente una lámina, conservación de la pestaña al parar y consulta de órdenes desconocidas sin ejecución automática.

Prueba real por voz desde el iPhone, con el MacMini y Firefox:

- Encargo #6389 · siguiente en presentación Alsea: recibido «siguiente», Firefox 1/62 → 2/62, respuesta real recibida por Admirito.
- Encargo #6390 · anterior en presentación Alsea: recibido «anterior», Firefox 2/62 → 1/62, contador comprobado después de la transición.

La página verificada es https://www.admiranext.com/presentaciones/alsea-starbucks/presentacion?lang=es. Se conserva la pestaña ya abierta y no se mueven ni redimensionan ventanas. La ejecución usa el agente real del MacMini y es asíncrona: se confirma el resultado observado, no solo el ACK. Una petición pendiente debe comprobarse antes de aceptar otra. No se afirma control instantáneo ni nuevos destinos conectados.

- Encargo #6391 · parar presentación Alsea: la voz «para la demo» llegó al agente. El panel mostraba 00:00 y «Iniciar tiempo», en 1/62. Se devolvió ese estado sin atribuir una pausa de reproducción activa. La activación de «Pausa escénica» no pudo confirmarse y sigue pendiente una prueba con reproducción activa. La primera secuencia física agotó los 120 s esperando esa respuesta: no se contabiliza como prueba completa aprobada.
- Encargo #6392 · consulta desconocida de presentación: el iPhone transcribió «¿Qué puedes hacer con esta presentación?» y envió la consulta literal al agente, con prohibición de ejecutar acciones sin aclaración. Oráculo devolvió los controles disponibles. La primera repetición comprobó antes la respuesta pendiente de la parada y pidió repetir la consulta; no reenvió órdenes pendientes automáticamente.

Durante la inspección se probó el atajo P, que abrió impresión en esta página; se canceló sin imprimir ni generar un archivo. No se usa como control de pausa.

La repetición física aislada de consulta desconocida terminó aprobada (46,0 s): respuesta recibida en `petStatus` y voz finalizada en `petVoicePreview`. Su marcador genérico `ALL_PRESENTATION_VOICE_CONTROLS_VERIFIED` corresponde únicamente a esa repetición aislada, no acredita la secuencia completa ni la pausa activa.

## Repetición con ensayo activo

Encargo #6393 · detener ensayo activo por voz. Se inició explícitamente el ensayo en la pestaña Firefox existente a petición de Carlos. Dos observaciones previas mostraron TIEMPO 00:16 y 01:02, «Pausar tiempo» y pausa escénica desactivada. El iPhone recibió por micrófono «Para la demo», sin inyectar texto, y creó el encargo real.

Tras recibir la orden se accionaron «Pausar tiempo» y «Pausa escénica». Firefox mostró TIEMPO 01:09, «Continuar tiempo» y «Reanudar presentación · B», activado. Una segunda observación tras seis segundos mantuvo 01:09 y los mismos estados. Se conservan pestaña y lámina 1/62. Esto acredita detener el ensayo y activar pausa escénica; no es una prueba de un vídeo o reproductor externo.

Se devolvió a Admirito: «He detenido la demo en Firefox del MacMini», seguido de los estados y tiempo comprobados.

La prueba física aislada de parada terminó aprobada en 93,2 s: `CONTROL_CONFIRMED_stop`, respuesta real en `petStatus` y `petVoicePreview` confirmó voz completada. Telemetría del iPhone: Paulina inició la confirmación a las 17:54:05 UTC y terminó a las 17:54:22 UTC. El marcador genérico final corresponde a esta prueba aislada. Se restauró después el lanzamiento normal de Admirito; Firefox permanece pausado.
