# Admirito · demo en ordenador de destino · 17 octubre 2026

Implementación: `b5459f7` · demos por voz con ordenador de destino. App build 14 instalada por USB. API publicada `v.17.10.2026.r3.19:05`, comprobada en https://api.admira.biz/version.json.

Orden: «Admirito, demo Alsea en MacMini». El iPhone envía una petición estructurada al agente del MacMini. URL canónica de Alsea y navegador Firefox se resuelven en servidor desde un catálogo compartido; no se aceptan URL, shell o destino libre del teléfono. La app permanece como control por voz y espera la verificación del ordenador antes de anunciar éxito.

Pruebas: 22 nativas (2 omitidas, cero fallos), 23 de API (cero fallos), conjunto y guardas del despliegue canónico. Se comprueba selección de destino, alias Mac Mini, rechazo de demos/equipos desconocidos, URL arbitraria ignorada, autorización, propiedad del hilo e idempotencia.

Catálogo: Alsea, global, Studio/Pixeria, Store/XpaceOS, TV, App/Yokup y Biz. Destino conectado inicial MacMini/Firefox. La prueba física de esta entrega se centra en Alsea. La ejecución usa la bandeja asíncrona del agente del ordenador: un ACK no prueba que Firefox haya abierto la página; un equipo no disponible queda pendiente o devuelve un fallo real, sin reenviar automáticamente.
