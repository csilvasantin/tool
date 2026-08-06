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
