# Escuchas personales de Admirito / Admirito personal listening

Cliente: `ios/Admirito`. Cuenta y conversación: contratos existentes de `/agents/conversations` y `/agents/devices`. El vínculo iOS se solicita con `{client:"ios"}`, se etiqueta como Admirito iOS y entrega un identificador opaco de cuenta al dispositivo aprobado. El secreto solo se conserva en el llavero nativo. El acceso de un dispositivo Meta Display no permite leer las transcripciones privadas de escuchas.

Client: `ios/Admirito`. The existing device flow now supports an iOS-scoped companion label. Device cookies remain revocable and account ownership is checked server-side. Display-only devices cannot read listening transcripts. No service credentials enter the app.

## API (sesión de cuenta o dispositivo Admirito iOS / account or Admirito iOS session)

- `GET /agents/listening`: últimas 100 escuchas propias / latest owned sessions.
- `POST /agents/listening {id,conversation_id,kind,title}`: UUID de cliente idempotente, conversación propia; `kind=meeting|movie`.
- `POST /agents/listening/:id/chunks {seq,start_seconds,duration_seconds,text}`: fragmento de texto, secuencia contigua, máximo 1440; reintento idéntico es seguro, cambios se rechazan. Audio no persistido en el servidor.
- `GET /agents/listening/:id`: metadatos y transcripción propia / owned metadata and transcript.
- `POST /agents/listening/:id/summary {expected_chunks}`: exige todos los fragmentos contiguos; congela la transcripción y resume por bloques durables. Devuelve 202 con progreso mientras procesa; repetir continúa, no empieza desde cero. El resumen final se inserta idempotentemente en la conversación con identidad Admirito.
- `DELETE /agents/listening/:id`: elimina la escucha y sus fragmentos; no elimina un resumen ya enviado al historial de conversación / deletes listening data, not an already posted conversation summary.

ES: Reunión: resumen, decisiones, tareas/responsables explícitos y preguntas pendientes; nada se atribuye sin evidencia en el texto. Película: solo el fragmento oído; no se completa con conocimiento externo. Una escucha sin contenido hablado genera una nota determinista honesta y no llama al modelo. No se ejecutan comandos ni acciones físicas.

EN: Meeting summaries preserve explicit decisions, tasks and owners without inventing attribution. Movie summaries only use the captured fragment. Silent recordings produce an honest deterministic note without model calls. No physical actions or commands are executed.

Validación: pruebas de cuenta/dispositivo, fragmentos incompletos, checkpoints de resúmenes largos, recuperación tras error e idempotencia. La prueba nativa usa audio sintético; la prueba con micrófono real y pantalla bloqueada sigue pendiente hasta instalar y usar el iPhone.
