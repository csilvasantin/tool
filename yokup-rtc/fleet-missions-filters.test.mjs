import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {FLEET_MISSIONS_LIMIT, FLEET_MISSIONS_MAX_LIMIT, normalizeFleetMissionsFilters, fleetMissionsQuery} from './src/mission-sources.js';
import {agentFamilyKey, agentFamilySqlKey, machineIdentityKey, machineIdentitySqlKey} from './src/agent-identity.js';

// Misión DCL-d65ad512 (Neo·MBP14, 2026-09-05): /fleet/missions ignoraba ?agent= y se
// cortaba en 120. Con 110 misiones de GrokBot en un día, las de cualquier otro agente
// desaparecían de /misiones aunque el marcador las contara.
function seed() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE tickets (id TEXT PRIMARY KEY, subject TEXT, loc TEXT, project TEXT, project_id TEXT,
    role TEXT, source TEXT, status TEXT, assignee TEXT, created_at INTEGER, updated_at INTEGER, parent_id TEXT,
    project_inherited INTEGER, project_inherited_from TEXT, proof_image TEXT)`);
  const ins = db.prepare('INSERT INTO tickets(id,subject,loc,project,project_id,role,source,status,assignee,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  for (let i = 0; i < 130; i += 1) ins.run(`FLT-GROK-${i}`, `TG #${i}`, 'grokbot', 'admira-live', 'admira-live', 'mission', 'fleet', 'open', 'DisneyGrokBot', 1000 + i, 1000 + i);
  ins.run('DCL-NEO-1', 'XpaceOS portada', 'MacBookProNegro14', 'xpaceos', 'xpaceos', 'mission', 'cli-declare', 'resolved', 'NeoMBP14', 500, 500);
  ins.run('DCL-NEO-2', 'Yokup contrato', 'MacBookProNegro14', 'yokup', 'yokup', 'mission', 'cli-declare', 'in_progress', 'NeoMBP14', 600, 600);
  ins.run('FLT-MORFEO', 'session-ping', 'MacMini', 'xpaceos', 'xpaceos', 'mission', 'fleet', 'open', 'MorfeoMacMini', 700, 700);
  return db;
}
const keys = {agentSqlKey:agentFamilySqlKey, agentKey:agentFamilyKey, machineSqlKey:machineIdentitySqlKey, machineKey:machineIdentityKey};
const run = (db, q) => db.prepare(q.sql).all(...q.binds);
const count = (db, q) => db.prepare(q.countSql).get(...q.countBinds).c;

test('sin parámetros no hay filtro: el contrato histórico se conserva', () => {
  const f = normalizeFleetMissionsFilters({});
  assert.equal(f.ok, true); assert.equal(f.filtered, false); assert.equal(f.limit, FLEET_MISSIONS_LIMIT); assert.equal(f.offset, 0);
});

test('?agent= devuelve SOLO las misiones de ese agente aunque otro haya creado 130', () => {
  const db = seed();
  const f = normalizeFleetMissionsFilters({agent:'NeoMBP14'});
  assert.equal(f.filtered, true);
  const rows = run(db, fleetMissionsQuery(f, keys));
  assert.deepEqual(rows.map((r) => r.id).sort(), ['DCL-NEO-1', 'DCL-NEO-2']);
  assert.equal(count(db, fleetMissionsQuery(f, keys)), 2);
  // la misma persona escrita de otra forma (familia de identidad) también casa
  const alias = run(db, fleetMissionsQuery(normalizeFleetMissionsFilters({agent:'Neo MBP14'}), keys));
  assert.equal(alias.length, 2);
});

test('project_id, status y machine acotan; active = open/in_progress/unconcluded', () => {
  const db = seed();
  assert.deepEqual(run(db, fleetMissionsQuery(normalizeFleetMissionsFilters({project_id:'xpaceos'}), keys)).map((r) => r.id).sort(), ['DCL-NEO-1', 'FLT-MORFEO']);
  assert.deepEqual(run(db, fleetMissionsQuery(normalizeFleetMissionsFilters({agent:'NeoMBP14', status:'active'}), keys)).map((r) => r.id), ['DCL-NEO-2']);
  assert.deepEqual(run(db, fleetMissionsQuery(normalizeFleetMissionsFilters({machine:'MacBookProNegro14', status:'resolved'}), keys)).map((r) => r.id), ['DCL-NEO-1']);
  assert.equal(normalizeFleetMissionsFilters({status:'loquesea'}).ok, false);
});

test('pagina con limit/offset, tope 500 y cuenta el total sin cortar', () => {
  const db = seed();
  const p1 = normalizeFleetMissionsFilters({agent:'DisneyGrokBot', limit:'50', offset:'0'});
  const p3 = normalizeFleetMissionsFilters({agent:'DisneyGrokBot', limit:'50', offset:'100'});
  assert.equal(run(db, fleetMissionsQuery(p1, keys)).length, 50);
  assert.equal(run(db, fleetMissionsQuery(p3, keys)).length, 30);
  assert.equal(count(db, fleetMissionsQuery(p1, keys)), 130, 'el total no se capa a 120');
  assert.equal(normalizeFleetMissionsFilters({limit:'9999'}).limit, FLEET_MISSIONS_MAX_LIMIT);
  assert.equal(normalizeFleetMissionsFilters({limit:'0'}).ok, false);
  assert.equal(normalizeFleetMissionsFilters({offset:'-1'}).ok, false);
});

test('el orden es el de siempre: vivas primero, luego por fecha desc e id', () => {
  const db = seed();
  const rows = run(db, fleetMissionsQuery(normalizeFleetMissionsFilters({project_id:'xpaceos'}), keys));
  assert.deepEqual(rows.map((r) => r.id), ['FLT-MORFEO', 'DCL-NEO-1']);
});
