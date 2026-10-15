# Bugito por Xpacios · verificación del 15 de octubre de 2026

Producción comprobada: admira.biz **v.15.10.2026.r9.21:53**, revisión `87c4f6f` (órdenes Bugito y vínculo de equipo). API canónica **v.15.10.2026.r4.21:44**, revisión `d94147b` (totales de incidencias por establecimiento).

- **INC-YIQQL3 · popup normal en Paseo de Gracia**: ticket abierto, punto amarillo y equipo resuelto canónicamente como **PDG103-PAN-01 · pantalla 1 del mural**. [Ficha](https://www.admira.app/ticket?id=INC-YIQQL3) · [Mapa](https://www.admira.biz/?locationId=alsea-sbux-021).
- **INC-YIRYHE · incidencia total en CDMX Madero**: ticket abierto y punto rojo. [Ficha](https://www.admira.app/ticket?id=INC-YIRYHE) · [Mapa](https://www.admira.biz/?locationId=alsea-mx-sbux-06-cdmx).
- La repetición de la orden normal devuelve el mismo identificador. La lectura posterior devuelve exactamente una incidencia activa por establecimiento.
- Un establecimiento de control sin incidencias aparece verde. Los clusters conservan la prioridad máxima; cerradas y canceladas no cuentan.

Evidencia real: [mapa amarillo](https://api.yokup.com/media/fleet/bd8b7e02b74acfc8.png), [mapa rojo](https://api.yokup.com/media/fleet/a8876055c71140dc.png), [ficha con equipo](https://api.yokup.com/media/fleet/450c04ad39ca41d9.png). El navegador cargó fichas y puntos reales; cero errores de página y formulario móvil sin desbordamiento. Los tickets siguen abiertos para gestión.

Se cancelaron por la API autenticada las dos primeras pruebas sin vínculo de equipo, conservando historial y nota de sustitución: INC-YCI01V · primer popup sin vínculo, e INC-YCZWQW · primera incidencia total sin vínculo. No son los casos finales.

Validación: **53 pruebas enfocadas pasan**, más las dos de marca Alsea incorporadas concurrentemente a main; **1366 RTC pasan y una omitida**. La batería general de Biz conserva los mismos ocho fallos presentes en la revisión base, sin regresiones nuevas. La publicación automática falló por Cloudflare 10500; se publicó manualmente desde main exacto y limpio con la credencial configurada. Se canceló el reenvío automático del mismo commit ya publicado para evitar duplicar el despliegue.

Son incidencias de prueba explícitas y persistentes: estas órdenes registran tickets, no demuestran una avería ni mandan fallos al hardware. La ronda física de cinco minutos del MBP16 sigue pendiente por ausencia de señal del reproductor; se retiró su sesión temporal, se reanudó el capturador y la automatización antigua permanece pausada. No se ha movido la cámara ni iniciado otro Supervisor.
