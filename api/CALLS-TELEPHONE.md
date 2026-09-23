# Llamada de incidencia mediante Twilio

Primera integración: llamada real, en español, vinculada a un expediente sintético de `/llamadas`. Recoge fallo, disponibilidad y acceso, lee un resumen y exige confirmación expresa. El resultado queda en el intento y en el historial del expediente. No crea propuestas, no confirma citas ni avisa a técnicos reales.

Es una conversación guiada con reconocimiento de voz y síntesis de Twilio, no un LLM ni una comparación real de Rápida/Equilibrada/Premium. El trial bloquea Stream, ConversationRelay y SIP; admite Say y Gather. Referencia: https://www.twilio.com/docs/usage/trials/try-out-voice

## Configuración

Aplicar `0015_call_telephone.sql` al D1 de la API. Configurar como secretos del Worker `yokup-api`: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `TWILIO_DEMO_TO`. Nunca versionar valores. El móvil permitido debe estar verificado en la cuenta Twilio. Sin esta configuración el botón telefónico no se habilita.

Solo superusuarios con sesión web pueden lanzar la prueba, con un expediente sintético abierto, contacto comercio y sin propuesta activa. El teléfono del contacto debe coincidir con el único destino configurado. Cada clic requiere marcar el destino autorizado. Límite local: tres solicitudes por superusuario cada 24 horas y 180 segundos por llamada. No hay marcación automática desde cron.

`POST /api/calls/jobs/:job/telephone` recibe `request_key` UUID y `authorized:true`. Reserva un intento exclusivo antes de llamar a Twilio. Repetir la clave devuelve el mismo intento. Un timeout o error 5xx deja el resultado incierto y nunca relanza la llamada. Para comprobarlo se usa `telephone-status` con `attempt_id` y, si falta, el Call SID visible en la consola. Se verifica en Twilio cuenta, destino, emisor y fecha antes de vincularlo. Los errores 4xx se registran como rechazo y escalan a coordinación.

## Respuestas y resultados

Twilio llama a `/api/calls/telephone/:attempt/voice?turn=N` y `/status` mediante POST de formulario. Se exige firma HMAC-SHA1 `X-Twilio-Signature`, cuenta, Call SID, destino, emisor y sesión vigente. URL canónica: `https://data.yokup.com`. No se acepta un origen arbitrario para firmar. Guía: https://www.twilio.com/docs/usage/webhooks/webhooks-security

Las respuestas de voz se interpretan de forma limitada. En preguntas binarias: sí/uno y no/dos; nueve o pedir una persona deriva a atención humana. Silencio o baja confianza repreguntan una vez; no generan aceptación. Disponibilidad y acceso se conservan como texto pendiente y solo son resultado confirmado tras aceptar el resumen. Corrección y un máximo de ocho turnos evitan bucles.

La caché por intento/turno y la comparación del estado previo evitan que reenvíos o respuestas fuera de orden dupliquen decisiones. El cierre del proveedor sin resumen confirmado deja revisión humana. No respuesta/ocupado reutilizan la política de reintentos de Yokup, que devuelve el trabajo a la cola sin marcar de nuevo automáticamente. Nunca se cierra la incidencia solo porque terminó la llamada.

Las respuestas y el Call SID quedan en el expediente privado. Se trata la voz reconocida como datos y se escapa al generar XML. No se graba audio desde esta integración. Twilio puede conservar sus propios registros según la cuenta.

## Verificación

`node --test api/calls-telephone.test.mjs api/calls.test.mjs` cubre firma, acceso, destinatario, idempotencia, turnos, consentimiento, cierre incompleto y reconciliación. Para revisar la UI sin llamadas externas: `CALLS_TELEPHONE_DEMO=1 node api/tools/calls-pilot-server.mjs`; móvil sintético `+34600000000`. El transporte de este servidor está sustituido y nunca llama a Twilio.
