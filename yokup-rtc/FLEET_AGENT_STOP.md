# Control protegido de agentes

`POST /fleet/agent/control` es el contrato canónico de Highscore para gobernar una
superficie exacta. Acepta `action:"start"|"stop"`; ambos caminos exigen sesión
Google y dejan auditoría en `fleet_agent_commands`.

`POST /fleet/agent/stop` permite a una sesión Google autorizada solicitar la
parada de **un proceso concreto** visto en la presencia viva de la flota. Se
conserva como alias compatible para clientes anteriores.

```json
{
  "machine": "MacMini",
  "persona": "Oráculo",
  "runtime": "Codex",
  "host": "app",
  "session_id": "desktop:codex",
  "pid": 4321
}
```

Los seis campos son obligatorios. `persona` puede ser la persona base exacta del
snapshot o su identidad operativa completa si el apellido coincide exactamente
con `machine` (`OraculoMacMini` → `Oráculo` en `MacMini`). Yokup vuelve a leer
`https://telegram/api/presence` mediante el binding `TELEGRAM` y exige una única
fila `process_snapshot`, verificada y con antigüedad máxima de 30 segundos. Una
sesión antigua, legacy o ambigua devuelve `409` y no genera el mando.

Tras validar, Yokup envía el target confirmado a
`https://telegram/api/fleet/agent/stop` mediante el mismo binding. Una aceptación
devuelve HTTP `202` y exclusivamente:

```json
{"ok":true,"command_id":42,"status":"queued"}
```

Los intentos quedan en `fleet_agent_commands`, con solicitante Google, target,
estado y el identificador saneado del comando. El navegador nunca recibe datos
internos del ejecutor ni credenciales del servicio.

Para `start`, el navegador envía la misma identidad sin PID. Admira Telegram sólo
acepta el arranque si el watcher de esa máquina está fresco y ha anunciado la
ranura exacta `{persona,runtime,host,session_id}`. El watcher local limita APP y
CLI a runtimes instalados, comprueba que no exista ya el proceso y vuelve a censarlo
antes de confirmar. Un reintento devuelve `already_running` en vez de duplicarlo.
