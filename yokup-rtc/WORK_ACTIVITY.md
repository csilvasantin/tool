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
no debe comunicarse como avance aceptado. El transporte usa el identificador propio `YokupFleetProgress/1.0`; no simula un
navegador. Esta ruta es pública y no necesita credenciales. El cliente predeterminado
de Python recibió HTTP 403 antes de llegar al contrato, mientras que el identificador
propio obtuvo aceptación real. El helper distingue rechazo HTTP y fallo de red sin
volcar cuerpos de respuesta ni secretos. No reintenta automáticamente.

El emisor no altera cuentas, procesos,
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

## Emisor común Desktop: recuperar el trabajo actual

`tools/mission-evidence.sh` (instalado en `~/Claude/admira-vault/mission-evidence.sh`)
admite el mismo avance explícito. Se usa desde el agente que realmente realiza
la acción, con su identidad resuelta y la sesión exacta comprobada:

```sh
YOKUP_HOST=app YOKUP_ROLE=main YOKUP_RUNTIME=Claude \
  bash ~/Claude/admira-vault/mission-evidence.sh activity FLT-identificador-real \
  --session-id desktop:claude --activity implementation \
  --detail 'Verifico el cambio que acabo de aplicar en la misión actual'
```

`activity` no captura pantalla, lee conversaciones ni mueve ventanas. No es un
heartbeat automático: se invoca al iniciar/retomar y en hitos de trabajo real.
Los mismos tres flags pueden acompañar `heartbeat` o `progress`; conservan su
flujo de evidencia y adjuntan la señal al mismo envío. `final` no admite actividad.
No se guardan misión, sesión ni detalle para reutilizarlos en futuras invocaciones.
El host debe ser explícitamente `YOKUP_HOST=app`; CLI sigue pausado por política.
Sin los tres flags, los modos de evidencia anteriores conservan su comportamiento
pero **no declaran actividad reciente**. La aceptación exige `bound:true`,
`accepted:true`, fecha, base y TTL del contrato; no se reintentan fallos ni se
presenta una API antigua como éxito.

La incidencia FLT-1827 mostró el límite: Claude APP seguía enlazado a la tarea
`b` ya terminada, mientras la misión principal no tenía actividad explícita.
Una app abierta o una declaración de presencia no permiten promover a la misión
padre ni a la siguiente tarea. El agente debe elegir el trabajo abierto que está
realizando ahora y publicar su avance real. Ese envío vuelve a enlazar su sesión
exacta; un cierre, sesión equivocada o CLI pausado se rechaza. El Highscore conserva
inicio, duración y revisión de carrera, y sólo recupera actividad durante su TTL.
