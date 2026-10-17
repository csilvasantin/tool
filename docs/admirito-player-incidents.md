# Bugito iPhone → incidencias → Supervisor Insta360

17 octubre 2026 · OraculoMacMini · laboratorio Fold exclusivo.

En el icono Player del Fold de la mascota, provoca una trastada y pulsa **Foto y abrir incidencia**. La cámara trasera del iPhone permite encuadrar y aceptar una foto real. No se sustituye por una captura de la Insta360. El servidor consulta la señal reciente del Fold y añade el fallo comunicado, la pieza y la foto al ticket canónico de admira.app. La foto por sí sola no es una detección óptica automática.

La foto y su identificador de petición quedan guardados en el iPhone hasta confirmar el ticket. Reintentar conserva la misma petición; no abre otra incidencia. La foto debe haberse capturado en los últimos dos minutos. Si queda antigua, descártala localmente y toma otra; esto no elimina tickets remotos. El último ticket sigue disponible tras reiniciar la app.

**Verificar con Insta360** envía una petición al canal real de Supervisor. El operador reutiliza la cámara y el encuadre existentes, revisa visualmente la recuperación y adjunta dos capturas diferentes con al menos un segundo de separación, cada una acompañada de una lectura nueva y saludable del player. Solo la segunda puede cerrar el ticket. Una recaída invalida la primera observación. Restaurar imagen no cierra incidencias automáticamente.

## Contrato

- `POST /agents/player-incidents`: JPEG real hasta 4 MiB, `X-Request-ID` UUID estable y `X-Captured-At` Unix ms. Sesión de cuenta o dispositivo Admirito iOS autorizado. Destino fijo `virtual-lab-admirito-fold`; no acepta pantalla arbitraria. Devuelve `{ok,id,url}`.
- `GET /agents/player-incidents/INC-…`: estado del ticket propio, o acceso del operador autenticado.
- `POST /agents/player-incidents/INC-…/recovery`: JPEG de la Insta360, `X-Captured-At`, `X-Camera-Source: macmini-insta360`, `X-Optical-Review: recovered`. Solo sesión completa del perímetro; un vínculo de conversación nunca cierra. El operador declara una revisión óptica real, no una atestación automática de hardware.
- Respeta tickets asignados a un técnico: no los cierra por este carril.
- Las fotos se adjuntan como los demás medios de evidencias de Yokup; conserva encuadre exclusivo del laboratorio y evita datos personales.

## Operador existente

No arranques otro vigilante, no muevas ventanas ni hagas PTZ. Con la captura revisada y su hora real:

```sh
python3 scripts/admirito-fold-supervisor.py INC-… /ruta/captura.jpeg --captured-at MILISEGUNDOS --reviewed-recovered
```

La utilidad no captura ni interpreta imágenes: las aporta el operador después de revisarlas en la Insta360. Autenticación oficial de agentes desde la bóveda, sesión solo en memoria, sin claves de flota en el iPhone. Repite con otra captura nueva y comprueba `status: resolved`. Si falta imagen o señal, deja abierta y documenta el motivo.

## English

Bugito reports a current laboratory Fold fault with a fresh photo captured by the paired iPhone. Retries reuse the same request ID. Supervisor uses the existing Insta360 and authenticates as an operator; paired conversation devices cannot close tickets. Closure requires two distinct operator-reviewed recovery photos plus two fresh healthy player readings. A relapse resets confirmation. This is operator-reviewed optical evidence, not automatic camera attestation.
