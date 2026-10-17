# Admirito · demo en ordenador de destino · 17 octubre 2026

Implementación: `b5459f7` · demos por voz con ordenador de destino. App build 14 instalada por USB. API final `v.17.10.2026.r4.19:13`, commit `128a066`, comprobada en https://api.yokup.com/version.json. Vocabulario de órdenes en `bdda6d3`; variante de frase natural en `ba48ee4`.

Orden: «Admirito, demo Alsea en MacMini». El iPhone envía una petición estructurada al agente del MacMini. URL canónica de Alsea y navegador Firefox se resuelven en servidor desde un catálogo compartido; no se aceptan URL, shell o destino libre del teléfono. La app permanece como control por voz y espera la verificación del ordenador antes de anunciar éxito.

Pruebas: 22 nativas (2 omitidas, cero fallos), 23 de API (cero fallos), conjunto y guardas del despliegue canónico. Se comprueba selección de destino, alias Mac Mini, rechazo de demos/equipos desconocidos, URL arbitraria ignorada, autorización, propiedad del hilo e idempotencia.

Catálogo: Alsea, global, Studio/Pixeria, Store/XpaceOS, TV, App/Yokup y Biz. Destino conectado inicial MacMini/Firefox. La prueba física de esta entrega se centra en Alsea. La ejecución usa la bandeja asíncrona del agente del ordenador: un ACK no prueba que Firefox haya abierto la página; un equipo no disponible queda pendiente o devuelve un fallo real, sin reenviar automáticamente.

## Prueba física final

- Orden pronunciada por los altavoces al iPhone durante una pulsación de seis segundos: «Abre la demo de Alsea en el Mac Mini». No se inyectó texto para ejecutar la orden.
- Captura terminada 17:14:31 UTC; aviso de ejecución 17:14:33–37; aviso de espera 17:14:39–45. La petición llegó como encargo #6388 · demo Alsea para Firefox del MacMini.
- OraculoMacMini recibió el encargo y abrió una pestaña nueva en Firefox del MacMini sin mover ni redimensionar ventanas. Se conservaron las pestañas anteriores.
- La ruta del catálogo redirigió a https://www.admiranext.com/presentaciones/alsea-starbucks/presentacion?lang=es. La interfaz mostró «Alsea · Starbucks · Presentación», «Quiénes somos · 1/62». Se comprobó avance con flecha abajo a 2/62 y vuelta a 1/62. No se afirma reproducción automática de toda la presentación ni funcionamiento de todas sus demos internas.
- Solo después de esta comprobación se contestó al encargo. El iPhone recibió la confirmación «Demo Alsea abierta en Firefox del MacMini». Prueba USB final superada en 104,4 segundos; lectura de confirmación iniciada 17:16:03 UTC.
- Dos intentos anteriores no entendieron correctamente el nombre Alsea y no ejecutaron acciones. Se añadió vocabulario de nombres propios y filtro de voz únicamente al dictado de órdenes, además del menú táctil alternativo. El reconocimiento sigue dependiendo del audio recibido; las frases inciertas se rechazan, no se convierten en órdenes por aproximación.
