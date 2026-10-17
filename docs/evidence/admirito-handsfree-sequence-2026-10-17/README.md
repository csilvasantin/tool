# Admirito · secuencia de presentación sin pulsación · 17 octubre 2026

Build 16 ya instalado; no se modificó ni desplegó código de producto. Se preparó la pantalla y se activó la escucha local una vez con automatización de desarrollo. Después no se pulsó la nube, el teclado ni ningún control del iPhone para enviar las órdenes. El Mac reprodujo voz por altavoces hacia el micrófono real.

Protocolo probado: «Hola, Admirito», esperar el feedback y apertura de captura, decir la orden, esperar respuesta final y rearmado local. Se repite el nombre para cada orden. No se acredita una sola frase corrida «Admirito, siguiente» ni órdenes posteriores sin volver a llamarlo.

Resultados de Firefox en su pestaña Alsea existente:

- Encargo #6397 · siguiente por activación de voz: 1/62 → 2/62; respuesta recibida y voz finalizada en el iPhone.
- Encargo #6398 · anterior por activación de voz: 2/62 → 1/62; respuesta recibida y voz finalizada; escucha local rearmada automáticamente.
- Encargo #6400 · repetir parada solo por voz: ensayo activo 12:11; detenido en 12:17, «Continuar tiempo» y pausa escénica activada; segunda observación mantuvo 12:17. Respuesta real y voz finalizada comprobadas posteriormente.
- Encargo #6401 · continuar por activación de voz: desde 12:17, pausa desactivada y «Pausar tiempo»; segunda observación 12:38, lámina final 1/62. Al reabrir la comprobación el contador de lámina de la página mostró transitoriamente 2/62 mientras el estado pausado conservaba 1/62; al quitar pausa se restableció 1/62. No se oculta esta discrepancia entre controles de la página.

Fallos y alcance:

- Primer intento de «siguiente» se transcribió «CD&V»; encargo #6396 · pedir aclaración de voz, sin movimiento.
- «Para la demo» se transcribió inicialmente «Gracias»; encargo #6399 · respuesta a frase mal transcrita, sin parada. Se repitió llamando a Admirito y volvió a llegar la orden correcta, sin tocar el iPhone.
- La secuencia automática completa falló: agotó 150 s de espera al repetir la parada. Por tanto no se declara aprobado un recorrido limpio de cuatro órdenes al primer intento.
- La observación posterior de la parada tuvo un primer fallo del harness: buscó el texto final cuando la pantalla ya mostraba de nuevo el aviso de escucha local. Se corrigió solo el observador para verificar finalización de voz y continuar sin acciones de UI.
- Sigue pendiente mejorar el reconocimiento acústico de órdenes cortas y soportar/comprobar la frase seguida sin esperar feedback. Control real asíncrono mediante agente; no una conexión directa instantánea a Firefox.

El observador final, sin lanzar/activar/pulsar la app, terminó aprobado en 131,0 s: finalización de voz de la parada, nuevo despertar acústico, captura de «continúa la demo», respuesta «Reanudación comprobada» y voz finalizada. La escucha local se rearmó después. Este resultado aislado no convierte en aprobada la secuencia completa que falló.
