# Ensayo privado del router por Telegram

Bot existente: `@YokupSoporteBot`. Bot API intercambia notas de voz; no realiza
llamadas de Telegram. Este ensayo usa guion acotado, voz sintética Mónica (es-ES)
generada en el Mac y Whisper `small` local. No llama a Twilio ni a una API de IA
de pago. Los tres niveles de calidad de IA siguen siendo otra etapa del proyecto.

Desde `/llamadas#router-demo`, **Ensayar por Telegram · sin Twilio** crea un
expediente ficticio y un enlace de 30 minutos. El participante abre el enlace y
pulsa Iniciar en su chat privado. El primer audio explica la transcripción y el
consentimiento; ningún grupo recibe estas notas. La persona responde con voz de
hasta 45 segundos, texto o botones. Solo el chat que consume el enlace puede
continuar. No compartas ese enlace: funciona como invitación personal.

El guion pide permiso → apagar alimentación → esperar 30 segundos y conectar →
esperar el arranque y comprobar → confirmar resultado. Permite simular los pasos
y nunca pide pulsar RESET. Los tiempos se comunican al participante: Telegram
no demuestra que se hayan esperado ni que un router real haya recuperado red.
La incidencia no se cierra automáticamente y no se avisa a un técnico real.

## Operación

1. Aplicar `migrations/0016_call_telegram.sql` en D1.
2. Mantener el `TELEGRAM_BOT_TOKEN` existente. No crear otro consumidor de
   `getUpdates`: `installer-telegram.js` comparte y bloquea el consumidor que
   también vincula instaladores. Cron mantiene la ruta anterior cada dos minutos.
3. Guardar una credencial aleatoria distinta en el secret de Worker
   `TELEGRAM_DEMO_SECRET` y en un archivo local fuera de Git, permisos 600.
   Solo permite consumir la cola acotada de transcripción y activar el polling;
   no permite leer expedientes arbitrarios ni enviar mensajes a otros chats.
4. Publicar Worker y assets/frontend. Audios en `assets/router-voice`, generados
   por `node api/tools/telegram-router-audio.mjs` con acceso al sintetizador macOS.
5. Iniciar el servicio local con el Python de Whisper instalado:

   ```sh
   /opt/homebrew/Cellar/openai-whisper/20250625_3/libexec/bin/python \
     api/tools/telegram-router-worker.py --secret-file /ruta/privada/credencial \
     --minutes 120
   ```

Requiere Mac despierto, red, ffmpeg y modelo Whisper ya instalado. El proceso
termina tras 120 minutos (máximo 180); no se instala un servicio permanente.
El botón rechaza nuevos ensayos si no hay latido del transcriptor en 45 segundos.
Si el proceso termina a mitad del ensayo, el texto seguirá funcionando vía cron;
las notas de voz esperarán a reiniciarlo hasta caducar la sesión (30 minutos).
Los audios entrantes se descargan solo para transcribir y se borran al terminar
el trabajo. El texto de las respuestas se conserva en el expediente de prueba y
en su bandeja de procesamiento; los identificadores de audio se retiran después
de procesar o caducar. Telegram conserva los mensajes según su propio servicio.

## Verificación y límites

- Pruebas automáticas cubren autorización, chat privado, enlace de un solo uso,
  flujo confirmado, cancelación, incertidumbre, repetición, respuesta antigua,
  credencial de cola y reintento de entrega.
- El resultado solo significa «el participante lo confirma o lo simula».
- Salida de voz con cola persistente; una caída justo después de enviar y antes
  de guardar el recibo puede repetir una nota (Telegram no ofrece idempotencia
  en `sendVoice`). No repite avances de estado ni crea llamadas telefónicas.
- No usar el envío a Telegram como prueba de escucha: verificar con Carlos el
  primer audio castellano y una respuesta de voz real antes de dar la demo por
  validada de extremo a extremo.
