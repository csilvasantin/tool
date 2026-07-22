import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');
const names = ['isBackOption','isInitialMissionDecision','isContinuationMissionDecision','isMissionDecision','orderedMissionOptions','continuationMissionOrder','remainingBatchItems'];
const functions = names.map((name) => source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))?.[0] || '').join('\n');
const context = vm.createContext({});
vm.runInContext(`${functions}\nglobalThis.contract={isInitialMissionDecision,isContinuationMissionDecision,isMissionDecision,continuationMissionOrder,remainingBatchItems};`, context);
const contract = context.contract;
const back = 'Volver atrás';

test('la decisión inicial conserva exactamente cinco misiones más back', () => {
  assert.equal(contract.isInitialMissionDecision(['1','2','3','4','5',back]), true);
  assert.equal(contract.isInitialMissionDecision(['1','2','3','4',back]), false);
  assert.equal(contract.isInitialMissionDecision(['1','2','3','4','5','6',back]), false);
});

test('las continuaciones aceptan la secuencia 4→3→2→1 más back sólo si están enlazadas', () => {
  for (const count of [4,3,2,1]) {
    const options = Array.from({length:count}, (_, i) => `Misión ${i + 1}`).concat(back);
    assert.equal(contract.isContinuationMissionDecision(options, {parent_decision:'DEC-parent',batch_id:'BATCH-parent'}), true);
    assert.equal(contract.isContinuationMissionDecision(options, {}), false);
  }
});

test('batch_id añadido a una decisión inicial no la reclasifica como continuación', () => {
  const initial = ['1','2','3','4','5',back];
  assert.equal(contract.isContinuationMissionDecision(initial, {batch_id:'BATCH-initial'}), false);
  assert.equal(contract.isMissionDecision(initial, {batch_id:'BATCH-initial'}), true);
});

test('la continuación rota desde chosen sin crear ni duplicar elementos', () => {
  const queued = [1,2,3,4].map((n, position) => ({title:`Misión ${n}`,position}));
  const ordered = contract.continuationMissionOrder(['Misión 1','Misión 2','Misión 3','Misión 4',back], 2, queued);
  assert.deepEqual(Array.from(ordered, (item) => item.title), ['Misión 3','Misión 4','Misión 1','Misión 2']);
  assert.equal(new Set(Array.from(ordered, (item) => item.title)).size, 4);
});

test('rechaza completadas reintroducidas y títulos duplicados', () => {
  const queued = [{title:'Pendiente B',position:1},{title:'Pendiente C',position:2}];
  assert.equal(contract.continuationMissionOrder(['Completada A','Pendiente B',back], 0, queued).length, 0);
  assert.equal(contract.continuationMissionOrder(['Pendiente B','Pendiente B',back], 0, queued).length, 0);
});

test('reconcilia queued obsoletos contra ticket resolved/cancelled y deja sólo FLT-975/976', () => {
  const rows = [
    {mission_id:'FLT-973',title:'Antigua 973',status:'queued',ticket_status:'resolved',position:1},
    {mission_id:'FLT-974',title:'Antigua 974',status:'queued',ticket_status:'cancelled',position:2},
    {mission_id:'FLT-975',title:'Pendiente 975',status:'queued',ticket_status:'open',position:3},
    {mission_id:'FLT-976',title:'Pendiente 976',status:'queued',ticket_status:'open',position:4}
  ];
  const remaining = contract.remainingBatchItems(rows);
  assert.deepEqual(Array.from(remaining, (item) => item.mission_id), ['FLT-975','FLT-976']);
  assert.equal(contract.continuationMissionOrder(['Antigua 973','Antigua 974','Pendiente 975','Pendiente 976',back], 0, remaining).length, 0, 'las opciones obsoletas ya no pasan el contrato');
  assert.equal(contract.continuationMissionOrder(['Pendiente 975','Pendiente 976',back], 0, remaining).length, 2);
});

test('chosen, back y expiry conservan el desenlace contractual', () => {
  assert.match(source, /const effective = decision\.status === "decided" \? Number\(decision\.chosen\) : decision\.status === "expired" \? Number\(decision\.recommended\) : null/);
  assert.match(source, /const back = idx === o\.length - 1 && isMissionDecision\(o, d\)/);
  assert.match(source, /\.bind\(back \? "cancelled" : "decided", idx/);
});

test('parent_decision y batch_id migran, persisten y viajan en GET/POST', () => {
  assert.match(source, /ALTER TABLE decisions ADD COLUMN parent_decision TEXT/);
  assert.match(source, /ALTER TABLE decisions ADD COLUMN batch_id TEXT/);
  assert.match(source, /project,parent_decision,batch_id\) VALUES/);
  assert.match(source, /parent_decision: d\.parent_decision \|\| "", batch_id: d\.batch_id \|\| ""/);
});

test('el POST no trunca contratos largos ni admite dos continuaciones pendientes', () => {
  assert.match(source, /rawOpts\.length !== opts\.length/);
  assert.match(source, /SELECT id FROM decisions WHERE batch_id=\? AND status='pending' LIMIT 1/);
  assert.match(source, /error: "continuation_pending"/);
});

test('una continuación reutiliza el batch y sólo reordena filas queued', () => {
  const body = source.match(/async function ensureMissionBatchFromDecision\([^]*?\n\}/)?.[0] || '';
  assert.match(body, /if \(continuation\)/);
  assert.match(body, /reconcileQueuedBatchItems\(env, batchId\)/);
  assert.match(body, /await env\.DB\.batch\(statements\)/, 'el reordenado se aplica atómicamente');
  assert.match(body, /return activateNextMissionBatchItem\(env, batchId\)/);
  assert.equal((body.match(/INSERT OR IGNORE INTO mission_batches/g) || []).length, 1, 'el único INSERT pertenece a la rama inicial');
});

test('snapshot, activación y POST reconcilian estados reales antes de exponer remaining', () => {
  assert.match(source, /SELECT i\.\*,t\.status AS ticket_status FROM mission_batch_items i LEFT JOIN tickets t ON t\.id=i\.mission_id/);
  assert.match(source, /item\.ticket_status === "cancelled" \? "cancelled" : "completed"/);
  assert.ok((source.match(/reconcileQueuedBatchItems\(env,/g) || []).length >= 4);
});
