# Evidencia de proceso desde el inicio

`tools/mission-evidence.sh` publica una captura de proceso ya en `heartbeat`,
antes de esperar al primer refresco periódico. La procedencia se determina por
la superficie real; no se acepta como una declaración libre del llamador:

- Desktop: `capture_surface=desktop`, `capture_context=request`. AgoraCapture
  sólo actúa si la aplicación correspondiente a la ejecución está al frente, de
  modo que la petición sea visible.
- CLI: `capture_surface=cli`, `capture_context=command_output`. Se captura el
  pane tmux indicado y se exige contenido suficiente para mostrar comando y
  salida.

Uso habitual:

```sh
# Desktop: captura inicial mediante AgoraCapture.
mission-evidence.sh heartbeat DCL-ejemplo

# CLI: el watcher publica el pane desde el primer latido.
progreso-cli.sh DCL-ejemplo nombre-sesion
```

`progress --image` no puede crear evidencia canónica de proceso. La opción
manual se conserva para `final --image`; también puede almacenarse como
`--final-fallback`, marcado expresamente como degradado y nunca presentado como
Proceso. Si no se puede validar la aplicación Desktop, AgoraCapture o el pane
CLI, el comando termina con error antes de publicar evidencia.

## Política de aceptación y cierre

`POST /fleet/progress` acepta `evidence_kind=process` únicamente con una de
estas parejas: `desktop/request` o `cli/command_output`. `web`, `browser` y
`result_page` se rechazan; una captura de la solución publicada sólo puede ser
la prueba final, nunca el Proceso. La respuesta confirma `evidence_updated`,
`capture_surface` y `capture_context`, y `/fleet/missions` conserva esos campos
para auditoría.

Todo cierre nuevo, tanto por `/fleet/informe` como por la última llamada a
`/fleet/task-status`, exige una captura `process` canónica tomada después del
inicio de la misión. `final-fallback` no la sustituye. Si falta o su procedencia
es inválida, el servidor devuelve `applied:false` antes de auto-reclamar la
misión, crear eventos o planes, actualizar tareas, avisar a Telegram o guardar
la prueba final.
