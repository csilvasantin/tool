import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./highscore.html",import.meta.url),"utf8");

test("Running Man consume el endpoint factual específico sin feeds truncados",()=>{
  assert.equal((source.match(/seguroYokup\("\/highscore\/active-work"/g)||[]).length,2,
    "carga inicial y refresco deben compartir el censo factual");
  assert.match(source,/d && d\.ok && Array\.isArray\(d\.participants\)/);
  assert.match(source,/datos\.trabajos = r\[8\]\.participants \|\| \[\]/);
});

test("la carrera nace de hechos y el ranking completo sólo la enriquece",()=>{
  assert.match(source,/function trabajosEnCurso\(\)/);
  assert.match(source,/trabajos = trabajosEnCurso\(\), completas = listaCompletaCache \|\| \[\]/);
  assert.match(source,/byKey\[trabajo\.key\] \|\| \{ agente:trabajo\.agente/);
  assert.doesNotMatch(source,/filasElegibles\.slice\(0, 3\)/);
  assert.match(source,/data-participants/);
});

test("la calle muestra trabajo, responsable real y fundamento operativo",()=>{
  assert.match(source,/resumenTrabajoActivo\(trabajo\)/);
  assert.match(source,/responsable = normaliza\(resumen\.responsible \|\| agente\)/);
  assert.match(source,/executor = normaliza\(resumen\.executor \|\| responsable\)/);
  assert.match(source,/>\' \+ esc\(responsable\) \+ \'<\/span>\'/);
  assert.match(source,/resumen\.operationalBasis === "verified_process" \? "proceso verificado"/);
  assert.match(source,/fila\.vivo \? "con latido" : "trabajo reciente"/);
  assert.match(source,/SIN TRABAJO ACTIVO/);
  assert.doesNotMatch(source,/misionDesdePresencia|presencia viva, sin foco declarado/);
});

test("texto y agente se adaptan sin clipping ni marquee ilegible",()=>{
  assert.match(source,/\.refresh-agent\{[^}]*overflow-wrap:anywhere/);
  assert.match(source,/\.refresh-agent\{[^}]*white-space:normal/);
  assert.match(source,/@media \(max-width:620px\)[\s\S]*?\.refresh-mission-title\{font-size:9px\}/);
  assert.doesNotMatch(source,/<marquee|function estelaMision|class="refresh-word"/);
});

test("el trabajo se mueve con el corredor en una capa posterior",()=>{
  assert.match(source,/\.refresh-mission\{[^}]*position:absolute[^}]*z-index:1/);
  assert.match(source,/\.refresh-runner\{[^}]*z-index:3/);
  assert.match(source,/carril\.querySelector\('\[data-race-role="mission"\]'\)/);
  assert.match(source,/mision\.style\.left = posicionCorredor/);
});

test("Running Man convive con filtros, puntos hora\/día y detalle plegable",()=>{
  assert.match(source,/data-yk-slot="right"[^>]*id="advancedMenu"/);
  assert.match(source,/function aplicaAgentScope\(/);
  assert.match(source,/class="score-number score-day daily-'\+esc\(state\)/);
  assert.match(source,/<button class="score-toggle" type="button" aria-expanded="false"/);
  assert.match(source,/\.score-progress\[hidden\]\{display:none\}/);
});
