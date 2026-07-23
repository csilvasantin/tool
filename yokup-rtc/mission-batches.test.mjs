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

test('/fleet/informe acepta y deja esperando continuación sólo tras proof y firma válida', () => {
  const start = source.indexOf('if (url.pathname === "/fleet/informe" && req.method === "POST")');
  const end = source.indexOf('// CANCELAR una misión', start);
  const endpoint = source.slice(start, end);
  assert.ok(start > 0 && end > start, 'no se encontró el endpoint /fleet/informe');
  assert.match(endpoint, /if \(!normImage\.value\) \{[\s\S]*?return json/);
  assert.match(endpoint, /SELECT id, assignee, status, source, screen FROM tickets/);
  assert.match(endpoint, /if \(crossSign\) \{[\s\S]*?\} else \{[\s\S]*?acceptBatchInformeClosure\(env, t, mid, owner, report\)/);

  const helper = source.match(/async function acceptBatchInformeClosure\([^]*?\n\}/)?.[0] || '';
  assert.match(helper, /ticket\.source !== "decision-batch"/);
  assert.match(helper, /const agent = String\(ticket\.assignee \|\| owner \|\| "Agente"\)/);
  assert.match(helper, /addEvent\(env, missionId, "accept", agent/);
  assert.match(helper, /batchForMission\(env, missionId\)/);
  assert.match(helper, /completeBatchMissionAndAwaitContinuation\(env, batchId, missionId\)/);
  assert.doesNotMatch(helper, /activateNextMissionBatchItem/);
});

test('la aceptación por informe usa la identidad del agente y no autoactiva otra misión', async () => {
  const helper = source.match(/async function acceptBatchInformeClosure\([^]*?\n\}/)?.[0] || '';
  const context = vm.createContext({calls: []});
  vm.runInContext(`
    async function batchClosureAccepted(env, missionId) {
      calls.push({type:'accepted?', missionId});
      return false;
    }
    async function addEvent(env, missionId, kind, author, text) {
      calls.push({type:'event', missionId, kind, author, text});
    }
    async function batchForMission(env, missionId) {
      calls.push({type:'lookup', missionId});
      return 'BATCH-1';
    }
    async function completeBatchMissionAndAwaitContinuation(env, batchId, missionId) {
      calls.push({type:'await', batchId, missionId});
      return {id:batchId,status:'awaiting_continuation'};
    }
    ${helper}
    globalThis.accept = acceptBatchInformeClosure;
  `, context);
  const result = await context.accept({}, {source:'decision-batch',assignee:'OraculoMini'}, 'MIS-DEC-AbC-01', 'InfraOraculoMini', 'Informe');
  assert.equal(result.status, 'awaiting_continuation');
  assert.deepEqual(JSON.parse(JSON.stringify(context.calls)), [
    {type:'accepted?',missionId:'MIS-DEC-AbC-01'},
    {type:'event',missionId:'MIS-DEC-AbC-01',kind:'accept',author:'OraculoMini',text:'Cierre aceptado por el Agente mediante informe con prueba. Informe'},
    {type:'lookup',missionId:'MIS-DEC-AbC-01'},
    {type:'await',batchId:'BATCH-1',missionId:'MIS-DEC-AbC-01'}
  ]);
  context.calls.length = 0;
  assert.equal(await context.accept({}, {source:'fleet',assignee:'OraculoMini'}, 'FLT-1', 'InfraOraculoMini', 'Informe'), null);
  assert.equal(context.calls.length, 0);
});

test('el cierre completa la activa y persiste awaiting_continuation si quedan candidatas', () => {
  const helper = source.match(/async function completeBatchMissionAndAwaitContinuation\([^]*?\n\}/)?.[0] || '';
  assert.match(helper, /ticket\.status !== "resolved" \|\| !\(await batchClosureAccepted/);
  assert.match(helper, /SET status='completed'/);
  assert.match(helper, /status='awaiting_continuation'/);
  assert.match(helper, /Esperando una nueva decisión de 5 minutos/);
  assert.doesNotMatch(helper, /activateNextMissionBatchItem/);
});

test('la reparación sólo reencola una activa totalmente prístina y es idempotente', () => {
  const helper = source.match(/async function requeuePristineBatchMission\([^]*?\n\}/)?.[0] || '';
  const endpoint = source.slice(
    source.indexOf('if (url.pathname === "/fleet/batch/requeue-pristine"'),
    source.indexOf('// VÍA PARA AGENTES', source.indexOf('if (url.pathname === "/fleet/batch/requeue-pristine"'))
  );
  assert.match(endpoint, /requeuePristineBatchMission\(env, mid\)/);
  assert.match(helper, /item_status === "queued"[\s\S]*already_queued: true/);
  assert.match(helper, /ticket_status !== "in_progress" \|\| row\.source !== "decision-batch"/);
  assert.match(helper, /row\.proof_image \|\| row\.live_shot \|\| row\.live_at \|\| row\.resolved_at/);
  assert.match(helper, /status!='pending'[\s\S]*TRIM\(report\)[\s\S]*TRIM\(image\)/);
  assert.match(helper, /NOT\(kind='log' AND text LIKE 'Misión activada desde la cola %'\)/);
  assert.match(helper, /DELETE FROM mission_tasks/);
  assert.match(helper, /SET status='queued'/);
  assert.match(helper, /SET status='awaiting_continuation'/);
});

test('la reparación ejecuta el batch prístino, repite como no-op y rechaza progreso', async () => {
  const helper = source.match(/async function requeuePristineBatchMission\([^]*?\n\}/)?.[0] || '';
  const context = vm.createContext({});
  vm.runInContext(`
    async function missionBatchSnapshot(env, batchId) {
      return {id:batchId,status:'awaiting_continuation'};
    }
    ${helper}
    globalThis.requeue = requeuePristineBatchMission;
  `, context);
  const active = {
    batch_id:'BATCH-1', position:1, item_status:'active', batch_status:'active',
    active_mission_id:'MIS-02', ticket_id:'MIS-02', ticket_status:'in_progress',
    source:'decision-batch', proof_image:null, live_shot:null, live_at:null, resolved_at:null
  };
  const makeEnv = ({row=active, taskDirty=0, eventDirty=0, pending=null}={}) => {
    const batches = [];
    const DB = {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              sql, args,
              async first() {
                if (sql.startsWith('SELECT i.batch_id')) return row;
                if (sql.startsWith('SELECT id FROM decisions')) return pending;
                if (sql.startsWith('SELECT COUNT(*) AS total')) return {total:3,dirty:taskDirty};
                if (sql.startsWith('SELECT COUNT(*) AS dirty')) return {dirty:eventDirty};
                throw new Error('consulta no simulada: ' + sql);
              }
            };
          }
        };
      },
      async batch(statements) { batches.push(statements); }
    };
    return {env:{DB},batches};
  };

  const pristine = makeEnv();
  const repaired = await context.requeue(pristine.env, 'MIS-02');
  assert.equal(repaired.requeued, true);
  assert.equal(repaired.batch.status, 'awaiting_continuation');
  assert.equal(pristine.batches.length, 1);
  assert.equal(pristine.batches[0].length, 5);

  const queued = makeEnv({row:{...active,item_status:'queued',batch_status:'awaiting_continuation',active_mission_id:null,ticket_id:null}});
  const repeated = await context.requeue(queued.env, 'MIS-02');
  assert.equal(repeated.already_queued, true);
  assert.equal(queued.batches.length, 0);

  const dirty = makeEnv({taskDirty:1});
  const rejected = await context.requeue(dirty.env, 'MIS-02');
  assert.equal(rejected.status, 409);
  assert.match(rejected.error, /tareas iniciadas/);
  assert.equal(dirty.batches.length, 0);

  const proof = makeEnv({row:{...active,proof_image:'https://api.yokup.com/media/proof.png'}});
  assert.equal((await context.requeue(proof.env, 'MIS-02')).status, 409);
  assert.equal(proof.batches.length, 0);
});
