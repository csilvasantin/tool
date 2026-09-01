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

test("la primera columna ordena nombre, inicio factual y fin factual",()=>{
  assert.match(html,/class="refresh-agent-meta"><span class="refresh-agent"[\s\S]*data-race-time="start"[\s\S]*marcaTemporal/);
  assert.match(html,/data-race-time="elapsed" data-work-state="running"/);
  assert.match(html,/data-race-time="end" datetime="/);
  assert.match(html,/aria-label="Responsable ' \+ esc\(identidadVisible\.nombre\) \+ '\. Hora de inicio ' \+ esc\(resumen\.startedClock\) \+ esc\(timingAria\)/);
  assert.match(html,/startedAt:Number\(item\.work_started_at\) \|\| 0/);
  assert.match(html,/startedClock:horaMadrid\(trabajo\.startedAt\)/);
  assert.doesNotMatch(html,/startedClock:horaMadrid\(trabajo\.(?:assignmentAt|at|presenceAt|endedAt)\)/);
  assert.match(html,/\.refresh-agent-meta\{[^}]*display:inline-flex[^}]*min-width:0/);
  assert.match(html,/\.refresh-agent\{[^}]*min-width:0[^}]*text-overflow:ellipsis/);
  assert.match(html,/\.refresh-started,\.refresh-ended\{[^}]*flex:0 0 auto[^}]*white-space:nowrap/);
  assert.doesNotMatch(html,/class="refresh-time"|class="refresh-work-state"/);
});

test("desktop y móvil reservan ancho al nombre+dos tiempos y dejan el resto a la pista",()=>{
  assert.match(html,/grid-template-columns:minmax\(220px,300px\) minmax\(0,1fr\)/);
  assert.match(html,/@media \(max-width:620px\)[\s\S]*grid-template-columns:minmax\(150px,190px\) minmax\(54px,1fr\)/);
  assert.match(html,/\.refresh-lane-last/);
  assert.match(html,/\.refresh-elapsed/);
});

test("la reasignación cambia sólo el sello factual; progreso e informes no lo rejuvenecen",()=>{
  assert.match(rtc,/HIGHSCORE_ASSIGNMENT_EVENT_SQL = "\(SELECT MAX\(e\.ts\)/);
  assert.match(rtc,/if \(assignmentChanged\) await addEvent\(env, id, "assign"/);
  assert.match(rtc,/await addEvent\(env, id, "assign", it\.from_name \|\| "Carlos"/);
  assert.doesNotMatch(rtc,/assignment_event_at[^\n]*(?:live_at|work_progress_at)/);
});
