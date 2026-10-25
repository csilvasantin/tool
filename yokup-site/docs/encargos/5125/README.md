# Encargo #5125 · avatar digital en Yokup y Admira.app

Oráculo (consejero Walt) · OraculoMBP14 · 13-oct-2026.
Por orden actual de Carlos: solo rama y preview. No ejecutar `deploy.mjs`, no publicar a main ni desplegar el guardián.

La rama nace de origin/main `f0e20e3`. Incluye el PR tool #32, merge `8c96108d39f1ed0480258ffb2a382ad885bde008`.
El fetch funciona. El alojamiento real consultado hoy identifica ambos dominios en Cloudflare Pages `yokup`.
El repositorio antiguo `csilvasantin/admira-app` está deprecado; no se utiliza para esta entrega.

En la preview, abre Experto (esquina superior derecha):

- `/avatar` consulta el estado.
- `/avatarON` muestra el asistente y recuerda la elección en este navegador/origen.
- `/avatarOFF` lo oculta y recuerda la elección.
- `/avatar reset` vuelve al interruptor del proyecto.

El cargador compartido de admiranext.com ya está en main; no se reimplementa ni se cambia el interruptor global.
Flags reales consultadas en `www.yokup.com` y `www.admira.app`: `on:false`.
Una elección ON anterior del visitante tiene prioridad sobre el apagado del proyecto.
Las páginas con copiloto de flota evitan un segundo avatar; no se inyecta dentro de iframes.
El brain es `/avatar-ask`, dependiente de servicios externos. No se prueba conversación ni voz de pago.

«Jensen» identifica la solicitud original. El cargador actual ofrece Admirito/Luna/Neo;
esta entrega no incorpora ni acredita un retrato 3D de Jensen Huang.

[Tutorial oficial exportado](tutorial-5125.mp4): animación explicativa, no grabación de pantalla,
15 segundos, 1080×1920 H.264/AAC, sonido sintetizado sin locución.
[Brief y guion](tutorial-5125-brief.json).

El criterio histórico de publicación en producción queda pendiente de una orden expresa de Carlos.
La entrega actual se limita a revisar código existente, verificar controles y servir una preview.
