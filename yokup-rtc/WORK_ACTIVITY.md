# Avance real de coordinación y ejecución

Al comenzar o retomar una misión y en cada hito o actividad real, el coordinador
usa `python3 scripts/fleet-progress.py` desde la raíz del repositorio. La misión
ya debe existir y estar asignada. Verifica primero la identidad y la sesión real;
no elijas una sesión por parecido ni copies la sesión CLI para un trabajo APP.

```sh
python3 scripts/fleet-progress.py --mission DCL-identificador-real \
  --owner OraculoMacMini --runtime Codex --host app --session-id desktop:codex \
  --activity coordination --detail 'Contrasto los resultados de QA y preparo la integración'
```

Las opciones `coordination`, `implementation` y `verification` describen la acción
que se está realizando. Escribe un detalle concreto (8–240 caracteres), sin
contenido privado ni secretos. La llamada es única: **no se instala en un bucle,
watcher, idle, presencia periódica ni tarea sin trabajo real**. Si continúa una
verificación larga, emite una actualización al realizar un nuevo contraste real.
La actividad caduca a los 120 segundos; que caduque no cierra la misión.

El helper llama al contrato público canónico `/fleet/progress` con `activity`
`{kind,detail}` y `work_session` `{runtime,host,session_id}`. Sólo declara éxito si
la respuesta contiene `work_binding.bound:true` y `work_activity.accepted:true`,
fecha y TTL válidos. Una API antigua o una sesión ambigua produce fallo explícito;
no debe comunicarse como avance aceptado. El emisor no altera cuentas, procesos,
ventanas ni automatismos, y no genera capturas. La evidencia visual conserva su
flujo independiente de [evidencia de proceso](PROCESS_EVIDENCE.md).

El servidor persiste la señal sólo mientras la misión permanece `in_progress`,
con dueño y máquina vigentes, tras vincular la sesión exacta. Un cierre concurrente
impide la escritura. El Highscore exige además proceso verificado de esa sesión
fresco (30 segundos), vínculo actual a esa misión y nacimiento anterior a la señal.
No basta un heartbeat o una app abierta. Reinicios, ambigüedad, otras interfaces o
caducidad no acreditan actividad. El cierre siempre gana.

`activity_at`, `activity_kind`, `activity_text`, `activity_basis` explican el avance
sin sustituir `work_started_at`, `ended_at`, `work_progress_at`, puntuación o
`race_revision`. Renovar la actividad no reinicia las vueltas. La candidatura de
coordinación vigente puede sustituir a una subtarea de la misma familia en la única
pista de esa familia; no crea un segundo corredor ni puntos. Los emisores anteriores
sin `activity` siguen siendo compatibles, pero no renuevan esta señal explícita.
