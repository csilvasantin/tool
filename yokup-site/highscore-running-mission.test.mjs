import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./highscore.html",import.meta.url),"utf8");

test("Running Man consume el endpoint factual específico sin feeds truncados",()=>{
  assert.equal((source.match(/fetch\(YK \+ "\/highscore\/active-work"/g)||[]).length,1,
    "la fuente factual se centraliza y no duplica feeds ni sondeos en vuelo");
  assert.match(source,/hsRefreshWork\(false\),/,"carga inicial");
  assert.match(source,/hsRefreshWork\(true\),/,"refresco completo comparte la consulta ligera");
  assert.match(source,/function hsPollWork\(\)[\s\S]*?return hsRefreshWork\(true\)/,"sondeo independiente de la animación");
  assert.match(source,/payload && payload\.ok && Array\.isArray\(payload\.participants\)/);
  assert.match(source,/datos\.trabajos = valid \? payload\.participants : \[\]/);
  assert.match(source,/datos\.workObservations = valid && Array\.isArray\(payload\.observations\)/,"observaciones separadas de los participantes");
});

test("la carrera nace de hechos dentro del mismo ámbito que el ranking",()=>{
  assert.match(source,/function trabajosEnCurso\(\)/);
  assert.match(source,/todosTrabajos=trabajosCarrera\(\);\s*var trabajos=todosTrabajos\.filter\(function\(work\)\{return scopeKeys\.has\(work\.key\);\}\)/);
  assert.match(source,/byKey\[trabajo\.key\] \|\| \{ agente:trabajo\.agente/);
  assert.doesNotMatch(source,/filasElegibles\.slice\(0, 3\)/);
  assert.match(source,/data-participants/);
});

test("la calle muestra trabajo, responsable, state factual y hora Madrid",()=>{
  assert.match(source,/resumenTrabajoActivo\(trabajo\)/);
  assert.match(source,/responsable = normaliza\(resumen\.responsible \|\| agente\)/);
  assert.match(source,/executor = normaliza\(resumen\.executor \|\| responsable\)/);
  assert.match(source,/identidadVisible = identidadVisualCorredor\(responsable, fila\)/);
  assert.match(source,/nombreCorredorHtml\(identidadVisible, contextoVisible, "race-agent-context-" \+ indice\)/);
  assert.match(source,/aria-describedby="' \+ esc\(tooltipId\)/);
  assert.match(source,/stateLabel = trabajo\.state === "running" \? "Trabajo activo"/);
  assert.doesNotMatch(source,/>EN CURSO<|>FINALIZADO</);
  assert.match(source,/assignmentClock:horaMadrid\(trabajo\.assignmentAt\)/);
  assert.match(source,/SIN TRABAJO VERIFICADO/);
  assert.doesNotMatch(source,/SIN TRABAJO ASIGNADO/,"una fuente vacía no prueba ausencia de trabajo");
  assert.doesNotMatch(source,/misionDesdePresencia|presencia viva, sin foco declarado/);
});

test("agente, pista y horas ocupan tres columnas reales sin marquee",()=>{
  assert.match(source,/\.refresh-lane\{display:grid;grid-template-columns:minmax\(148px,210px\) minmax\(0,1fr\) minmax\(158px,190px\)/);
  assert.match(source,/\.refresh-agent\{[^}]*text-overflow:ellipsis[^}]*white-space:nowrap/);
  assert.match(source,/\.refresh-timing\{display:inline-flex;[^}]*justify-content:flex-end/);
  assert.ok(source.indexOf('class="refresh-agent-meta"') < source.indexOf('class="refresh-lane-center"'));
  assert.ok(source.indexOf('class="refresh-lane-center"') < source.indexOf('class="refresh-timing"'));
  assert.match(source,/@media \(max-width:620px\)[\s\S]*?\.refresh-mission-title\{font-size:8px\}/);
  assert.doesNotMatch(source,/<marquee|function estelaMision|class="refresh-word"/);
});

test("el trabajo vuelve dentro de la pista y sigue por detrás del corredor",()=>{
  assert.match(source,/\.refresh-mission\{position:absolute;z-index:1/);
  assert.match(source,/\.refresh-runner\{[^}]*z-index:3/);
  assert.match(source,/carril\.querySelector\('\[data-race-role="mission"\]'\)/);
  assert.match(source,/mision\.style\.left = posicionCorredor/);
  assert.match(source,/mision\.style\.width = espacioMision \+ "px"/);
  assert.ok(source.indexOf('data-race-role="mission"') < source.indexOf("runner + '<span class=\"refresh-finish\""));
});

test("Running Man convive con filtros, puntos hora\/día y detalle plegable",()=>{
  assert.match(source,/data-yk-slot="right"[^>]*id="advancedMenu"/);
  assert.match(source,/function aplicaAgentScope\(/);
  assert.match(source,/class="score-number score-day daily-'\+esc\(state\)/);
  assert.match(source,/<button class="score-toggle" type="button" aria-expanded="false"/);
  assert.match(source,/\.score-progress\[hidden\]\{display:none\}/);
});
