# Admirito iPhone → Fold Player · 17 octubre 2026

Implementado por OraculoMacMini. iPhone build 23 y Android 0.1.1 instalados físicamente.

## Resultado real

La prueba XCTest en el iPhone pulsó los controles nativos y comprobó, para cada fallo, el acuse de ejecución y dos muestras recientes distintas: popup, giro, proporción, media pantalla, barra de título y pausa. Recuperación confirmada tras cada caso. `iphone-cycle.txt` conserva únicamente los resultados sanitizados.

El Fold reproduce una copia pública de la playlist de laboratorio Starbucks del MacBook Pro 16, con productor y cola propios. No se modifica la emisión del MacBook. El destino es una ranura pública fija de laboratorio: no sirve para provisionar ni autorizar pantallas de clientes.

Supervisor describe las mediciones reales del player y la pieza emitida. No se presenta esta telemetría como una comprobación óptica ni como prueba del audio. La barra es una capa de laboratorio, no una ventana real del sistema Android. Esta prueba no abre tickets ITIL.

## Verificación técnica

- iOS: pruebas de interpretación conservadora, medidas incompletas y caducidad, compilación firmada e instalación física.
- Android: release firmada, lint y modo Player físico a pantalla completa.
- Admira TV: 27 pruebas de superficie del player.
- API: 324 pruebas, incluidos reloj reciente y rechazo de fingerprint distinto. Sin nuevas escrituras KV para latidos idénticos.

## English

All six fault/recovery cycles passed on the real iPhone controlling the Fold player. Reports distinguish device telemetry from camera/audio evidence. The fixed public laboratory slot is not customer-device authorization. Unknown speech is not converted into guessed commands.

## Prueba acústica adicional

La frase hablada por el Mac «Muestra un aviso» fue captada por el iPhone, activó el popup y obtuvo dos muestras recientes con emisión tapada. «Restaura la imagen» no pasó: se transcribió voz del ambiente y no se ejecutó una restauración. No se considera validada la secuencia completa por voz en esta sala. La recuperación mediante el control nativo sí pasó. No se aproximan frases irreconocibles a órdenes peligrosas.
