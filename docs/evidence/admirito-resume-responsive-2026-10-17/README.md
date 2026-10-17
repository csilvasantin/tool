# Admirito · continuar demo y pantalla adaptable · 17 octubre 2026

Build 16 firmado e instalado por USB. Nuevo control exacto «continúa la demo», también «reanuda la demo», sin aceptar acciones añadidas. Usa el canal asíncrono del agente real y conserva pestaña y lámina. No es control remoto instantáneo.

La pantalla de mascota reserva espacio para cabecera y estado antes de dimensionar la nube. Los controles de cabecera se compactan y el SVG conserva el dibujo completo, con espacio superior para las animaciones; se elimina el viewBox recortado de horizontal.

Validación: 23 pruebas nativas, 2 omitidas por limitaciones del simulador y cero fallos. Build de dispositivo firmado aprobado.

- Primera prueba de audio: la transcripción produjo «Continua la vela». Encargo #6394 · aclarar orden mal transcrita: se pidió repetir y no se cambió Firefox. La espera del test falló porque no recibió la reanudación esperada; no se oculta ese fallo.
- Segunda prueba, frase hablada más despacio y pulsación de cinco segundos: encargo #6395 · reanudar ensayo Alsea por voz. Llegó el control exacto «continúa la demo». Firefox partía de 01:09, «Continuar tiempo» y pausa escénica activada. Se reanudó: pausa escénica desactivada, «Pausar tiempo» y observaciones 01:10 → 01:27. Misma pestaña y lámina 1/62. Respuesta «He reanudado la demo en Firefox del MacMini» recibida por el iPhone; voz completada. Test físico aislado aprobado, 113,5 segundos, incluida espera de ejecución y respuesta del agente.
- Layout físico: vertical 440×956 pt, superficie de mascota (16,118,67,408,667,33); horizontal 956×440 pt, superficie (78,50,67,800,287,33). Los botones de cerrar, palabra de activación, voz y pulsación, y el mensaje de estado están dentro de pantalla; botones accesibles y pulsables en ambas orientaciones. La prueba conserva capturas para revisión visual.

La reanudación comprobada corresponde al ensayo y pausa escénica de la presentación; no acredita reproductores externos ni vídeos de otras aplicaciones.

La repetición de layout esperando dos segundos tras cada rotación también pasó. Las capturas XCTest horizontales presentan un defecto de orientación/composición (EXIF 8 y zona negra), por lo que no se usan como prueba visual concluyente. Se corroboró con la cámara Insta360 en vista de escritorio: el iPhone físico horizontal muestra nube completa, cabecera y mensaje dentro de pantalla, sin zona negra ni recorte. La captura vertical muestra asimismo nube y controles completos. No se publican fotogramas de la habitación.
