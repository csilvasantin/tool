import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {FLEET_MISSION_SERIES_START, nextFreeFleetId, fleetMissionId, resolveFleetMissionReference} from './src/index.js';

// FLT-2705 (Carlos, 6-sep-2026): «la misión y el encargo no deberían tener el mismo número».
// Una misión nueva nace en la serie propia (≥ FLT-100001); el número del encargo (#n) sólo
// se adopta cuando esa misión histórica ya existe y es demostrablemente el mismo encargo.
function d1(database) {
  const statement = (sql, args = []) => ({
    bind(...values) { return statement(sql, values); },
    async first() { return database.prepare(sql).get(...args) || null; },
    async all() { return {results: database.prepare(sql).all(...args)}; },
    async run() { return {meta: database.prepare(sql).run(...args)}; }
  });
  return { async exec(sql) { database.exec(sql); }, prepare(sql) { return statement(sql); } };
}
function fresh() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE tickets(id TEXT PRIMARY KEY,screen TEXT,subject TEXT,loc TEXT,role TEXT,status TEXT,
    priority TEXT,assignee TEXT,source TEXT,ai_triage TEXT,created_at INTEGER,updated_at INTEGER,resolved_at INTEGER);
    CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT,ticket_id TEXT,ts INTEGER,kind TEXT,author TEXT,text TEXT);
    CREATE TABLE fleet_ids(inbox_id INTEGER PRIMARY KEY,mission_id TEXT UNIQUE,created_at INTEGER);`);
  return {db, env:{DB:d1(db), TELEGRAM:null}};
}
const encargo = (id, text) => ({id, text, from_name:'Carlos', target_persona:'Smith', target_machine:'macmini'});

test('una misión nueva nunca lleva el número de su encargo: nace en la serie propia', async () => {
  const {db, env} = fresh();
  const mid = await fleetMissionId(env, encargo(2702, 'PRUEBA coord Smith CLI · bandera ASCII (máx 8 líneas) y informe corto'));
  assert.equal(mid, 'FLT-' + FLEET_MISSION_SERIES_START);
  assert.notEqual(mid, 'FLT-2702');
  assert.equal(db.prepare('SELECT mission_id FROM fleet_ids WHERE inbox_id=?').get(2702).mission_id, mid);
  // segunda misión → siguiente de la serie, y el reparto es idempotente para el mismo encargo
  const otra = await fleetMissionId(env, encargo(2703, 'Inyecta en la sesión CLI de Smith este prompt corto y confirma en yokup'));
  assert.equal(otra, 'FLT-' + (FLEET_MISSION_SERIES_START + 1));
  assert.equal(await fleetMissionId(env, encargo(2702, 'PRUEBA coord Smith CLI · bandera ASCII (máx 8 líneas) y informe corto')), mid);
});

test('el siguiente id libre ignora el contador del bot-inbox y no baja de la serie propia', async () => {
  const {db, env} = fresh();
  db.prepare('INSERT INTO fleet_ids(inbox_id,mission_id,created_at) VALUES(?,?,?)').run(2704, 'FLT-2704', 1);
  db.prepare(`INSERT INTO tickets(id,screen,subject,source,status) VALUES('FLT-2704','SmithMacMini #2704','Alta directa','fleet','open')`).run();
  assert.equal(await nextFreeFleetId(env), 'FLT-' + FLEET_MISSION_SERIES_START);
  db.prepare(`INSERT INTO tickets(id,screen,subject,source,status) VALUES(?,?,?,?,?)`).run('FLT-' + (FLEET_MISSION_SERIES_START + 4), 'x #9', 'y', 'fleet', 'open');
  assert.equal(await nextFreeFleetId(env), 'FLT-' + (FLEET_MISSION_SERIES_START + 5));
});

test('una misión histórica FLT-<rowid> del MISMO encargo se adopta; la de OTRO encargo no se pisa', async () => {
  const {db, env} = fresh();
  db.prepare(`INSERT INTO tickets(id,screen,subject,source,status) VALUES('FLT-1406','NeoMini #1406','CMS de admira.tv: revisar la plantilla de portada','fleet','resolved')`).run();
  // mismo asunto → se adopta la histórica (sin duplicar)
  assert.equal(await fleetMissionId(env, encargo(1406, 'CMS de admira.tv: revisar la plantilla de portada')), 'FLT-1406');
  // otro encargo cuyo número coincide con una misión ajena → serie propia, la ajena intacta
  const {db: db2, env: env2} = fresh();
  db2.prepare(`INSERT INTO tickets(id,screen,subject,source,status) VALUES('FLT-1515','OraculoMini #1487','Reloj de Oráculo','fleet','open')`).run();
  const mid = await fleetMissionId(env2, encargo(1515, 'Consulta de status-web sin relación con el reloj'));
  assert.equal(mid, 'FLT-' + FLEET_MISSION_SERIES_START);
  assert.equal(db2.prepare('SELECT subject FROM tickets WHERE id=?').get('FLT-1515').subject, 'Reloj de Oráculo');
});

test('#n se resuelve por el mapa; un número de la serie propia es una misión; FLT-n ajena no se adivina', async () => {
  const {db, env} = fresh();
  db.prepare('INSERT INTO fleet_ids(inbox_id,mission_id,created_at) VALUES(?,?,?)').run(2702, 'FLT-100001', 1);
  db.prepare('INSERT INTO fleet_ids(inbox_id,mission_id,created_at) VALUES(?,?,?)').run(1487, 'FLT-1515', 1);
  assert.equal(await resolveFleetMissionReference(env, '#2702'), 'FLT-100001');
  assert.equal(await resolveFleetMissionReference(env, '100001'), 'FLT-100001');
  assert.equal(await resolveFleetMissionReference(env, 'FLT-100001'), 'FLT-100001');
  assert.equal(await resolveFleetMissionReference(env, '#1515'), '');          // FLT-1515 nació del #1487
  assert.equal(await resolveFleetMissionReference(env, '1045'), 'FLT-1045');   // histórico sin mapa: respaldo
});
