import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {CANONICAL_MISSION_SOURCES, FLEET_MISSIONS_LIMIT, FLEET_MISSIONS_SQL} from './src/mission-sources.js';

const workerSource = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');

function fleetMissionsFunction(context) {
  const start = workerSource.indexOf('async function fleetMissions(env)');
  const end = workerSource.indexOf('__name(fleetMissions', start);
  assert.ok(start > 0 && end > start, 'fleetMissions existe en el worker');
  const block = workerSource.slice(start, end);
  return vm.runInNewContext(`(function(){${block};return fleetMissions;})()`, context);
}

function seedDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE tickets (
    id TEXT PRIMARY KEY, screen TEXT, subject TEXT, loc TEXT, project TEXT, project_id TEXT,
    role TEXT, source TEXT, status TEXT, assignee TEXT, agent_runtime TEXT, agent_host TEXT,
    proof_image TEXT, live_shot TEXT, live_at INTEGER, live_kind TEXT, live_surface TEXT,
    live_context TEXT, created_at INTEGER, updated_at INTEGER, note TEXT, parent_id TEXT,
    project_inherited INTEGER, project_inherited_from TEXT, points_start INTEGER, points_end INTEGER
  )`);
  const insert = db.prepare(
    'INSERT INTO tickets(id,subject,source,role,status,created_at,updated_at,project,project_id) VALUES(?,?,?,?,?,?,?,?,?)'
  );
  const add = (id, source, role, status, createdAt) =>
    insert.run(id, id, source, role, status, createdAt, createdAt, 'yokup', 'yokup');

  add('FLT-LIVE', 'fleet', 'mission', 'open', 100);
  add('MIS-DEC-LIVE', 'decision-batch', 'mission', 'open', 90);
  add('DCL-LIVE', 'cli-declare', 'mission', 'in_progress', 80);
  add('LEGACY-LIVE', 'legacy-import', 'mission', 'open', 70);
  add('FIELD-LIVE', 'field', 'field-ticket', 'open', 100000);
  add('FLT-TIE-A', 'fleet', 'mission', 'resolved', 30000);
  add('FLT-TIE-Z', 'fleet', 'mission', 'resolved', 30000);
  for (let index = 0; index < 130; index += 1) {
    add(`FLT-CLOSED-${String(index).padStart(3, '0')}`, 'fleet', 'mission', 'resolved', 10000 + index);
  }
  return db;
}

test('/fleet/missions conserva fuentes canónicas, árbol público, orden y límite', async () => {
  assert.deepEqual(CANONICAL_MISSION_SOURCES, ['fleet', 'decision-batch', 'cli-declare']);
  const db = seedDatabase();
  const tasks = [
    {mission_id:'DCL-LIVE', code:'a', title:'Ejecutar DCL', status:'in_progress', owner:'SubOraculoMini', created_at:80, updated_at:80, has_report:0},
    {mission_id:'FLT-LIVE', code:'a', title:'Ejecutar fleet', status:'pending', owner:'SubOraculoMini', created_at:100, updated_at:100, has_report:0}
  ];
  const context = {
    FLEET_MISSIONS_SQL,
    attachDisplayRefs:async () => {},
    taskDisplayKey:(row) => `${row.mission_id}:${row.code}`,
    selectIn:async (_env, ids, sqlFor) => {
      assert.equal(ids.length, FLEET_MISSIONS_LIMIT, 'el árbol cubre también feeds de más de 100 IDs');
      const sql = sqlFor(ids.map(() => '?').join(','));
      assert.match(sql, /FROM mission_tasks WHERE mission_id IN/);
      return tasks.filter((row) => ids.includes(row.mission_id));
    },
    projectIndex:async () => ({}),
    resolveProject:(_index, value) => ({name:value || ''}),
    tercios:(rows) => ({done:rows.filter((row) => row.status === 'done').length, total:3})
  };
  const fleetMissions = fleetMissionsFunction(context);
  const env = {DB:{prepare(sql) {
    assert.equal(sql, FLEET_MISSIONS_SQL, 'el endpoint usa el contrato SQL compartido');
    return {all:async () => ({results:db.prepare(sql).all()})};
  }}};

  const rows = await fleetMissions(env);
  const byId = new Map(rows.map((row) => [row.id, row]));

  assert.equal(rows.length, FLEET_MISSIONS_LIMIT);
  assert.equal(byId.get('DCL-LIVE').source, 'cli-declare');
  assert.deepEqual(JSON.parse(JSON.stringify(byId.get('DCL-LIVE').tasks)), [tasks[0]]);
  assert.equal(byId.get('FLT-LIVE').source, 'fleet');
  assert.equal(byId.get('MIS-DEC-LIVE').source, 'decision-batch');
  assert.equal(byId.has('LEGACY-LIVE'), false, 'role no amplía la allowlist pública de fuentes');
  assert.equal(byId.has('FIELD-LIVE'), false, 'un ticket de campo no entra en el universo de misión');

  for (const row of rows) {
    for (const forbidden of ['screen','note','agent_runtime','agent_host','ai_triage','report','image',
      'live_shot','live_context','live_kind','live_surface','points_start','points_end']) {
      assert.equal(Object.hasOwn(row, forbidden), false, `el feed público no expone ${forbidden}`);
    }
    assert.equal(Object.hasOwn(row, 'proof_image'), true, 'el feed público expone la prueba canónica');
  }
  assert.deepEqual(Object.keys(byId.get('DCL-LIVE').tasks[0]).sort(),
    ['code','created_at','has_report','mission_id','owner','status','title','updated_at'].sort());

  const activeIds = rows.filter((row) => row.status === 'open' || row.status === 'in_progress').map((row) => row.id);
  assert.deepEqual(activeIds, ['FLT-LIVE', 'MIS-DEC-LIVE', 'DCL-LIVE']);
  assert.ok(rows.slice(0, activeIds.length).every((row) => activeIds.includes(row.id)),
    'las 130 cerradas más recientes no ocultan ninguna activa antes del LIMIT');
  assert.ok(rows.findIndex((row) => row.id === 'FLT-TIE-A') < rows.findIndex((row) => row.id === 'FLT-TIE-Z'),
    'los empates se resuelven por id para que el límite sea determinista');
});

test('el árbol de 120 misiones se consulta en lotes D1 menores de 100 variables', async () => {
  const start = workerSource.indexOf('async function selectIn(env, ids, sqlFor)');
  const end = workerSource.indexOf('__name(selectIn', start);
  const block = workerSource.slice(start, end);
  const selectIn = vm.runInNewContext(`(function(){${block};return selectIn;})()`, {D1_MAX_VARS:90});
  const calls = [];
  const env = {DB:{prepare(sql) { return {bind(...ids) { return {all:async () => {
    calls.push({sql, ids}); return {results:ids.map((id) => ({id}))};
  }}; }}; }}};
  const ids = Array.from({length:120}, (_, index) => `M-${index}`);
  const rows = await selectIn(env, ids, (placeholders) => `SELECT id FROM x WHERE id IN (${placeholders})`);
  assert.deepEqual(calls.map((call) => call.ids.length), [90,30]);
  assert.deepEqual(JSON.parse(JSON.stringify(rows.map((row) => row.id))), ids);
});
