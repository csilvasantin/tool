# Evidencia de proceso desde el inicio

`tools/mission-evidence.sh` publica una captura de proceso ya en `heartbeat`,
antes de esperar al primer refresco periódico. La procedencia se determina por
la superficie real; no se acepta como una declaración libre del llamador:

- Desktop: `capture_surface=desktop`, `capture_context=request`. AgoraCapture
  sólo actúa si **Codex Desktop** o **Claude Desktop**, según el runtime de la
  ejecución, está realmente al frente y la petición es visible. El cliente
  contrasta una lista cerrada de nombres y bundle IDs admitidos; no basta con
  que otra aplicación contenga «Codex» o «Claude» en el nombre. También exige
  una ventana frontal identificable (título y dimensiones válidas) y conserva
  la captura de pantalla completa producida por AgoraCapture, por lo que no se
  admite un recorte genérico aportado por el llamador. La petición debe quedar
  visualmente legible dentro de esa ventana completa.
- CLI: `capture_surface=cli`, `capture_context=command_output`. Se captura el
  pane tmux indicado y se exige contenido suficiente para mostrar comando y
  salida.
- Agente sin GUI: `capture_surface=agent`, `capture_context=session_transcript`.
  Se elige explícitamente con `--transcript <fichero>` y nunca por degradación
  desde Desktop. El transcript debe haberse escrito hace menos de 2 minutos y
  contener las tres cosas que un pane enseña por construcción —una línea
  `PETICIÓN: …`, al menos un comando `$ …` y su salida debajo— **más el
  identificador de la misión**, que el pane no ata. Se renderiza igual que el
  pane; la identidad la firma el runtime (regla 15).

  Existe porque exigir Desktop al frente era una carrera contra las manos del
  dueño de la máquina y dejaba fuera a todo agente que trabaja sin GUI (cron,
  remoto, subagente) o mientras el ordenador se usa. El pane de tmux nunca fue
  la prueba: es el papel donde se imprime. Lo que acredita es el texto y quién
  lo firma. El foco de ventana no defiende de un agente deshonesto —quien puede
  falsear el transcript puede falsear el pane que él mismo controla— y sí impide
  cerrar a los honestos.

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
Proceso. Chrome, Firefox, páginas web y cualquier aplicación no reconocida se
rechazan como superficie Desktop aunque muestren el resultado. El error indica
el nombre y bundle ID de la aplicación frontal. Si no se puede validar la
aplicación Desktop, AgoraCapture o el pane CLI, el comando termina con error
antes de publicar evidencia. Esta comprobación acredita app, bundle, ventana y
captura completa; no ejecuta OCR ni afirma haber leído automáticamente el texto
de la petición.

## Política de aceptación y cierre

`POST /fleet/progress` acepta `evidence_kind=process` únicamente con una de
estas parejas: `desktop/request`, `cli/command_output` o
`agent/session_transcript`. Cada superficie admite un único contexto y no se
cruzan. `web`, `browser` y `result_page` se rechazan; una captura de la solución
publicada sólo puede ser la prueba final, nunca el Proceso. La respuesta confirma `evidence_updated`,
`capture_surface` y `capture_context`, y `/fleet/missions` conserva esos campos
para auditoría.

Todo cierre nuevo, tanto por `/fleet/informe` como por la última llamada a
`/fleet/task-status`, exige una captura `process` canónica tomada después del
inicio de la misión. `final-fallback` no la sustituye. Si falta o su procedencia
es inválida, el servidor devuelve `applied:false` antes de auto-reclamar la
misión, crear eventos o planes, actualizar tareas, avisar a Telegram o guardar
la prueba final.
