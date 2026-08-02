import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("./highscore.html", import.meta.url), "utf8");
const image = fs.readFileSync(new URL("./img/highscore-presite-decathlon.png", import.meta.url));

test("la carátula Decathlon vive solo en el presite del Highscore", () => {
  assert.match(html, /<link rel="preload" as="image" href="\/img\/highscore-presite-decathlon\.png">/);
  assert.match(html, /#carga\{[^}]*highscore-presite-decathlon\.png[^}]*cover no-repeat/s);
  assert.match(html, /#carga::before/);
  assert.doesNotMatch(html, /\.podio\{[^}]*highscore-presite-decathlon/s);
});

test("el presite deja respirar la carátula sin caja ni gráficos 4-bit", () => {
  assert.match(html, /class="presite-ui"/);
  assert.doesNotMatch(html, /class="marco"/);
  assert.doesNotMatch(html, /class="corredor"/);
  assert.doesNotMatch(html, /class="bandas/);
  assert.doesNotMatch(html, /<svg[^>]*class="corredor"/);
});

test("el presite entra solo tras 15 segundos si nadie pulsa", () => {
  assert.match(html, /PULSA PARA EMPEZAR · AUTO EN 15 S/);
  assert.match(html, /var ENTRADA_AUTOMATICA_MS = 15 \* 1000/);
  assert.match(html, /entradaTimer = setTimeout\(entra, ENTRADA_AUTOMATICA_MS\)/);
  assert.match(html, /if \(entradaHecha\) return/);
  assert.match(html, /clearTimeout\(entradaTimer\); clearInterval\(cuentaEntradaTimer\)/);
  assert.match(html, /programaEntradaAutomatica\(\)/);
});

test("el presite cuenta sólo agentes con latido vivo, no todo el ranking histórico", () => {
  assert.match(html, /function agentesEnLiza\(lista\)/);
  assert.match(html, /\(lista \|\| \[\]\)\.filter\(function \(fila\) \{ return fila && fila\.vivo; \}\)\.length/);
  assert.match(html, /var vivos = agentesEnLiza\(listaCache\)/);
  assert.match(html, /vivos === 1 \? " AGENTE EN LIZA" : " AGENTES EN LIZA"/);
  assert.doesNotMatch(html, /listaCache\.length \+ " AGENTES EN LIZA"/);
});

test("la imagen conserva las proporciones 16:9 entregadas", () => {
  assert.equal(image.toString("ascii", 1, 4), "PNG");
  assert.equal(image.readUInt32BE(16), 1280);
  assert.equal(image.readUInt32BE(20), 720);
});

test("la cabecera compacta conserva el sonido y elimina reloj y subtítulo", () => {
  assert.match(html, /<div class="cab-tools">[\s\S]*<button class="sonido"/);
  assert.match(html, /class="sonido"[^>]*aria-pressed="false"/);
  assert.doesNotMatch(html, /<time class="reloj"/);
  assert.doesNotMatch(html, /QUIÉN TRABAJA MÁS EN LA FLOTA/i);
  assert.match(html, /data-sort-col="puntos"[^>]*aria-sort="none"[\s\S]*data-sort="puntos">Puntos/);
  assert.doesNotMatch(html, /<th class="num">Vivo<\/th>/);
});

test("la vida hace latir el propio número de posición y no añade un punto", () => {
  assert.match(html, /\.rank-number\.live\{[^}]*color:var\(--good\)[^}]*animation:rank-heartbeat/);
  assert.match(html, /@keyframes rank-heartbeat/);
  assert.match(html, /function posicionHtml\(a, posicion\)/);
  assert.match(html, /lista\.forEach\(function \(fila, indice\) \{ fila\.posicion = indice \+ 1; \}\)/);
  assert.match(html, /<td class="n">' \+ posicionHtml\(a, a\.posicion \|\| i \+ 1\)/);
  assert.match(html, /function agentNameHtml\(a\)/);
  assert.match(html, /<div class="nom">' \+ agentNameHtml\(a\) \+ '<\/div>/);
  assert.match(html, /número de posición parpadea en verde/);
  assert.doesNotMatch(html, /rank-live/);
  assert.doesNotMatch(html, /class="rank-cell"/);
  assert.doesNotMatch(html, /agent-name\.agent-live/);
  assert.doesNotMatch(html, /class="nom">' \+ posicionHtml/);
});

test("todos los atletas pixelados recorren la línea y actualizan el marcador cada 60 segundos", () => {
  assert.match(html, /<header class="cab">[\s\S]*<h1><button class="race-toggle" id="raceToggle"[\s\S]*>HIGHSCORE<\/button><\/h1>[\s\S]*class="refresh-race"[\s\S]*class="cab-tools"[\s\S]*<\/header>/);
  assert.match(html, /header\.cab\{[^}]*grid-template-columns:auto minmax\(180px,1fr\)[^}]*grid-template-rows:auto auto/);
  assert.match(html, /\.cab-tools\{[^}]*grid-column:1[^}]*grid-row:2[^}]*justify-content:center/);
  assert.match(html, /\.refresh-race\{[^}]*grid-column:2[^}]*grid-row:1 \/ span 2/);
  assert.match(html, /class="refresh-runner runner-' \+ variant \+ ' runner-skin-' \+ variant/);
  assert.match(html, /<svg class="runner-frame-a" viewBox="0 0 24 30"><use href="#runnerFrameA"/);
  assert.match(html, /class="runner-frame-a"/);
  assert.match(html, /class="runner-frame-b"/);
  assert.match(html, /@keyframes runner-frame-a/);
  assert.match(html, /@keyframes runner-frame-b/);
  assert.doesNotMatch(html, /class="refresh-count"/);
  assert.match(html, /class="sr-only" id="refreshCount">60 segundos/);
  assert.match(html, /var REFRESCO_MS = 60 \* 1000/);
  assert.match(html, /function avanzaCarrera\(ahora\)/);
  assert.match(html, /actualizaMarcador\(\)\.then\(iniciaCarrera\)/);
  assert.doesNotMatch(html, /setInterval\(function \(\) \{[\s\S]*\}, 60000\)/);
});

test("la pista pasa por los pies del corredor y termina en una meta visible", () => {
  assert.match(html, /\.refresh-track::before\{[^}]*left:36px[^}]*right:36px[^}]*bottom:3px[^}]*height:2px/);
  assert.match(html, /\.refresh-fill\{[^}]*left:36px[^}]*bottom:3px[^}]*height:2px/);
  assert.match(html, /\.refresh-runner\{[^}]*bottom:3px[^}]*transform:translateX\(-50%\)/);
  assert.match(html, /\.refresh-finish\{[^}]*right:29px[^}]*bottom:1px/);
  assert.match(html, /\.refresh-finish::before,\.refresh-finish::after\{[^}]*conic-gradient[^}]*transition:transform \.45s steps\(3,end\),opacity \.45s linear/);
  assert.match(html, /\.refresh-lane\.finished \.refresh-finish::before\{[^}]*translate\(-7px,-8px\)[^}]*opacity:0/);
  assert.match(html, /\.refresh-lane\.finished \.refresh-finish::after\{[^}]*translate\(7px,8px\)[^}]*opacity:0/);
  assert.match(html, /class="refresh-runner runner-' \+ variant[\s\S]*class="refresh-finish" aria-hidden="true"/);
  assert.match(html, /var MARGEN_PISTA_PX = 36, CENTRO_CORREDOR_PX = 16/);
  assert.match(html, /ajusteCorredor = CENTRO_CORREDOR_PX \* \(1 - 2 \* progresoAtleta\)/);
  assert.match(html, /posicionCorredor = "calc\(" \+ pct \+ "% \+ " \+ ajusteCorredor \+ "px\)"/);
  assert.match(html, /relleno\.style\.width = "calc\(" \+ pct \+ "% - " \+ recortePista \+ "px\)"/);
  assert.match(html, /corredor\.style\.left = posicionCorredor/);
  assert.match(html, /mision\.style\.left = posicionCorredor/);
  assert.match(html, /agente\.style\.left = posicionCorredor/);
});

test("el número de la categoría activa parpadea en verde sin confundirse con el latido", () => {
  assert.match(html, /\.activity-now\{[^}]*color:var\(--good\)[^}]*animation:work-pulse/);
  assert.match(html, /@keyframes work-pulse/);
  assert.match(html, /@keyframes work-ring/);
  assert.match(html, /numeroActividad\(a, "objetivos", a\.objetivos/);
  assert.match(html, /numeroVentanas\(a\)/);
  assert.match(html, /numeroActividad\(a, "misiones", a\.misiones/);
  assert.match(html, /numeroActividad\(a, "tareas", a\.tareas/);
  assert.match(html, /prefers-reduced-motion:reduce[^}]*rank-number\.live[^}]*activity-now/);
});

test("las filas pares son claramente más oscuras que las impares", () => {
  assert.match(html, /\.tabla tbody tr:nth-child\(odd\)\{background:#0a1821\}/);
  assert.match(html, /\.tabla tbody tr:nth-child\(even\)\{background:#01060a\}/);
  assert.match(html, /\.tabla tbody tr:hover\{background:#102b38\}/);
});

test("las nueve columnas se pueden reajustar y conservan su anchura", () => {
  assert.match(html, /<div class="table-scroll" id="rankingScroll">/);
  assert.match(html, /<table class="tabla" id="rankingTable">[\s\S]*<colgroup>[\s\S]*data-min=/);
  assert.match(html, /\.col-resizer\{[^}]*cursor:col-resize/);
  assert.match(html, /function iniciaColumnasReajustables\(\)/);
  assert.match(html, /setPointerCapture\(evento\.pointerId\)/);
  assert.match(html, /localStorage\.setItem\(COLUMNAS_KEY/);
  assert.match(html, /evento\.key !== "ArrowLeft" && evento\.key !== "ArrowRight"/);
  assert.match(html, /anchoContenidoColumna\(indice\)/);
  assert.match(html, /role", "separator"/);
});

test("las nueve cabeceras ordenan, invierten el sentido y conservan el ranking", () => {
  assert.equal((html.match(/class="sort-head"/g) || []).length, 9);
  assert.equal((html.match(/aria-sort="none"/g) || []).length, 9);
  assert.match(html, /\.sort-head\{[^}]*cursor:pointer/);
  assert.match(html, /var DIRECCION_INICIAL = \{[\s\S]*objetivos:"desc", ventanas:"desc", misiones:"desc", tareas:"desc", puntos:"desc"/);
  assert.match(html, /if \(ordenTabla\.campo === campo\) ordenTabla\.direccion = ordenTabla\.direccion === "asc" \? "desc" : "asc"/);
  assert.match(html, /th\.setAttribute\("aria-sort", activo \? \(ordenTabla\.direccion === "asc" \? "ascending" : "descending"\) : "none"\)/);
  assert.match(html, /flecha\.textContent = activo \? \(ordenTabla\.direccion === "asc" \? "▲" : "▼"\) : ""/);
  assert.match(html, /if \(campo === "puntos"\) return Number\(fila\.total\) \|\| 0/);
  assert.match(html, /pintaTabla\(listaOrdenada\(listaCache \|\| \[\]\)\)/);
  assert.match(html, /pintaTabla\(listaOrdenada\(l\)\)/,
    "el orden elegido debe sobrevivir a la actualización de 60 segundos");
});

test("Ordenador agrupa equipos y mantiene dentro de cada grupo la posición real", () => {
  assert.match(html, /data-sort="ordenador">Ordenador/);
  assert.match(html, /function ordenadorPrincipal\(a\)/);
  assert.match(html, /return normaliza\(vivas\[0\] \|\| conocidas\[0\]\)/);
  assert.match(html, /if \(campo === "ordenador"\) return ordenadorPrincipal\(fila\)/);
  assert.match(html, /return \(Number\(a\.posicion\) \|\| 0\) - \(Number\(b\.posicion\) \|\| 0\)/,
    "los empates de ordenador deben conservar el orden original del ranking");

  const start = html.indexOf('var ordenTabla = { campo:"", direccion:"" };');
  const end = html.indexOf("  function aplicaAnchosColumnas", start);
  assert.ok(start >= 0 && end > start, "falta el motor de ordenación");
  const context = vm.createContext({ normaliza:(valor) => String(valor == null ? "" : valor).trim() });
  vm.runInContext(html.slice(start, end), context);
  const filas = [
    { agente:"Uno", posicion:1, total:100, maquinasVivas:["Mac B"], maquinas:["Mac B"] },
    { agente:"Dos", posicion:2, total:90, maquinasVivas:["Mac A"], maquinas:["Mac A"] },
    { agente:"Tres", posicion:3, total:80, maquinasVivas:["Mac B"], maquinas:["Mac B"] },
    { agente:"Cuatro", posicion:4, total:70, maquinasVivas:["Mac A"], maquinas:["Mac A"] }
  ];
  context.filas = filas;
  vm.runInContext('ordenTabla={campo:"puntos",direccion:"desc"}; globalThis.puntosDesc=listaOrdenada(filas).map(function(f){return f.agente;});', context);
  vm.runInContext('ordenTabla={campo:"puntos",direccion:"asc"}; globalThis.puntosAsc=listaOrdenada(filas).map(function(f){return f.agente;});', context);
  vm.runInContext('ordenTabla={campo:"ordenador",direccion:"asc"}; globalThis.equiposAsc=listaOrdenada(filas).map(function(f){return f.agente;});', context);
  vm.runInContext('ordenTabla={campo:"ordenador",direccion:"desc"}; globalThis.equiposDesc=listaOrdenada(filas).map(function(f){return f.agente;});', context);
  assert.deepEqual(Array.from(context.puntosDesc), ["Uno", "Dos", "Tres", "Cuatro"]);
  assert.deepEqual(Array.from(context.puntosAsc), ["Cuatro", "Tres", "Dos", "Uno"]);
  assert.deepEqual(Array.from(context.equiposAsc), ["Dos", "Cuatro", "Uno", "Tres"]);
  assert.deepEqual(Array.from(context.equiposDesc), ["Uno", "Tres", "Dos", "Cuatro"]);
});

test("la primera palabra de cada misión queda pegada detrás del corredor", () => {
  assert.match(html, /<div class="refresh-lanes" id="refreshLanes" role="list" aria-label="Agentes con presencia viva en carrera"><\/div>/);
  assert.match(html, /\.refresh-mission\{[^}]*top:4px[^}]*translateX\(calc\(-100% - 18px\)\)/);
  assert.match(html, /\.refresh-mission\{[^}]*font-size:14px[^}]*line-height:17px/);
  assert.match(html, /\.refresh-desc\{[^}]*flex-direction:row-reverse[^}]*justify-content:flex-start/);
  assert.match(html, /\.refresh-word\{[^}]*direction:ltr[^}]*unicode-bidi:isolate[^}]*white-space:nowrap/);
  assert.match(html, /function actualizaCarreraPodio\(\)/);
  assert.match(html, /function estelaMision\(asunto\)/);
  assert.match(html, /normaliza\(asunto\)\.split\(\/\\s\+\/\)\.filter\(Boolean\)\.map/);
  assert.match(html, /'<span class="refresh-word">' \+ esc\(palabra\) \+ '<\/span>'/);
  assert.match(html, /normaliza\(m\.status\)\.toLowerCase\(\) === "in_progress"/);
  assert.match(html, /mision\.subject \|\| mision\.title \|\| mision\.name/);
  assert.doesNotMatch(html, /ultima\.display_ref \|\| ultima\.id \|\| ultima\.origin_ref/,
    "la carrera no debe consumir espacio mostrando el ticket");
  assert.match(html, /'<span class="refresh-desc">' \+ \(asunto \? estelaMision\(asunto\) : ""\)/,
    "la estela debe conservar la primera palabra junto al corredor");
  assert.match(html, /pintaFormula\(listaCache\); actualizaCarreraPodio\(\)/);
  assert.match(html, /carril\.querySelector\('\[data-race-role="runner"\]'\)/);
  assert.match(html, /carril\.querySelector\('\[data-race-role="mission"\]'\)/);
});

test("todos los agentes vivos tienen calles ordenadas, identidad visual y semántica accesible", () => {
  assert.match(html, /YkHighscoreRace\.liveRows\(listaCache \|\| \[\]\)/);
  assert.match(html, /\(listaCache \|\| \[\]\)\.filter\(function \(fila\) \{ return fila && fila\.vivo; \}\)/);
  assert.doesNotMatch(html, /top = \(listaCache \|\| \[\]\)\.slice\(0, 3\)/);
  assert.match(html, /activas\.find\(function \(m\) \{ return claveAgenteCarrera\(agenteDeMision\(m\)\) === clave; \}\)/);
  assert.match(html, /var asunto = mision \? normaliza\(mision\.subject \|\| mision\.title \|\| mision\.name\) : misionDesdePresencia\(fila\)/);
  assert.match(html, /function misionDesdePresencia\(fila\)/);
  assert.match(html, /esReciente\(p\.updated, FRESCO_SEG \* 1000\)/);
  assert.match(html, /limpiaFocoMision\(recientes\[0\]\.focus \|\| recientes\[0\]\.task\)/);
  assert.match(html, /var clasePuesto = puesto <= 3 \? "refresh-lane-p" \+ puesto : "refresh-lane-rank"/);
  assert.match(html, /refresh-lane ' \+ clasePuesto/);
  assert.match(html, /data-place="' \+ puesto/);
  assert.match(html, /data-agent-key="' \+ esc\(clave\)/);
  assert.match(html, /role="listitem"/);
  assert.match(html, /refresh-mission[^\n]*data-race-role="mission"[\s\S]*refresh-runner runner-' \+ variant[\s\S]*refresh-agent/);
  assert.match(html, /'<span class="refresh-agent" data-race-role="agent">' \+ esc\(agente\) \+ '<\/span>'/);
  assert.doesNotMatch(html, /class="refresh-place"/);
  assert.match(html, /\.refresh-agent\{[^}]*font-size:14px[^}]*line-height:17px/);
  assert.match(html, /\.refresh-lane-p1\{--lane:var\(--oro\);--runner-shirt:#ef4f43;--runner-stripe:#dff8ff\}/);
  assert.match(html, /\.refresh-lane-p2\{--lane:var\(--plata\);--runner-shirt:#3477c7;--runner-stripe:#dff8ff\}/);
  assert.match(html, /\.refresh-lane-p3\{--lane:var\(--bronce\);--runner-shirt:#3477c7;--runner-stripe:#ef4f43\}/);
  assert.match(html, /\.refresh-lane-rank\{--lane:#78f3ff;--runner-shirt:#8d5fd3;--runner-stripe:#ffd866\}/);
  assert.match(html, /\.refresh-runner\.runner-dark,\.refresh-runner\.runner-skin-dark/);
  assert.match(html, /\.refresh-runner\.runner-light,\.refresh-runner\.runner-skin-light/);
  assert.match(html, /\.runner-mustache/);
  assert.match(html, /class="runner-shirt"/);
  assert.match(html, /class="runner-stripe"/);
  assert.match(html, /class="runner-shirt" fill="var\(--runner-shirt,#ef4f43\)"/);
  assert.match(html, /class="runner-stripe" fill="var\(--runner-stripe,#dff8ff\)"/);
  assert.match(html, /ykAgentIdentity\.missionPair\(agente, mision\.machine \|\| mision\.loc, \[mision\.screen\]\)/);
  assert.match(html, /\}\)\.filter\(Boolean\);\s*contenedor\.innerHTML = corredores\.join\(""\)/);
  assert.match(html, /carrera\.setAttribute\("data-lanes", String\(corredores\.length\)\)/);
  assert.match(html, /carrera\.classList\.toggle\("empty", corredores\.length === 0\)/);
});

test("el podio conserva el latido vivo y separa la tendencia de puntos", () => {
  assert.match(html, /var puntosPodioAnteriores = Object\.create\(null\)/);
  assert.match(html, /a\.vivo \? ' podium-live' : ''/);
  assert.match(html, /\.plaza\.podium-live::after\{[^}]*border:2px solid rgba\(136,255,170,\.8\)[^}]*animation:podium-heartbeat/);
  assert.match(html, /@keyframes podium-heartbeat/);
  assert.match(html, /var sube = anterior !== null && total > anterior/);
  assert.match(html, /class="podium-trend up"[^>]*>↑<\/span>/);
  assert.match(html, /class="podium-trend same"[^>]*>=<\/span>/);
  assert.match(html, /<div class="pts"><span class="podium-score">' \+ total \+ '<\/span>' \+ tendencia/);
  assert.match(html, /puntosPodioAnteriores\[claveAgenteCarrera\(a\.agente\)\] = Number\(a\.total\) \|\| 0/);
});

test("HIGHSCORE pausa la lectura, continúa y desvanece el nombre mientras cruza la meta", () => {
  assert.match(html, /class="race-toggle" id="raceToggle"[^>]*aria-pressed="false"/);
  assert.match(html, /document\.getElementById\("raceToggle"\)\.addEventListener\("click", pausaOReiniciaCarrera\)/);
  assert.match(html, /function pausaOReiniciaCarrera\(\)/);
  assert.match(html, /carreraTiempoPausado = Math\.max\(0, Math\.min\(CICLO_MS, performance\.now\(\) - carreraInicio\)\)/);
  assert.match(html, /document\.getElementById\("refreshCount"\)\.textContent = "PAUSA"/);
  assert.match(html, /carreraInicio = performance\.now\(\) - carreraTiempoPausado/);
  assert.match(html, /pintaMomentoCarrera\(carreraTiempoPausado\);\s*carreraFrame = requestAnimationFrame\(avanzaCarrera\)/);
  assert.match(html, /Reanudar carrera desde el punto de pausa/);
  assert.doesNotMatch(html, /carreraPausada = false;\s*pintaControlCarrera\(\);\s*iniciaCarrera\(\)/);
  assert.match(html, /function avanzaCarrera\(ahora\) \{\s*if \(carreraPausada\) return;/);
  assert.match(html, /var anchoAgente = Math\.max\(1, agente\.offsetWidth\)/);
  assert.match(html, /inicioAgente = progresoAtleta \* carril\.clientWidth \+ ajusteCorredor \+ ADELANTO_AGENTE_PX/);
  assert.match(html, /var meta = carril\.clientWidth - MARGEN_PISTA_PX/);
  assert.match(html, /cruceAgente = Math\.max\(0, Math\.min\(1, \(inicioAgente \+ anchoAgente - meta\) \/ anchoAgente\)\)/);
  assert.match(html, /agente\.style\.opacity = String\(1 - cruceAgente\)/);
  assert.match(html, /\.refresh-race\.paused \.refresh-runner svg[^}]*animation-play-state:paused/);
});

test("todos los corredores hacen la primera mitad al doble de velocidad y solo el podio se separa al final", () => {
  assert.match(html, /var REFRESCO_MS = 60 \* 1000, SALIDA_MS = 3 \* 1000/);
  assert.match(html, /CICLO_MS = SALIDA_MS \+ REFRESCO_MS \+ CELEBRACION_MS, DIFERENCIA_META_MS = 2 \* 1000/);
  assert.match(html, /var MITAD_RAPIDA_MS = REFRESCO_MS \/ 3/);
  assert.match(html, /function progresoCarril\(progresoCiclo, puesto\)/);
  assert.match(html, /YkHighscoreRace\.finishAdvanceMs\(puesto, DIFERENCIA_META_MS\)/);
  assert.match(html, /Math\.max\(0, 3 - Math\.max\(1, puesto\)\) \* DIFERENCIA_META_MS/);
  assert.match(html, /var duracion = REFRESCO_MS - adelanto/);
  assert.match(html, /if \(transcurrido <= MITAD_RAPIDA_MS\) return \.5 \* Math\.min\(1, transcurrido \/ MITAD_RAPIDA_MS\)/);
  assert.match(html, /segundaMitad = Math\.max\(1, duracion - MITAD_RAPIDA_MS\)/);
  assert.match(html, /document\.querySelectorAll\("\.refresh-lane"\)\.forEach/);

  function progreso(transcurridoMs, puesto) {
    const mitadRapida = 60000 / 3;
    const duracion = 60000 - Math.max(0, 3 - Math.max(1, puesto)) * 2000;
    if (transcurridoMs <= mitadRapida) return .5 * Math.min(1, transcurridoMs / mitadRapida);
    return .5 + .5 * Math.max(0, Math.min(1, (transcurridoMs - mitadRapida) / (duracion - mitadRapida)));
  }
  const corte = 60000 / 3;
  assert.equal(progreso(corte, 1), .5);
  assert.equal(progreso(corte, 2), .5);
  assert.equal(progreso(corte, 3), .5);
  assert.equal(progreso(corte, 8), .5);
  assert.equal(progreso(10000, 1), progreso(10000, 2));
  assert.equal(progreso(10000, 2), progreso(10000, 3));
  const velocidadPrimera = .5 / corte;
  const velocidadSegundaReferencia = .5 / (60000 - corte);
  assert.equal(velocidadPrimera / velocidadSegundaReferencia, 2);
  assert.ok(progreso(30000, 1) > progreso(30000, 2));
  assert.ok(progreso(30000, 2) > progreso(30000, 3));
  assert.equal(progreso(56000, 1), 1);
  assert.ok(progreso(56000, 2) < 1);
  assert.equal(progreso(58000, 2), 1);
  assert.ok(progreso(58000, 3) < 1);
  assert.equal(progreso(60000, 3), 1);
  assert.equal(progreso(60000, 8), 1);
});

test("READY SET GO reutiliza los running man y la llegada muestra ganador y perdedores", () => {
  assert.match(html, /class="race-call" id="raceCall"/);
  assert.match(html, /<symbol id="runnerStartReady"/);
  assert.match(html, /<symbol id="runnerStartSet"/);
  assert.match(html, /<symbol id="runnerStartGo"/);
  assert.match(html, /<symbol id="runnerFinishWin"/);
  assert.match(html, /<symbol id="runnerFinishLose"/);
  assert.match(html, /<svg class="runner-frame-a"[^>]*><use href="#runnerFrameA"/);
  assert.match(html, /<svg class="runner-frame-b"[^>]*><use href="#runnerFrameB"/);
  assert.doesNotMatch(html, /<svg class="runner-start-/);
  assert.match(html, /<svg class="runner-finish-win"[^>]*><use href="#runnerFinishWin"/);
  assert.match(html, /<svg class="runner-finish-lose"[^>]*><use href="#runnerFinishLose"/);
  assert.doesNotMatch(html, /href="#podiumRunner"/);
  assert.match(html, /\.refresh-runner svg\{[^}]*position:absolute[^}]*inset:0/);
  assert.match(html, /var fases = \["ready", "set", "go"\], llamadas = \["READY", "SET", "GO"\]/);
  assert.match(html, /if \(transcurrido < SALIDA_MS\)/);
  assert.match(html, /pintaCarrera\(\(transcurrido - SALIDA_MS\) \/ REFRESCO_MS\)/);
  assert.match(html, /carril\.classList\.toggle\("finished", progresoAtleta >= 1\)/);
  assert.match(html, /carril\.classList\.toggle\("race-winner", puesto === 1\)/);
  assert.match(html, /carril\.classList\.toggle\("race-loser", puesto !== 1\)/);
  assert.match(html, /\.refresh-race\.phase-ready \.runner-frame-a\{[^}]*animation:none[^}]*opacity:1/);
  assert.match(html, /\.refresh-race\.phase-set \.runner-frame-b\{[^}]*scaleY\(\.78\)/);
  assert.match(html, /\.refresh-race\.phase-go \.runner-frame-a\{[^}]*rotate\(-10deg\)/);
  assert.match(html, /\.refresh-lane\.finished\.race-winner \.runner-finish-win\{[^}]*display:block[^}]*opacity:1/);
  assert.match(html, /\.refresh-lane\.finished\.race-loser \.runner-finish-lose\{[^}]*display:block[^}]*opacity:1/);
  assert.match(html, /document\.getElementById\("refreshCount"\)\.textContent = "META"/);
});
