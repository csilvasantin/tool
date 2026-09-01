import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {
  PROJECT_NOVELTY_INSERT_SQL,
  PROJECT_NOVELTY_RECENT_SQL,
  PROJECT_NOVELTY_TABLE_SQL,
  projectNoveltyContract,
  projectNoveltyEventKey
} from './src/project-novelty.js';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');
const responsiblesSource = await readFile(new URL('./src/project-responsibles.js', import.meta.url), 'utf8');

function databaseWithHistoricalProject() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE projects(id TEXT PRIMARY KEY, status TEXT, created_at INTEGER, updated_at INTEGER, sort_order INTEGER)');
  db.prepare('INSERT INTO projects(id,status,created_at,updated_at) VALUES(?,?,?,?)')
    .run('historico', 'activo', 100, 100);
  db.exec(PROJECT_NOVELTY_TABLE_SQL);
  return db;
}

function createProject(db, id, createdAt, status = 'activo') {
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO projects(id,status,created_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at')
      .run(id, status, createdAt, createdAt);
    db.prepare(PROJECT_NOVELTY_INSERT_SQL).run(projectNoveltyEventKey(id), id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

test('el esquema nuevo establece baseline sin anunciar proyectos históricos', () => {
  const db = databaseWithHistoricalProject();
  assert.equal(db.prepare('SELECT COUNT(*) n FROM project_novelty_events').get().n, 0);
  db.close();
});

test('alta y retry generan un solo evento, conservan created_at y avanzan cursor', () => {
  const db = databaseWithHistoricalProject();
  createProject(db, 'nuevo-a', 1000);
  createProject(db, 'nuevo-a', 9000);
  createProject(db, 'nuevo-b', 2000);
  const rows = db.prepare(PROJECT_NOVELTY_RECENT_SQL).all();
  assert.equal(rows.length, 2);
  assert.equal(rows[1].project_id, 'nuevo-a');
  assert.equal(rows[1].created_at, 1000, 'el retry conserva la fecha del alta original');
  assert.ok(Number(rows[0].cursor) > Number(rows[1].cursor));
  db.close();
});

test('fixture local: editar, reordenar y borrar no alteran el log append-only', () => {
  const db = databaseWithHistoricalProject();
  createProject(db, 'sonda-recuperable', 1000);
  const before = db.prepare('SELECT cursor,event_key,project_id,created_at FROM project_novelty_events ORDER BY cursor').all();
  db.prepare('UPDATE projects SET updated_at=? WHERE id=?').run(2000, 'sonda-recuperable');
  db.prepare('UPDATE projects SET sort_order=? WHERE id=?').run(7, 'sonda-recuperable');
  db.prepare('DELETE FROM projects WHERE id=?').run('sonda-recuperable');
  const after = db.prepare('SELECT cursor,event_key,project_id,created_at FROM project_novelty_events ORDER BY cursor').all();
  assert.deepEqual(after, before, 'sólo el alta escribió el evento y la sonda quedó limpiada');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM projects WHERE id='sonda-recuperable'").get().n, 0);
  db.close();
});

test('el contrato mantiene total seleccionable y la forma exacta de eventos', () => {
  const contract = projectNoveltyContract([
    {cursor:7, project_id:'nuevo-b', created_at:2000},
    {cursor:3, project_id:'nuevo-a', created_at:1000}
  ], 301);
  assert.equal(contract.total, 301);
  assert.equal(contract.created_cursor, 7);
  assert.equal(contract.latest_created_at, 2000);
  assert.equal(contract.newest_id, 'nuevo-b');
  assert.deepEqual(Object.keys(contract.events[0]), ['cursor', 'project_id', 'created_at']);
});

test('GET /projects conserva projects[] y añade el contrato en raíz', () => {
  const start = source.indexOf('if (url.pathname === "/projects" && req.method === "GET")');
  const endpoint = source.slice(start, source.indexOf('if (url.pathname === "/projects" && req.method === "POST")', start));
  assert.match(endpoint, /const projects = await listProjects\(env\)/);
  assert.match(endpoint, /project\.status \|\| "activo"[\s\S]*!== "archivado"/);
  assert.match(endpoint, /PROJECT_NOVELTY_RECENT_SQL/);
  assert.match(endpoint, /return json\(\{ ok: true, day:[\s\S]*projects,[\s\S]*principal_declarations:[\s\S]*\.\.\.projectNoveltyContract\(noveltyRows, selectableTotal\)/);
});

test('toda creación web, CLI o automática converge en el único POST/upsert', () => {
  assert.equal(((source + responsiblesSource).match(/INSERT INTO projects \(id,name,blurb,web,status,color,owner,/g) || []).length, 1);
  assert.equal((source.match(/const r = await upsertProject\(env, b\)/g) || []).length, 1);
  assert.match(source, /url\.pathname === "\/projects" && req\.method === "POST"/);
  const upsert = source.slice(source.indexOf('async function upsertProject'), source.indexOf('__name(upsertProject'));
  assert.match(upsert, /if \(!prev\)[\s\S]*const initialStatements = \[[\s\S]*saveProject,[\s\S]*PROJECT_NOVELTY_INSERT_SQL[\s\S]*env\.DB\.batch\(initialStatements\)/);
  assert.match(upsert, /else \{[\s\S]*await saveProject\.run\(\)/);
});

test('editar, asignar, reordenar y borrar nunca fabrican una novedad', () => {
  const edit = source.slice(source.indexOf('async function upsertProject'), source.indexOf('__name(upsertProject'));
  assert.equal((edit.match(/PROJECT_NOVELTY_INSERT_SQL/g) || []).length, 1);
  assert.match(edit, /if \(!prev\)/);
  for (const [route, next] of [
    ['/projects/delete', '/projects/assign'],
    ['/projects/assign', '/projects/order'],
    ['/projects/order', '/projects/mission'],
    ['/projects/mission', '// CONTADORES DEL MENÚ']
  ]) {
    const block = source.slice(source.indexOf(`url.pathname === "${route}"`), source.indexOf(next, source.indexOf(`url.pathname === "${route}"`) + 1));
    assert.doesNotMatch(block, /PROJECT_NOVELTY_INSERT_SQL|project_novelty_events/, route);
  }
});
