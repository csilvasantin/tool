# Demo de llamadas IA de Yokup

URL: `/demo-llamadas`. Se comparte con `?calidad=fast|balanced|premium&caso=normal|no_answer|reschedule|reopen|handoff`.

## Entrega actual

Demo pública y local al navegador, sin acceso a expedientes privados ni operaciones contra el backend. Incluye reproducción/pausa, pasos manuales, lectura opcional por síntesis del navegador, expediente progresivo, propuestas versionadas, doble aceptación, valoración, reintentos y relevo humano. Cada perfil cambia el guion de ejemplo; no ejecuta el modelo propuesto ni simula resultados de benchmarks. La lectura del navegador no permite comparar la voz real de los modelos.

La calculadora utiliza cantidades de tokens editables y tarifas USD por modalidad, consultadas el 23/09/2026. No convierte minutos en tokens ni presenta el ejemplo como presupuesto. No incluye caché, impuestos, telefonía, transcripción adicional ni infraestructura. Las tarifas deben revisarse antes de contratar o activar consumo.

Fuentes:
- https://developers.openai.com/api/docs/pricing
- https://developers.openai.com/api/docs/models/gpt-realtime
- https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini
- https://developers.openai.com/api/docs/models/gpt-realtime-2.1
- https://developers.openai.com/api/docs/guides/voice-webrtc

Pruebas: `node --test yokup-site/calls-demo.test.mjs`. La suite recorre los cinco casos, impide cerrar sin satisfacción, invalida aceptaciones de versiones anteriores, comprueba que el replay no modifica el historial y valida el cálculo por modalidad.

## Activación de IA real pendiente

A 23/09/2026, el Worker de datos no tiene un secreto de voz y la bóveda consultada no dispone de `OPENAI_API_KEY` ni `YOKUP_OPENAI_API_KEY`. No se ha añadido ningún proveedor, credencial ni coste de API. La elección/configuración del servicio está pendiente del usuario.

El siguiente paso funcional es una conversación real en navegador, primero en expedientes sintéticos y con cuenta autorizada. El backend debe seleccionar el modelo del perfil, iniciar una sesión WebRTC mediante `/v1/realtime/calls` y conservar la clave en servidor. Debe validar origen y usuario, limitar sesiones simultáneas/consumo y comprobar disponibilidad del modelo en esa cuenta. No debe exponerse un endpoint anónimo de gasto ni tratar una sesión de voz sin herramienta ejecutada como una cita confirmada.

Para llevarlo a números telefónicos se necesita además el proveedor de telefonía, identidad/número emisor y conexión SIP o streaming de audio. Una cola programada reserva cada `call_job`, inicia la llamada y aplica resultados mediante el mismo contrato de reintentos y escalado. Los webhooks han de autenticarse y deduplicarse; el identificador de intento debe vincular llamada, sesión y expediente.

La IA usará herramientas restringidas a una incidencia: leer contexto, registrar disponibilidad, proponer una franja, registrar aceptación explícita de una versión y pedir ayuda. La confirmación de cita y la resolución siguen siendo decisiones validadas por el servidor. No se debe conceder al modelo una escritura genérica en SQL, permisos globales ni autoridad para inventar aceptaciones.

Para comparar calidad hay que ejecutar los mismos casos, medir latencia y coste observado, evaluar comprensión, interrupciones, fidelidad de las herramientas y facilidad de conversación. Las tarjetas actuales expresan objetivos de producto; la clasificación final no está validada con llamadas reales.


## Actualización: piloto telefónico guiado

La conexión de Twilio con el expediente está implementada en `CALLS-TELEPHONE.md`: voz sintética y reconocimiento por turnos, confirmación de disponibilidad/acceso y resultado persistido. Necesita secretos Twilio para activarse y se restringe a un destino verificado y expedientes sintéticos. No activa los modelos ni los tres niveles de calidad de esta demo pública.
