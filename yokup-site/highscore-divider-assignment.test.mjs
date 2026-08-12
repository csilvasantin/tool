import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const html=await readFile(new URL("./highscore.html",import.meta.url),"utf8");
const rtc=await readFile(new URL("../yokup-rtc/src/index.js",import.meta.url),"utf8");

test("la banda HIGHSCORE+mute queda después de la carrera y antes de podio y tabla",()=>{
  const race=html.indexOf('id="refreshRace"'),divider=html.indexOf('id="scoreDivider"');
  const podio=html.indexOf('id="podio" hidden'),table=html.indexOf('class="table-scroll"');
  assert.ok(race<divider && divider<podio && podio<table);
  assert.match(html,/\.score-divider\{[^}]*width:100%[^}]*border-top:[^}]*border-bottom:/);
  assert.match(html,/id="podiumToggle"[^>]*aria-expanded="false"[^>]*aria-controls="podio"/);
  assert.match(html,/id="btnSonido"[^>]*aria-pressed="false"/);
  assert.match(html,/btnSonido"\)\.addEventListener\("click", function \(e\) \{ e\.stopPropagation\(\)/);
  assert.doesNotMatch(html,/<header class="cab">\s*<h1/);
});

test("la primera columna conserva nombre y hora factual inmediata sin sacrificar la hora",()=>{
  assert.match(html,/class="refresh-agent-meta"><span class="refresh-agent"[\s\S]*<time class="refresh-assignment"/);
  assert.match(html,/assignmentAt:Number\(item\.assignment_at\) \|\| 0/);
  assert.match(html,/assignmentClock:horaMadrid\(trabajo\.assignmentAt\)/);
  assert.doesNotMatch(html,/assignmentClock:horaMadrid\(trabajo\.(?:at|presenceAt|endedAt)\)/);
  assert.match(html,/\.refresh-agent-meta\{[^}]*display:inline-flex[^}]*min-width:0/);
  assert.match(html,/\.refresh-agent\{[^}]*min-width:0[^}]*text-overflow:ellipsis/);
  assert.match(html,/\.refresh-assignment\{[^}]*flex:0 0 auto[^}]*white-space:nowrap/);
});

test("desktop y móvil reservan ancho al nombre+hora manteniendo pista y elapsed",()=>{
  assert.match(html,/grid-template-columns:minmax\(150px,220px\) minmax\(0,1fr\) minmax\(196px,228px\)/);
  assert.match(html,/@media \(max-width:620px\)[\s\S]*grid-template-columns:minmax\(92px,126px\) minmax\(0,1fr\) minmax\(168px,184px\)/);
  assert.match(html,/\.refresh-lane-last/);
  assert.match(html,/\.refresh-elapsed/);
});

test("la reasignación cambia sólo el sello factual; progreso e informes no lo rejuvenecen",()=>{
  assert.match(rtc,/HIGHSCORE_ASSIGNMENT_EVENT_SQL = "\(SELECT MAX\(e\.ts\)/);
  assert.match(rtc,/if \(assignmentChanged\) await addEvent\(env, id, "assign"/);
  assert.match(rtc,/await addEvent\(env, id, "assign", it\.from_name \|\| "Carlos"/);
  assert.doesNotMatch(rtc,/assignment_event_at[^\n]*(?:live_at|work_progress_at)/);
});
