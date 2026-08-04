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

test("el presite cuenta sólo agentes con misión en curso y latido reciente", () => {
  assert.match(html, /function agentesEnLiza\(lista\)/);
  assert.match(html, /filasConMisionEnCurso\(lista \|\| \[\], misionesEnCurso\(\)\)\.length/);
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
  assert.match(html, /header\.cab\{[^}]*grid-template-columns:auto minmax\(180px,1fr\)[^}]*grid-template-rows:20px auto/);
  assert.match(html, /\.cab-tools\{[^}]*grid-column:1[^}]*grid-row:1[^}]*justify-content:flex-start/);
  assert.match(html, /\.sonido\{[^}]*width:22px[^}]*height:22px[^}]*font-size:11px/);
  assert.match(html, /\.refresh-race\{[^}]*grid-column:2[^}]*grid-row:1 \/ span 2/);
  assert.match(html, /class="refresh-runner runner-' \+ variant \+ ' runner-skin-' \+ variant/);
  assert.match(html, /<svg class="runner-run-a" viewBox="0 0 24 24"[^>]*><use href="#runnerRunA"/);
  assert.match(html, /class="runner-run-b"/);
  assert.match(html, /class="runner-run-c"/);
  assert.match(html, /@keyframes runner-run-a/);
  assert.match(html, /@keyframes runner-run-b/);
  assert.match(html, /@keyframes runner-run-c/);
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
  assert.match(html, /\.refresh-place\{[^}]*color:var\(--lane\)[^}]*text-align:center/);
  assert.match(html, /\.refresh-place\{[^}]*z-index:4[^}]*top:0/);
  assert.match(html, /\.refresh-lane\{[^}]*height:50px/);
  assert.match(html, /\.refresh-place-finish\{right:2px\}/);
  assert.doesNotMatch(html, /refresh-place-start/);
  assert.match(html, /\.refresh-finish::before,\.refresh-finish::after\{[^}]*conic-gradient[^}]*transition:transform \.45s steps\(3,end\),opacity \.45s linear/);
  // La cinta la rompe `cruzando` (el fotograma del cruce), no `finished`
  // (el fin de la cuenta): antes seguía intacta con el corredor encima.
  assert.match(html, /\.refresh-lane\.cruzando \.refresh-finish::before\{[^}]*translate\(-7px,-8px\)[^}]*opacity:0/);
  assert.match(html, /\.refresh-lane\.cruzando \.refresh-finish::after\{[^}]*translate\(7px,8px\)[^}]*opacity:0/);
  assert.match(html, /class="refresh-runner runner-' \+ variant[\s\S]*class="refresh-finish" aria-hidden="true"[\s\S]*class="refresh-place refresh-place-finish" aria-hidden="true">' \+ puesto/);
  assert.match(html, /var MARGEN_PISTA_PX = 36, SALIDA_CORREDOR_PX = 17, META_CORREDOR_PX = 16/);
  assert.match(html, /ajusteCorredor = SALIDA_CORREDOR_PX \* \(1 - progresoAtleta\) - META_CORREDOR_PX \* progresoAtleta/);
  assert.match(html, /posicionCorredor = "calc\(" \+ pct \+ "% \+ " \+ ajusteCorredor \+ "px\)"/);
  assert.match(html, /relleno\.style\.width = "calc\(" \+ pct \+ "% - " \+ recortePista \+ "px\)"/);
  assert.match(html, /corredor\.style\.left = posicionCorredor/);
  assert.match(html, /mision\.style\.left = posicionCorredor/);
  assert.doesNotMatch(html, /agente\.style\.left = posicionCorredor/);
  assert.match(html, /agente\.style\.transform = "translateX\(" \+ empujeAgente \+ "px\)"/);
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

test("ocho cabeceras ordenan, invierten el sentido y conservan el ranking", () => {
  assert.equal((html.match(/class="sort-head"/g) || []).length, 8);
  assert.equal((html.match(/aria-sort="none"/g) || []).length, 8);
  assert.match(html, /\.sort-head\{[^}]*cursor:pointer/);
  assert.match(html, /var DIRECCION_INICIAL = \{[\s\S]*objetivos:"desc", ventanas:"desc", misiones:"desc", tareas:"desc", puntos:"desc"/);
  assert.match(html, /if \(ordenTabla\.campo === campo\) ordenTabla\.direccion = ordenTabla\.direccion === "asc" \? "desc" : "asc"/);
  assert.match(html, /th\.setAttribute\("aria-sort", activo \? \(ordenTabla\.direccion === "asc" \? "ascending" : "descending"\) : "none"\)/);
  assert.match(html, /flecha\.textContent = activo \? \(ordenTabla\.direccion === "asc" \? "▲" : "▼"\) : ""/);
  assert.match(html, /if \(campo === "puntos"\) return Number\(fila\.total\) \|\| 0/);
  assert.match(html, /pintaTabla\(listaVisible\(listaCache \|\| \[\]\)\)/);
  assert.match(html, /pintaTabla\(listaVisible\(l\)\)/,
    "el orden elegido debe sobrevivir a la actualización de 60 segundos");
});

test("el hashtag alterna entre agentes con vida y ranking completo", () => {
  assert.match(html, /id="lifeFilter"[^>]*aria-pressed="false"[^>]*>\#<\/button>/);
  assert.match(html, /\.rank-filter\[aria-pressed="true"\]\{[^}]*color:var\(--good\)[^}]*animation:rank-heartbeat/);
  assert.match(html, /filtroSoloVivos = !filtroSoloVivos/);
  assert.match(html, /boton\.setAttribute\("aria-pressed", filtroSoloVivos \? "true" : "false"\)/);
  assert.match(html, /var accion = filtroSoloVivos \? "Mostrar todos los agentes" : "Mostrar solo agentes con vida"/);
  assert.match(html, /pintaTabla\(listaVisible\(listaCache \|\| \[\]\)\)/);

  const start = html.indexOf("function filtraVida(lista, soloVivos) {");
  const end = html.indexOf("\n\n  function listaVisible", start);
  assert.ok(start >= 0 && end > start, "falta el filtro de vida");
  const context = vm.createContext({});
  vm.runInContext(`${html.slice(start, end)}\n` +
    `globalThis.todos=filtraVida([{agente:"Neo",vivo:true},{agente:"Smith",vivo:false}],false);\n` +
    `globalThis.vivos=filtraVida([{agente:"Neo",vivo:true},{agente:"Smith",vivo:false}],true);`, context);
  assert.deepEqual(Array.from(context.todos, (fila) => fila.agente), ["Neo", "Smith"]);
  assert.deepEqual(Array.from(context.vivos, (fila) => fila.agente), ["Neo"]);
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
  assert.match(html, /<div class="refresh-lanes" id="refreshLanes" role="list" aria-label="Agentes con misión en curso"><\/div>/);
  assert.match(html, /\.refresh-mission\{[^}]*top:25px[^}]*translateX\(calc\(-100% - 18px\)\)/);
  assert.match(html, /\.refresh-mission\{[^}]*font-size:14px[^}]*line-height:17px/);
  // La misión se lee en ORDEN NATURAL. `row-reverse` invertía las palabras
  // («Optimizar el dashboard» salía «dashboard el Optimizar»): se pensó como
  // estela, pero volvía el texto ilegible. Va pegada al corredor (flex-end) y
  // crece hacia atrás, con máscara en el borde en vez de corte a hachazo.
  assert.match(html, /\.refresh-desc\{[^}]*justify-content:flex-end[^}]*white-space:nowrap/);
  assert.doesNotMatch(html, /\.refresh-desc\{[^}]*row-reverse/);
  assert.match(html, /\.refresh-mission\{[^}]*mask-image:linear-gradient\(90deg,transparent 0,#000 26px\)/);
  assert.match(html, /\.refresh-word\{[^}]*direction:ltr[^}]*unicode-bidi:isolate[^}]*white-space:nowrap/);
  // La cinta se rompe en el fotograma del CRUCE, no al acabar la cuenta: la
  // clase `cruzando` se calcula con la geometría real (hombro del corredor
  // contra el borde de ataque de la cinta), no con progreso >= 1.
  assert.match(html, /\.refresh-lane\.cruzando \.refresh-finish::before\{[^}]*opacity:0\}/);
  assert.match(html, /\.refresh-lane\.cruzando \.refresh-finish::after\{[^}]*opacity:0\}/);
  assert.doesNotMatch(html, /\.refresh-lane\.finished \.refresh-finish::before/);
  assert.match(html, /carril\.classList\.toggle\("cruzando", centroAtleta \+ RADIO_CORREDOR_PX >= cintaX\)/);
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

test("todos los agentes con misión en curso tienen calles ordenadas, identidad visual y semántica accesible", () => {
  assert.match(html, /YkHighscoreRace\.activeMissionRows\(lista \|\| \[\], claves\)/);
  assert.match(html, /var corredores = filasConMisionEnCurso\(listaCache \|\| \[\], activas\)\.map/);
  assert.doesNotMatch(html, /top = \(listaCache \|\| \[\]\)\.slice\(0, 3\)/);
  assert.match(html, /activas\.find\(function \(m\) \{ return claveAgenteCarrera\(agenteDeMision\(m\)\) === clave; \}\)/);
  assert.match(html, /var asunto = normaliza\(mision && \(mision\.subject \|\| mision\.title \|\| mision\.name\)\)/);
  assert.doesNotMatch(html, /misionDesdePresencia|presencia viva, sin foco declarado/);
  assert.match(html, /var clasePuesto = puesto <= 3 \? "refresh-lane-p" \+ puesto : "refresh-lane-rank"/);
  assert.match(html, /refresh-lane ' \+ clasePuesto/);
  assert.match(html, /data-place="' \+ puesto/);
  assert.match(html, /data-agent-key="' \+ esc\(clave\)/);
  assert.match(html, /role="listitem"/);
  assert.match(html, /refresh-mission[^\n]*data-race-role="mission"[\s\S]*refresh-runner runner-' \+ variant[\s\S]*refresh-agent/);
  assert.match(html, /'<span class="refresh-agent" data-race-role="agent">' \+ esc\(agente\) \+ '<\/span>'/);
  assert.doesNotMatch(html, /refresh-place-start/);
  assert.match(html, /class="refresh-place refresh-place-finish" aria-hidden="true">' \+ puesto/);
  assert.match(html, /\.refresh-agent\{[^}]*right:43px[^}]*top:22px[^}]*font-size:14px[^}]*line-height:17px/);
  assert.match(html, /\.refresh-lane-p1\{--lane:var\(--oro\);--runner-shirt:#ffd866;--runner-stripe:#8a4a2a\}/);
  assert.match(html, /\.refresh-lane-p2\{--lane:var\(--plata\);--runner-shirt:#e6ecf2;--runner-stripe:#3477c7\}/);
  assert.match(html, /\.refresh-lane-p3\{--lane:var\(--bronce\);--runner-shirt:#c87f3a;--runner-stripe:#2b1b12\}/);
  assert.match(html, /\.refresh-lane-rank\{--lane:#78f3ff;--runner-shirt:#8d5fd3;--runner-stripe:#ffd866\}/);
  assert.match(html, /\.refresh-runner\.runner-dark,\.refresh-runner\.runner-skin-dark\{--runner-skin:#9c5228;--runner-hair:#14100b\}/);
  assert.match(html, /\.refresh-runner\.runner-light,\.refresh-runner\.runner-skin-light\{--runner-skin:#f8b98c;--runner-hair:#b45a1e\}/);
  assert.match(html, /\.runner-mustache/);
  assert.match(html, /class="runner-shirt"/);
  assert.match(html, /class="runner-accent"/);
  assert.match(html, /class="runner-shirt" fill="var\(--runner-shirt,#f8f8f8\)"/);
  assert.match(html, /class="runner-accent" fill="var\(--runner-stripe,#3466cc\)"/);
  assert.match(html, /ykAgentIdentity\.missionPair\(agente, mision\.machine \|\| mision\.loc, \[mision\.screen\]\)/);
  assert.match(html, /\}\)\.filter\(Boolean\);\s*contenedor\.innerHTML = corredores\.join\(""\)/);
  assert.match(html, /carrera\.setAttribute\("data-lanes", String\(corredores\.length\)\)/);
  assert.match(html, /carrera\.classList\.toggle\("empty", corredores\.length === 0\)/);
});

test("el podio conserva el latido vivo y usa la tendencia horaria compartida", () => {
  assert.doesNotMatch(html, /puntosPodioAnteriores/);
  assert.match(html, /a\.vivo \? ' podium-live' : ''/);
  assert.match(html, /\.plaza\.podium-live::after\{[^}]*border:2px solid rgba\(136,255,170,\.8\)[^}]*animation:podium-heartbeat/);
  assert.match(html, /@keyframes podium-heartbeat/);
  assert.match(html, /var trend = a\.tendencia \|\| tendenciaHoraria\(a\), sube = trend\.state === "up"/);
  assert.match(html, /class="podium-trend up"[^>]*>↑<\/span>/);
  assert.match(html, /class="podium-trend same"[^>]*>=<\/span>/);
  assert.match(html, /<div class="pts"><span class="podium-score">' \+ total \+ '<\/span>' \+ tendencia/);
  assert.match(html, /datos\.actividadMeta && datos\.actividadMeta\.hourly/);
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
  assert.match(html, /inicioAgente = carril\.clientWidth - MARGEN_NOMBRE_META_PX - anchoAgente/);
  assert.match(html, /empujeAgente = Math\.max\(0, centroCorredor \+ RADIO_CORREDOR_PX - inicioAgente\)/);
  assert.match(html, /var meta = carril\.clientWidth - MARGEN_PISTA_PX/);
  assert.match(html, /cruceAgente = Math\.max\(0, Math\.min\(1, \(inicioAgente \+ anchoAgente \+ empujeAgente - meta\) \/ anchoAgente\)\)/);
  assert.match(html, /agente\.style\.transform = "translateX\(" \+ empujeAgente \+ "px\)"/);
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

test("READY SET GO muestran su sprite real y la llegada muestra ganador y perdedores", () => {
  assert.match(html, /class="race-call" id="raceCall"/);
  assert.match(html, /<symbol id="runnerReady"/);
  assert.match(html, /<symbol id="runnerSet"/);
  assert.match(html, /<symbol id="runnerGo"/);
  assert.match(html, /<symbol id="runnerRunA"/);
  assert.match(html, /<symbol id="runnerRunB"/);
  assert.match(html, /<symbol id="runnerRunC"/);
  assert.match(html, /<symbol id="runnerWinner"/);
  assert.match(html, /<symbol id="runnerLoser"/);
  assert.match(html, /<svg class="runner-pose-ready"[^>]*><use href="#runnerReady"/);
  assert.match(html, /<svg class="runner-pose-set"[^>]*><use href="#runnerSet"/);
  assert.match(html, /<svg class="runner-pose-go"[^>]*><use href="#runnerGo"/);
  // El gesto del final se ANIMA en dos tiempos, como en el arcade: el ganador
  // bombea los brazos (arriba ↔ junto a la cabeza) y el perdedor se rasca la
  // cabeza. Dos <use> alternados por keyframes steps, y el frame B existe como
  // símbolo propio — nada de deformar el frame A.
  assert.match(html, /<symbol id="runnerWinnerB"/);
  assert.match(html, /<symbol id="runnerLoserB"/);
  assert.match(html, /<svg class="runner-finish-win"[^>]*><use class="gesto-a" href="#runnerWinner"><\/use><use class="gesto-b" href="#runnerWinnerB"/);
  assert.match(html, /<svg class="runner-finish-lose"[^>]*><use class="gesto-a" href="#runnerLoser"><\/use><use class="gesto-b" href="#runnerLoserB"/);
  assert.match(html, /@keyframes runner-gesto-a\{0%,49%\{opacity:1\}50%,100%\{opacity:0\}\}/);
  assert.match(html, /@keyframes runner-gesto-b\{0%,49%\{opacity:0\}50%,100%\{opacity:1\}\}/);
  // Con prefers-reduced-motion el gesto se queda quieto en el frame A.
  assert.match(html, /\.runner-finish-win \.gesto-a,\.runner-finish-lose \.gesto-a\{animation:none;opacity:1\}/);
  assert.match(html, /\.runner-finish-win \.gesto-b,\.runner-finish-lose \.gesto-b\{display:none\}/);
  assert.doesNotMatch(html, /href="#podiumRunner"/);
  // El mecanismo viejo fingía las fases deformando los dos frames de correr.
  // Los sprites de fase son reales: nada de rotate/scaleY ni frames A/B.
  assert.doesNotMatch(html, /runnerFrameA|runnerFrameB|runnerStartReady|runnerFinishWin|runner-bob/);
  assert.doesNotMatch(html, /phase-set [^{]*\{[^}]*scaleY/);
  assert.doesNotMatch(html, /phase-go [^{]*\{[^}]*rotate/);
  assert.match(html, /\.refresh-race\.phase-ready \.runner-pose-ready\{[^}]*display:block[^}]*opacity:1/);
  assert.match(html, /\.refresh-race\.phase-set \.runner-pose-set\{[^}]*display:block[^}]*opacity:1/);
  assert.match(html, /\.refresh-race\.phase-go \.runner-pose-go\{[^}]*display:block[^}]*opacity:1/);
  assert.match(html, /\.refresh-runner svg\{[^}]*position:absolute[^}]*inset:0/);
  assert.match(html, /var fases = \["ready", "set", "go"\], llamadas = \["READY", "SET", "GO"\]/);
  assert.match(html, /if \(transcurrido < SALIDA_MS\)/);
  assert.match(html, /pintaCarrera\(\(transcurrido - SALIDA_MS\) \/ REFRESCO_MS\)/);
  assert.match(html, /carril\.classList\.toggle\("finished", progresoAtleta >= 1\)/);
  assert.match(html, /carril\.classList\.toggle\("race-winner", puesto === 1\)/);
  assert.match(html, /carril\.classList\.toggle\("race-loser", puesto !== 1\)/);
  assert.match(html, /\.refresh-lane\.finished\.race-winner \.runner-finish-win\{[^}]*display:block[^}]*opacity:1/);
  assert.match(html, /\.refresh-lane\.finished\.race-loser \.runner-finish-lose\{[^}]*display:block[^}]*opacity:1/);
  assert.match(html, /document\.getElementById\("refreshCount"\)\.textContent = "META"/);
});
