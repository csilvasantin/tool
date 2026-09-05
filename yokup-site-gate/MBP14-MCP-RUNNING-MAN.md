# Running Man y conexión MCP del MBP14

Registro canónico: Yokup **2741.05/09/2026.23:10** (`DCL-e610460e9da67737116f5972`). Responsable de esta corrección: OraculoMacMini, Codex APP. Fecha: 5 de septiembre de 2026.

## Hechos comprobados

El encargo señalado por Carlos era **2645**, `DCL-e968454acebbcee375e85609`, de **NeoMBP14**, proyecto `xpaceos`: MCP de XpaceOS y ayuda humana. La identidad local corresponde a Claude admira; la conexión MCP la confirma como NeoMBP14 / MBP14. Su misión y sus tres tareas ya estaban resueltas al inspeccionar. El transcript de Claude Desktop finaliza a las **22:58:16 CEST**. No se reabre ni se le atribuye actividad posterior.

La sesión `Claude / app / desktop:claude` sí tenía vinculada esa misión en el registro de sesiones. La misión no tenía una entrada en `fleet_work_activity`: no había emitido actividad explícita autenticada. La observación pública posterior al cierre mostraba la APP abierta sin turno activo; eso no demuestra cuál fue el estado servido durante el incidente.

El lector remoto era anterior al arreglo de conversaciones largas (cola de 2 MB; conversación de 5,8 MB). Una reproducción local, sin publicar señales, comparó 16 instantes del encargo: ambos lectores detectaron los turnos y el cierre. Por tanto, **no se atribuye este incidente al tamaño del transcript**, ni se afirma haber reproducido su causa histórica. Se actualiza preventivamente al código canónico ya probado.

La interfaz sí confundía visualmente `assigned_stale` y `last_work`: ambos tenían uniforme gris. El primero representa trabajo asignado sin actividad actual confirmada; el segundo, trabajo terminado.

## Corrección

- Highscore: `assigned_stale` pasa a ámbar y muestra «Trabajo en curso · actividad sin confirmar» cuando no hay una razón más específica. `last_work` conserva gris. Se mantienen la verificación de ejecución, la política CLI y las condiciones del bonus. El color no acredita trabajo ni concede puntos.
- Ayuda humana: `/help#running-man`, con estados y procedimiento para que el agente registre su acción actual mediante MCP.
- MBP14: credencial individual de 30 días, proyectos `yokup,xpaceos`, archivo privado 0600. No se copia ninguna clave a este documento.
- Puente stdio en `~/.local/lib/yokup/mcp-stdio.mjs`; servidor `yokup` añadido a `~/.claude.json` y `~/Library/Application Support/Claude/claude_desktop_config.json`. Se conservan los demás ajustes y copias privadas de respaldo. Las conversaciones existentes pueden requerir una sesión nueva para cargar las herramientas; no se reinician las APP.
- Regla local `~/.claude/rules/yokup-mcp.md`: comprobar identidad, reutilizar misión, informes por `yokup_task_update` y acciones reales por `yokup_activity` con `runtime:Claude`, `session_id:desktop:claude`; exigir `bound:true` y `accepted:true`. No emitir actividad con temporizadores, ni por abrir la APP, ni sobre una misión cerrada.
- MCP v1 todavía no expone alta ni cierre integral de misión: esas operaciones siguen el flujo canónico de Yokup. La misión 2645 fue anterior a la instalación; no se afirma uso retroactivo del MCP.
- Lector instalado desde `admira-telegram` (arreglo `8d6444e`, instalador `75c8c8d`, QA `1aeb717`). SHA-256 instalado `b04cad6be40548d4b9441d8a0c97bc340d675e27d07d3ce16917de326d8cf653`. El watcher conserva exactamente su hash anterior; sólo se reinicia su servicio de observación, no Claude ni Codex.

## Verificación

`claude mcp list` ejecutado en MBP14 confirma **yokup: Connected**. Suite web: **1379 pruebas superadas**, incluidas las políticas de actividad, estados, bonus y representación de misión.

Desde MBP14: `initialize`, `yokup_whoami` y `yokup_mission` por el puente stdio contra `https://yokup.com/mcp`, con identidad y misión correctas. Parser, límite de transcript, privacidad, finalización e instalador: 19 pruebas superadas. Las reproducciones históricas son pruebas locales; nunca se enviaron como actividad actual.

El diagnóstico y los cambios están registrados mediante MCP en la misión 2741. No se registran mensajes a otros agentes ni se ejecuta trabajo nuevo en nombre de NeoMBP14.

## Publicación y cierre

Publicado y verificado en producción: **v.05.09.2026.r26.23:18**, código `a77646c35d84afddfa03b264e635de22c1196c72`, checkout limpio. La página real de Highscore confirmó el sello y la misión de esta corrección en su sesión APP durante la verificación.

La misión **2741** queda **resuelta**, con A/B/C y cierre canónico completados; estado persistido releído mediante MCP y sin referencia activa en `/highscore/active-work`. Evidencia técnica: https://api.yokup.com/media/fleet/93e02f1194cf2f3e.png. Evidencia canónica del cierre: https://api.yokup.com/media/fleet/e13ccf8224f848cd.png.

Límite de la validación: el MCP está conectado y su lectura real verificada, pero no se ha observado todavía un encargo nuevo de NeoMBP14 usando esta conexión. No se simula esa ejecución ni se mantiene abierta la misión de instalación para aparentarla.
