# Conversación de agentes / Agent conversation

ES: Entrada `/conversar`, bajo la sesión existente de admira.app. Una cuenta conserva sus hilos en D1 y los recupera desde otro navegador/dispositivo. Admirito, Bugito y Supervisor comparten el hilo; cada mensaje conserva la identidad que respondió. No se duplica el cerebro ni el motor de comandos: se usa Workers AI existente para conversación. Esta primera entrega conversa, sin ejecutar comandos ni consultar telemetría. No afirmar que Supervisor ha observado un equipo o que Bugito ha provocado/reparado un fallo. Las órdenes siguen en el motor compartido de Experto.

EN: `/conversar` uses the existing admira.app session. Account-owned D1 threads can be resumed from another browser/device. Admirito, Bugito and Supervisor share a thread; messages retain the replying agent. This first release uses existing Workers AI for conversation; it does not execute commands or query telemetry. Commands remain in the shared Expert engine. Do not claim physical observations or repairs from chat output.

## Uso / Tutorial

1. ES: entra en `/conversar`, elige un agente, escribe o pulsa Hablar. Interrumpir detiene escucha y voz; una petición ya enviada sigue guardándose. EN: sign in, choose an agent, type or press Talk. Interrupt stops listening and speech; an already submitted reply is still saved.
2. ES: abre la misma URL con la misma cuenta en otro equipo y elige el hilo. Se sincroniza cada seis segundos cuando está visible. EN: open the same URL with the same account on another device and select the thread. Visible pages sync every six seconds.
3. ES: voz mediante reconocimiento del navegador; si falta, grabación de hasta 30 segundos y transcripción en el servidor. Se conserva texto, nunca grabaciones. La voz de salida usa el sintetizador del dispositivo y puede variar. EN: browser speech recognition, or up to 30 seconds of recorded audio for server transcription. Only text is retained. Device speech synthesis may sound different across platforms.
4. ES: Meta Display: `/conversar-display` es una prueba web de interfaz y vinculación; no una integración certificada. Solicita código, abre `/conversar` en el móvil, despliega «Continuar en otro dispositivo», introduce el código y vincula. La cookie solo autoriza conversaciones durante siete días. Puedes revocarla desde la misma sección. EN: `/conversar-display` is a web UI/pairing prototype, not a certified integration. Request a code, approve it from the phone's conversation page, then resume. The conversation-only cookie lasts seven days and is revocable.
5. ES: Meta con cámara sin Display: el navegador del móvil permite probar audio Bluetooth seleccionado por el sistema, sin garantizar el micrófono de las gafas. Quedan pendientes integración nativa DAT iOS/Android, cámara, invocación manos libres, segundo plano, revisión Meta y pruebas físicas. EN: camera glasses without Display can try system-selected Bluetooth audio through the phone. Native DAT iOS/Android integration, camera, hands-free invocation, background operation, Meta review and real device tests remain pending.

## Contrato HTTP / HTTP contract

Base: API de la casa (`https://api.admira.app`). Credenciales solo mediante cookies HttpOnly/Secure; nunca en URL ni localStorage. Identidad y titularidad se resuelven en el servidor. La autorización de cuenta se revalida también para dispositivos vinculados.

- `GET /agents/conversations`: hasta 100 hilos propios / up to 100 owned threads.
- `POST /agents/conversations {}`: crear hilo / create thread.
- `GET /agents/conversations/:uuid`: últimos 100 mensajes / latest 100 messages.
- `POST /agents/conversations/:uuid/messages {text,agent,request_id,lang}`: `agent=admirito|bugito|supervisor`; UUID por turno, idempotente, máximo 2000 caracteres. Últimos 24 mensajes al modelo. Máximo 200 turnos por hilo. Lease impide respuestas simultáneas entre dispositivos; 409 permite reintentar sin duplicar.
- `DELETE /agents/conversations/:uuid`: borrar hilo y mensajes propios / delete owned thread and messages.
- `POST /agents/transcribe`: audio webm/mp4/ogg/wav/mpeg, máximo 3 MB; respuesta `{text}`. Audio no persistido / audio is not persisted.
- `POST /agents/devices/start {}`: código de ocho caracteres, caduca a los cinco minutos; secreto solo en memoria durante el vínculo / five-minute device flow, secret held only in memory.
- `POST /agents/devices/approve {code}`: cuenta identificada aprueba el dispositivo / authenticated account approves.
- `POST /agents/devices/poll {device_id,secret}`: pendiente o cookie de conversación / pending or scoped HttpOnly cookie. Una sesión vinculada nunca abre APIs generales ni aprueba otros dispositivos.
- `GET /agents/devices`, `POST /agents/devices/revoke {device_id}`: solo cuenta principal; gestión de sus dispositivos / primary account manages its devices.

ES: No hay una nueva credencial permanente ni secretos en el cliente. La vinculación está limitada por origen, caducidad y frecuencia. No se accede al controlador de cámara ni se inicia una vigilancia paralela.
EN: No permanent credential or client-side service secret is created. Pairing enforces origin, expiry and frequency limits. No camera controller is accessed and no parallel surveillance is started.

Fuentes / Sources: https://developers.meta.com/wearables/faq/ ; https://github.com/facebook/meta-wearables-webapp ; https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/

## Invocación real / real fleet invocation (17 Oct 2026)

`POST /agents/conversations/:uuid/invocations {target,text,request_id}` creates one real fleet request; `GET /agents/conversations/:uuid/invocations/:request_uuid` retrieves its actual reply. Targets: `oraculo`, `jobs`, `wozniak`, `disney`, `lucas`, `musk`. Initial authorization is restricted server-side to Carlos, with account ownership on every conversation read/write. Paired credentials do not confer arbitrary fleet permissions. Server-only TELEGRAM binding and panel credential mediate delivery; no fleet secret is placed in the client. Requests are UUID-idempotent, capped at six per minute, and uncertain delivery is never replayed.

This first integration uses the real fleet mailbox, not an LLM role impersonating a named agent. It is asynchronous and does not attach to a specific existing Codex thread. The destination's fleet delivery policy determines which runtime receives it. Returned notes can be abbreviated by the existing fleet API. A completed request without a note is explicitly reported without generating an answer. Follow-up context includes recent questions and actual returned notes in the same account-owned conversation. The fleet mailbox also publishes its normal group notice.

ES: La invocación inicial entrega un encargo real y consulta su respuesta; no equivale todavía a hablar en tiempo real en un chat concreto de Codex. Admirito diferencia entrega pendiente, respuesta real y entrega incierta. El historial entre dispositivos de este nuevo canal y la voz en tiempo real siguen pendientes.
