import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');

test('la tanda conserva el orden circular desde la misión elegida', () => {
  assert.match(source, /const optionIndex = \(chosen \+ position\) % count/);
  assert.match(source, /const count = options\.length - 1/);
});

test('el plan canónico tiene sólo tres tareas delegables y owners ligados al equipo', () => {
  const body = source.match(/function batchMissionPlan\(title, agent, machine\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.equal([...body.matchAll(/\{ code:/g)].length, 3);
  assert.equal([...body.matchAll(/scopedAgentIdentity\(base, machine, "sub"\)/g)].length, 2);
  assert.equal([...body.matchAll(/scopedAgentIdentity\(base, machine, "infra"\)/g)].length, 1);
});

test('la cola no avanza sin evento de aceptación del Agente', () => {
  assert.match(source, /ticket\.status !== "resolved" \|\| !\(await batchClosureAccepted/);
  assert.match(source, /requires: \["evidence", "accepted_by"\]/);
});

test('/fleet/informe acepta y avanza una misión decision-batch sólo tras proof y firma válida', () => {
  const start = source.indexOf('if (url.pathname === "/fleet/informe" && req.method === "POST")');
  const end = source.indexOf('// CANCELAR una misión', start);
  const endpoint = source.slice(start, end);
  assert.ok(start > 0 && end > start, 'no se encontró el endpoint /fleet/informe');
  assert.match(endpoint, /if \(!normImage\.value\) \{[\s\S]*?return json/);
  assert.match(endpoint, /SELECT id, assignee, status, source FROM tickets/);
  assert.match(endpoint, /if \(crossSign\) \{[\s\S]*?\} else \{[\s\S]*?acceptBatchInformeClosure\(env, t, mid, owner, report\)/);

  const helper = source.match(/async function acceptBatchInformeClosure\([^]*?\n\}/)?.[0] || '';
  assert.match(helper, /ticket\.source !== "decision-batch"/);
  assert.match(helper, /const agent = String\(ticket\.assignee \|\| owner \|\| "Agente"\)/);
  assert.match(helper, /addEvent\(env, missionId, "accept", agent/);
  assert.match(helper, /batchForMission\(env, missionId\)/);
  assert.match(helper, /activateNextMissionBatchItem\(env, batchId\)/);
});

test('la aceptación por informe usa la identidad del agente y activa exactamente una vez', async () => {
  const helper = source.match(/async function acceptBatchInformeClosure\([^]*?\n\}/)?.[0] || '';
  const context = vm.createContext({calls: []});
  vm.runInContext(`
    async function addEvent(env, missionId, kind, author, text) {
      calls.push({type:'event', missionId, kind, author, text});
    }
    async function batchForMission(env, missionId) {
      calls.push({type:'lookup', missionId});
      return 'BATCH-1';
    }
    async function activateNextMissionBatchItem(env, batchId) {
      calls.push({type:'activate', batchId});
      return {id:batchId,status:'active'};
    }
    ${helper}
    globalThis.accept = acceptBatchInformeClosure;
  `, context);
  const result = await context.accept({}, {source:'decision-batch',assignee:'OraculoMini'}, 'MIS-DEC-AbC-01', 'InfraOraculoMini', 'Informe');
  assert.equal(result.id, 'BATCH-1');
  assert.deepEqual(JSON.parse(JSON.stringify(context.calls)), [
    {type:'event',missionId:'MIS-DEC-AbC-01',kind:'accept',author:'OraculoMini',text:'Cierre aceptado por el Agente mediante informe con prueba. Informe'},
    {type:'lookup',missionId:'MIS-DEC-AbC-01'},
    {type:'activate',batchId:'BATCH-1'}
  ]);
  context.calls.length = 0;
  assert.equal(await context.accept({}, {source:'fleet',assignee:'OraculoMini'}, 'FLT-1', 'InfraOraculoMini', 'Informe'), null);
  assert.equal(context.calls.length, 0);
});
