# Admirito · Bugito, Supervisor y mirada del Mac · 17 octubre 2026

Build 17 corporativo firmado e instalado en el iPhone. Código principal 3685f39 · canales de mascotas y cursor local; dc52bcd · botones superiores y nombres de voz. API publicada mediante el script canónico, dos publicaciones en esta intervención, con pruebas completas del script aprobadas. Última versión de worker df25f8de-a4d8-4bd3-a007-2aa9b485b9fb. No se desplegó el sitio web.

## Interfaz comprobada

Supervisor a la izquierda y Bugito a la derecha, encima de la mascota. Los botones cambian canal, SVG, título, tono de fondo y controles. Supervisor usa una variante azul; Bugito reutiliza el SVG rojo con cuernos de la plataforma. No desencadenan fallos físicos al seleccionarlos. Las invocaciones de voz exactas y la variante ortográfica «Bujito» se reconocen en las reglas nativas. «Vuelve a Admirito» restaura el canal original.

- Prueba física de posiciones y selección aprobada: MASCOT_LEFT_SUPERVISOR_RIGHT_BUGITO_VERIFIED. Capturas revisadas visualmente; confirmación también por cámara, sin moverla ni cambiar sus ajustes.
- [Bugito en el iPhone](bugito-iphone.png), [Supervisor en el iPhone](supervisor-iphone.png).
- 23 pruebas nativas, 2 omitidas por límites del simulador, cero fallos; build firmado de dispositivo aprobado. Ocho pruebas enfocadas del relay aprobadas, además de las verificaciones completas de despliegue.

## Canales reales y límites operativos

Bugito y Supervisor son canales de mascota operados por el agente real Oráculo del MacMini, con esa identidad declarada. No se crearon procesos de agentes autónomos ni otro monitor de cámara. Invocarlos genera un encargo real; las peticiones siguientes se dirigen al canal seleccionado. La invocación sola no modifica equipos.

Encargo #6416 · presentación real del canal Bugito, respondido. Encargo #6418 · repetir comprobación del canal Bugito, respuesta recibida por el iPhone. Encargo #6419 · presentación real de Supervisor, con consulta viva de player_status del MacBook Pro 16. La prueba de menús recibió Bugito; el observador de Supervisor falló por una carrera de accesibilidad al cambiar a la pantalla de mascota, aunque el encargo real llegó y se respondió. No se declara aprobada esa secuencia completa.

Las pruebas físicas por voz no quedaron aprobadas: se transcribieron «Involta» y «Bujito» sin verbo completo, enviadas como consultas de aclaración. Se amplió el contexto de nombres propios en transcripción con Bugito y Supervisor y el alias exacto «invoca a Bujito», sin aceptar acciones adicionales ni convertir una frase desconocida en una ejecución. Una repetición sincronizada con command_ready tampoco acredita por sí sola una invocación completa correcta. El control por botones está verificado; queda pendiente estabilizar y repetir la prueba por voz.

## MacBook Pro 16 y supervisión

Se envió Wake-on-LAN al registro configurado, sin respuesta inicial. Carlos lo arrancó manualmente. Después respondió por SSH/Tailscale y su player AdmiraSignageMac 1.7.1 ya estaba funcionando con screen macbookpro16; no se atribuye ese arranque a WOL. No se abrieron ventanas ni navegadores en ese equipo ni se cambió su disposición.

Lecturas reales de player_status/on_air/signage/now: señal reciente y contenido en vídeo, entre ellos «Your next pause starts here · EN · individual», «Volvemos a empezar · ES · mural» y «Tu próxima pausa empieza aquí · ES · individual». Audio muted=true, level=0, analyzed=false. Es reproducción comunicada por el player, no prueba óptica de esa pantalla ni prueba acústica. La API identifica la pieza pero no expone el nombre de la playlist: no se inventa ni se deduce de las notas de una presentación.

La prueba de pausa reversible sobre macbookpro16 fue rechazada por el MCP de control por falta de credencial de escritura válida. La identidad de flota configurada tampoco fue admitida por ese destino (403). No se provocó el fallo, no se debilitó la autorización ni se abrió un ticket de avería ficticio. Bugito físico y la identificación completa de playlists de pantalla/audio siguen pendientes.

## Mirada del ratón

Servicio local de solo lectura en Tools/mac-gaze.swift: Bonjour _admira-gaze._tcp, nombre Admirito MacMini. Publica x/y normalizados, no teclas, clics, capturas ni órdenes de control. iPhone opt-in mediante el botón de cursor y permiso Red local; recibe mientras la mascota está abierta y descarta datos sin frescura tras dos segundos. Admite conexión local entre pares; no publica cursor por Internet. El servicio no se instala como inicio automático y se detiene terminando el proceso.

Primera conexión no recibió datos dentro de la espera del test. Repeticiones: conexión fresca aprobada; prueba final de red y capturas aprobada en 45,3 s. El helper registró variaciones de coordenadas reales; movimientos del cursor mediante CUA produjeron dos capturas del iPhone con centro del ojo izquierdo (555,51;1494,46) → (557,08;1493,56), en píxeles nativos. No se desplazan ventanas. Se revisó también la cámara; para el pequeño desplazamiento de ojos se usan capturas nativas, no una imagen de cámara ampliada artificialmente. El servicio sigue coordenadas del monitor que contiene el cursor, sin inferir geometría física a partir de la cámara.

Estado final: lanzamiento normal sin el argumento que desactiva animaciones, vuelta a Admirito y orientación horizontal. Prueba física NORMAL_LANDSCAPE_WITH_MASCOT_BUTTONS_READY aprobada (10,2 s): ambos selectores, cierre y cursor están dentro de pantalla y son pulsables. El servicio de mirada local queda ejecutándose para la función solicitada.
