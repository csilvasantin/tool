# Bonus Track de Running Man — contrato canónico

Encargo de Carlos: un punto gratuito por carrera ganada, un «+1» junto al ganador
y el punto registrado en su misión. Misión Yokup `DCL-1e1c17f16c096cf579650906`
(`2627.05/09/2026.22:42`). Ayuda humana: <https://www.yokup.com/help#bonus-track>.

## Regla publicada

Yokup sortea una única carrera compartida de 42 segundos: 3 de salida, 24 de
sprint y 15 de celebración. El primero alcanza la meta a los 23 segundos
(3 + 20); el orden se decide en el servidor, independientemente del ranking.
Si hay varios participantes, no repite el ganador de la vuelta anterior.
Solo compiten por el bonus las familias con `state:running` y trabajo de tipo
`mission` o `task` en `/highscore/active-work`. La tarea acredita a su misión
padre. Las sesiones sin misión y los corredores grises no pueden ganarlo.
El filtro visual del navegador no cambia el sorteo compartido.

Al llegar a meta, el navegador pide confirmar la victoria. El servidor exige
que sigan coincidiendo familia, referencia y misión abierta. Una comprobación
SQL final impide premiar una misión cerrada, reasignada, cambiada de máquina,
o una tarea ya terminada. Una vuelta sin participantes tampoco puntúa.
No hay premios retroactivos anteriores a la publicación.

Un «+1» significa un punto ya persistido. No se anticipa el incremento en
localStorage. Reintentos, pestañas y recargas recuperan el mismo recibo.
Una pausa conserva la animación local, pero no detiene el reloj compartido:
la confirmación caduca a los 84 segundos desde la salida. Sin conexión no se
inventa el premio. El ranking recoge el punto en su próximo refresco normal.
No se hacen llamadas a modelos de IA ni se cobra al usuario por este bonus.

## API y persistencia

`POST https://api.yokup.com/highscore/race`, JSON:

- `{"action":"start"}` devuelve `{ok,race}` con `id`, `started_at`, `finish_at`,
  `ends_at`, `server_now`, `roster` ordenado y `bonus_points:1`.
- `{"action":"finish","race_id":"…"}` devuelve un recibo `awarded:true`,
  `points:1`, `mission_id`, `agent`, `won_at`, `race_id`. Un reintento puede
  añadir `duplicate:true`; no es un segundo punto.
- Códigos sin premio: `too_early`, `unknown_race`, `race_expired`,
  `no_eligible_runner`, `work_changed`, `mission_changed`, `invalid_request`.

Es una operación pública del marcador. No acepta un ganador, importe,
fecha ni misión elegidos por el cliente. Si hay cabecera Origin, debe ser
`https://yokup.com` o `https://www.yokup.com`. La respuesta no se cachea.

`src/race-bonus.js` crea aditivamente `highscore_running_rounds` al primer uso.
Una sola sentencia INSERT condicional arbitra los inicios concurrentes.
Las vueltas se conservan 24 horas; el recibo queda para siempre en `events`:
`kind='race_bonus'`, autor físico canónico, ticket de la misión, instante de
meta y texto `Bonus Track +1 · carrera <uuid>`. El índice parcial único
`race_bonus_once` impide dos premios para una misma carrera; `race_bonus_time`
permite consultar los premios por fecha. No se modifica `tickets.updated_at`,
actividad autenticada, temporizadores, evidencias ni estados de tareas.

El bonus se suma en los totales diarios, horarios, históricos, ranking por
proyecto y snapshots de puntos de inicio/cierre. `race_bonus_points` mantiene
el desglose separado de `task_points`: una victoria no es una tarea.
`/ticket?id=…` muestra el acumulado y cada recibo en la ficha; los listados de
misiones añaden el bonus a sus puntos. `/highscore/daily.traceability.race_bonuses`
permite rastrearlo incluso si la misión empezó otro día. La fecha de meta fija
el periodo de puntuación en Europe/Madrid; no cambia al cerrar la misión.

## Validación y publicación

Pruebas de comportamiento: `test/race-bonus.test.mjs`,
`test/highscore-daily.test.mjs`, `test/highscore-history.test.mjs`,
`../yokup-site/highscore-race-bonus.test.mjs`. Cubren concurrencia, reintentos,
misión cerrada/reasignada, trabajo cambiado, caducidad, alias físicos, tarea
padre, periodos, proyectos, respuesta tardía y ausencia de conexión.
Se comprueba además el +1 en navegador de escritorio, móvil y movimiento
reducido con respuestas simuladas (sin regalar puntos de prueba en producción).

Publicar primero la API con `deploy.sh` desde main remoto exacto y limpio;
después el sitio con su `deploy.mjs` canónico. Los índices y tabla son aditivos.
Un rollback conserva los recibos; no borrar eventos ya ganados. Para revertir
solo la UI, no cambiar la contabilidad de victorias legítimas anteriores.
La verificación pública y los sellos exactos se registran al terminar en la
misión indicada arriba y en el apartado final de este documento.

Verificación previa a publicar (05/09/2026): suite de API 1.073 pruebas
correctas, una omitida; sitio 1.378 pruebas correctas, más una comprobación
posterior del rechazo de contratos de carrera incompatibles. Navegador real
headless: escritorio 1280×900, móvil 390×844 y movimiento reducido; un único
+1 y una única solicitud de premio por vista, cero errores JS y desbordamientos.

## Publicación y verificación reales · 05/09/2026

- Código publicado: `aa7018350ae2cabf5b46fe55e53d4553efb76a16`.
- API: `v.05.09.2026.r14.22:58`, worker `ec154d82-6757-4e90-af3d-c04420b6dce3`.
- Web y gate: `v.05.09.2026.r25.22:59`, contenido público verificado con HTTP 200.
- Producción anterior y main coincidían salvo el sello antes del despliegue.
- Carrera real `a549e213-dff9-4718-b70c-0fb7a0b834cd`: ganó `OraculoMacMini`, misión
  `DCL-1e1c17f16c096cf579650906`. Su bonus diario pasó de 0 a 1.
  La confirmación anticipada fue rechazada; el reintento devolvió
  `duplicate:true`, con un único evento. La traza diaria y la del proyecto
  contienen el punto. Verificado a las `2026-09-05T21:00:50.052Z`.
- Chrome con la sesión existente mostró el aviso de victoria y 1.651 puntos
  de Oraculo tras ese primer bonus. No se simuló actividad para concederlo.
- 1.379 pruebas del sitio incluidas en el deploy; 1.073 pruebas API correctas
  y una omitida. La nueva prueba adicional rechaza respuestas incompatibles.
- Una edición paralela sin commit en el checkout principal quedó intacta;
  se publicó desde una copia main limpia, sin forzar ni descartar sus archivos.

El registro de misión conserva los informes y la evidencia final del cierre.
