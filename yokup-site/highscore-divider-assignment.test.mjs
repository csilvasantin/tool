import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const html=await readFile(new URL("./highscore.html",import.meta.url),"utf8");
const rtc=await readFile(new URL("../yokup-rtc/src/index.js",import.meta.url),"utf8");

// Carlos, 15-ago-2026: la banda SUBE por encima de la carrera. Debajo no
// dividía nada — quien entraba veía primero a los corredores y el rótulo de la
// sección aparecía a media página, cuando ya no hacía falta que le dijeran
// dónde estaba. Arriba encabeza y deja sus dos mandos a mano.
test("la banda HIGHSCORE+RANKING encabeza la página, por encima de la carrera",()=>{
  const race=html.indexOf('id="refreshRace"'),divider=html.indexOf('id="scoreDivider"');
  const podio=html.indexOf('id="podio" hidden'),table=html.indexOf('class="table-scroll"');
  assert.ok(divider<race && race<podio && podio<table,
    "orden: banda, carrera, podio y tabla");
  // Dos botones, cada uno con UNA función: hasta hoy el rótulo decía HIGHSCORE
  // y lo que abría era el podio, sin que nada gobernara la tabla.
  assert.match(html,/id="rankingToggle"[^>]*aria-controls="rankingScroll"/);
  assert.ok(html.indexOf('id="podiumToggle"')<html.indexOf('id="rankingToggle"'),
    "HIGHSCORE primero, RANKING después");
  assert.match(html,/\.score-divider\{[^}]*width:100%[^}]*border-top:[^}]*border-bottom:/);
  assert.match(html,/id="podiumToggle"[^>]*aria-expanded="false"[^>]*aria-controls="podio"/);
  assert.match(html,/id="btnSonido"[^>]*aria-pressed="false"/);
  assert.match(html,/btnSonido"\)\.addEventListener\("click", function \(e\) \{ e\.stopPropagation\(\)/);
  assert.doesNotMatch(html,/<header class="cab">\s*<h1/);
});

test("el DOM ordena nombre, pista y bloque temporal derecho",()=>{
  assert.match(html,/class="refresh-agent-meta">' \+ nombreCorredorHtml\(identidadVisible, contextoVisible, "race-agent-context-" \+ indice\)[\s\S]*class="refresh-lane-center"[\s\S]*class="refresh-timing"[\s\S]*marcaInicio \+ marcaTemporal/);
  assert.match(html,/data-race-time="elapsed" data-work-state="running"/);
  assert.match(html,/data-race-time="end" datetime="/);
  assert.match(html,/aria-label="Responsable ' \+ esc\(identidadVisible\.nombre\) \+ '\. Proyecto responsable ' \+ esc\(proyectoResponsable\) \+ '\. Hora de inicio ' \+ esc\(resumen\.startedClock\) \+ esc\(timingAria\)/);
  assert.match(html,/startedAt:Number\(item\.work_started_at\) \|\| 0/);
  assert.match(html,/startedClock:horaMadrid\(trabajo\.startedAt\)/);
  assert.doesNotMatch(html,/startedClock:horaMadrid\(trabajo\.(?:assignmentAt|at|presenceAt|endedAt)\)/);
  assert.match(html,/\.refresh-agent-meta\{[^}]*display:grid[^}]*grid-template-columns:minmax\(0,1fr\)[^}]*min-width:0/);
  assert.match(html,/\.refresh-agent\{[^}]*min-width:0[^}]*text-overflow:ellipsis/);
  assert.match(html,/\.refresh-started,\.refresh-ended\{[^}]*flex:0 0 auto[^}]*white-space:nowrap/);
  assert.doesNotMatch(html,/class="refresh-time"|class="refresh-work-state"/);
});

test("desktop y móvil reservan pista central y reloj a la derecha",()=>{
  assert.match(html,/grid-template-columns:minmax\(148px,210px\) minmax\(0,1fr\) minmax\(158px,190px\)/);
  assert.match(html,/@media \(max-width:620px\)[\s\S]*grid-template-columns:minmax\(112px,142px\) minmax\(54px,1fr\) minmax\(110px,124px\)/);
  assert.match(html,/\.refresh-lane-last/);
  assert.match(html,/\.refresh-elapsed/);
});

test("la reasignación cambia sólo el sello factual; progreso e informes no lo rejuvenecen",()=>{
  assert.match(rtc,/HIGHSCORE_ASSIGNMENT_EVENT_SQL = "\(SELECT MAX\(e\.ts\)/);
  assert.match(rtc,/if \(assignmentChanged\) await addEvent\(env, id, "assign"/);
  assert.match(rtc,/await addEvent\(env, id, "assign", it\.from_name \|\| "Carlos"/);
  assert.doesNotMatch(rtc,/assignment_event_at[^\n]*(?:live_at|work_progress_at)/);
});
