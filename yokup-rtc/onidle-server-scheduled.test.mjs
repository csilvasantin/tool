import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./src/index.js",import.meta.url),"utf8");
const client=await readFile(new URL("./tools/onidle-hora.sh",import.meta.url),"utf8");
const installer=await readFile(new URL("./tools/install-onidle-hora.sh",import.meta.url),"utf8");

test("OnIDLE corre dentro de la rutina única protegida por lease",()=>{
  const routine=source.slice(source.indexOf("async function runScheduledRoutine"),source.indexOf("var scheduledPiggybackAt"));
  assert.match(routine,/step\("onIdle", \(\) => runOnIdleTick\(env\)\)/);
  assert.match(source,/tryAcquireBeatLease\(env, "__scheduled", 120000\)/);
  assert.match(source,/CREATE TABLE IF NOT EXISTS onidle_ticks/);
  assert.match(source,/PRIMARY KEY\(identity_key,day,ordinal\)/);
  assert.match(source,/decision_id TEXT NOT NULL UNIQUE/);
});

test("publicación es determinista, atómica y repara una reserva",()=>{
  assert.match(source,/DEC-ONIDLE-/);
  assert.match(source,/INSERT OR IGNORE INTO onidle_ticks/);
  assert.match(source,/INSERT OR IGNORE INTO decisions/);
  assert.match(source,/env\.DB\.batch\(\[reserve, decision, mark\]\)/);
  assert.match(source,/UPDATE onidle_ticks SET status='published'/);
  assert.match(source,/ordinal > ONIDLE_DAILY_LIMIT/);
});

test("bloquea trabajo y cualquier decisión pending, con identidad y proyecto exactos",()=>{
  assert.match(source,/SELECT id,agent,machine,deadline FROM decisions WHERE status='pending'/);
  assert.doesNotMatch(source,/SELECT id,agent,machine,deadline FROM decisions WHERE status='pending' AND deadline/);
  const state=source.slice(source.indexOf("async function operationalOnIdleState"),source.indexOf("__name(operationalOnIdleState"));
  assert.doesNotMatch(state,/filter\(owns\)|const owns/,
    "misión, tarea, decisión y cupo deben bloquear globalmente, no por candidato");
  assert.match(state,/const live = \(decisionResult\.results \|\| \[\]\)\.length/);
  assert.match(state,/const windowsToday = usedRows\.length/);
  assert.match(source,/scheduledOnIdleAssignments/);
  assert.match(source,/exactDecisionProjectAssignment\(env, identity\.agent, identity\.machine, project\.id\)/);
  assert.match(source,/operationalOnIdleState\(env, identity, now\)/);
  const publish=source.slice(source.indexOf("async function publishScheduledOnIdle"),source.indexOf("__name(publishScheduledOnIdle"));
  assert.match(publish,/SELECT 1 FROM decisions WHERE status='pending'/);
  assert.match(publish,/SELECT 1 FROM tickets WHERE status IN \('in_progress','unconcluded'\)/);
  assert.match(publish,/SELECT 1 FROM mission_tasks m JOIN tickets t ON t\.id=m\.mission_id/);
  assert.doesNotMatch(publish,/replace\(lower\(agent\).*identity\.agent/);
  assert.match(source,/return out\.sort\(\(a, b\) => a\.identity_key\.localeCompare\(b\.identity_key\)\)/);
});

test("cliente e instalador no publican, vigilan ni reproducen audio",()=>{
  assert.match(client,/fleet\/onidle-state/);
  assert.doesNotMatch(client,/\/decisions|onidle-proposals|afplay|Glass|Ping|--watch/);
  assert.match(installer,/launchctl bootout/);
  assert.match(installer,/retired-server-scheduled/);
  assert.doesNotMatch(installer,/bootstrap|StartCalendarInterval|RunAtLoad/);
});
