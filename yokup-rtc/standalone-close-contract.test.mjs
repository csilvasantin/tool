import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('./src/index.js',import.meta.url),'utf8');
const reconcile=source.slice(source.indexOf('async function fleetReconcileMission'),source.indexOf('__name(fleetReconcileMission'));
const informe=source.slice(source.indexOf('if (url.pathname === "/fleet/informe"'),source.indexOf('// CANCELAR una misión'));

test('task-status done con proof no cierra standalone antes del informe',()=>{
  assert.match(reconcile,/hasInforme = tasks\.some/);
  assert.match(reconcile,/reportsComplete = tasks\.every/);
  assert.match(reconcile,/allDone && proof && hasInforme && reportsComplete/);
  assert.match(reconcile,/blocked:"sin-informe"/);
});

test('informe primero completa atómicamente tarea standalone y ticket',()=>{
  const update=/UPDATE mission_tasks SET status='done',report=COALESCE\(NULLIF\(TRIM\(report\),''\),\?\),ended_at=COALESCE\(ended_at,\?\),updated_at=\? WHERE mission_id=\? AND code!='z1' AND status!='done' AND EXISTS\(SELECT 1 FROM tickets WHERE id=\? AND role='standalone-task'\)/;
  assert.match(informe,update);
  assert.ok(informe.indexOf("UPDATE tickets SET status='resolved'") < informe.search(update));
});

test('misión standalone ya resuelta por contrato viejo acepta reparar z1 una vez',()=>{
  assert.match(informe,/repairStandalone = t\.role === "standalone-task" && !previous/);
  assert.match(informe,/t\.proof_kind === "final" && t\.proof_image === rawImage/);
  assert.match(informe,/repaired_standalone:true/);
  assert.match(informe,/UPDATE mission_tasks SET status='done',report=COALESCE\(NULLIF\(TRIM\(report\),''\),\?\),ended_at=COALESCE\(ended_at,\?\),updated_at=\? WHERE mission_id=\? AND code!='z1' AND status!='done'/);
});
