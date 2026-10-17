# Admirito · 17 octubre 2026

Implementación publicada: `7eef3e3` (canal real y avisos), `3051c5c` (idioma de órdenes y alternativa táctil). API verificada: `v.17.10.2026.r2.18:53`, commit `3051c5c`, https://api.admira.biz/version.json. App nativa build 13 instalada por USB en el iPhone de Carlos, sin iniciar ni interrumpir una escucha larga.

## Comprobado

- 19 pruebas nativas, 2 omitidas por limitaciones del simulador, cero fallos. 21 pruebas de conversación/invocación API, cero fallos. Despliegue canónico ejecutó su conjunto de pruebas y guardas.
- USB, orden hablada mientras se mantiene la nube: al soltar, transcribe `/tour starbucks mexico`, da feedback Paulina y abre el recorrido real. Captura termina 16:45:26 UTC; voz 16:45:31–33; entrega al motor 16:45:34; tour activo 16:45:37; Monterrey 02/10 a las 16:46:01.
- Cámara: nube ocupa la pantalla horizontal. Portrait y seguimiento del dedo comprobados en la misma geometría del build anterior; no atribuir una nueva prueba de esas funciones al build 13.
- Invocación táctil: encargo #6386 · conversación desde Admirito iPhone, dirigido a Oraculo/MacMini. Respuesta emitida por OraculoMacMini, recibida en el iPhone y visible sobre la mascota. Voz de la respuesta 16:54:08–32 UTC. No intervino el modelo de conversación para generar la contestación.
- Invocación por voz posterior al ajuste de idioma y con pulsación de seis segundos: encargo #6387 · Oráculo invocado desde iPhone; llegó a OraculoMacMini con el contexto real del turno anterior. Respuesta emitida por el mismo canal. Prueba USB final superada en 32,6 segundos: recepción real en el teléfono; voz de la respuesta 16:56:46–59 UTC.
- Tres intentos de invocación por audio de altavoces antes del ajuste de idioma recogieron texto incorrecto/ruido, dieron feedback de no comprensión y no enviaron encargos. No son pruebas de invocación por voz superadas.
- Detección local «Hola, Admirito» verificada en build 12. Nombre aislado irregular. Detección solo con mascota visible y app activa; no afirmar escucha del nombre con teléfono bloqueado.

## Límites

El canal real es una bandeja asíncrona de la flota, con respuestas que pueden abreviarse y contexto de preguntas/notas anteriores. No es una llamada Realtime ni acceso al hilo actual de Codex. Primera autorización solo Carlos. La continuidad completa del nuevo canal entre dispositivos, interrupciones, escucha nocturna y parada prolongada por silencio siguen pendientes. Audio y credenciales no se adjuntan como evidencia pública.
