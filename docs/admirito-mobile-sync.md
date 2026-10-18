# Player móvil: por libre y sincronizado / Mobile playback modes

En Experto, abre el player y selecciona proyecto, local y dispositivo IoT. Ambos teléfonos usan la playlist asignada con identidad propia. Los botones «Por libre» y «Sincronizado» cambian el modo del renderer canónico de Admira.tv. El cambio es local a ese teléfono.

Por libre usa su propio inicio. Sincronizado consulta el reloj central de brain.digitalavatar.ai y adapta solo la lectura del tema de su identidad virtual a la misma playlist seleccionada. No publica temas, no modifica el origen y no usa el contenido del máster global. La superficie permanece oculta mientras no confirma los elementos asignados. El estado muestra pieza, tiempo de vídeo y diferencia respecto a la posición que calcula el reloj canónico. Las duraciones y el orden de la playlist forman la línea de tiempo compartida; no se simula pulsando Play a la vez.

Vídeo silenciado. Necesita red para obtener reloj y medios. «Esperando reloj y playlist sincronizada» indica que aún no se acredita la reproducción sincronizada. Las diferencias publicadas son medidas del navegador, no una garantía de sincronización al fotograma.

## English

Open the on-device player from Expert and choose the same project, location and IoT on both phones. Independent mode starts locally; synchronized mode uses the canonical central clock and the selected assigned playlist, while retaining independent virtual identities. Native buttons switch the canonical renderer mode. Read-only interception supplies that virtual identity’s own theme without writing to the source IoT or global master. The assigned-content visibility guard remains active. Native status reports item index, decoded media time and measured offset against the canonical clock. Playback is muted; network and decode delays still apply. Measured offset is not a frame-lock guarantee.

## Acceptance

Release 20261018.7: iOS build32, Android versionCode10. Both builds and Android release lint passed; three Android contract tests passed on-device. iPhone Expert UI passed free playback (0→5 seconds) and synchronized playback (measured offset 0.03–0.42 s). Fold synchronized playback measured 0.04–0.05 s before its USB connection was lost. Joint optical acceptance remains pending; live Insta360 confirms iPhone video while the Fold is on the Admirito home. [Evidence](evidence/admirito-mobile-sync-2026-10-18/verification.json).
