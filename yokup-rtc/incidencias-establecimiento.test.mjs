// FLT-101292 · Proyecto = establecimiento, vista rápida de /incidencias y cierre en
// bloque. Arnés: las funciones reales del worker, extraídas de src/index.js y
// ejecutadas sobre un SQLite en memoria con el DDL de producción.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {ensureEstablishmentProject, establishmentProjectRef, establishmentSlug, isEstablishmentProject} from './src/incident-project.js';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');
const fn = (name, kind = 'async function') => {
  const start = source.indexOf(`${kind} ${name}(`);
  assert.notEqual(start, -1, `falta ${name}`);
  const end = source.indexOf(`__name(${name}, "${name}");`, start);
  assert.notEqual(end, -1, `falta cierre de ${name}`);
  return source.slice(start, end);
};
const ddl = (re) => { const m = source.match(re); assert.ok(m, 'falta DDL ' + re); return m[1]; };

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(ddl(/env\.DB\.exec\("(CREATE TABLE IF NOT EXISTS tickets \([^"]+)"\)/));
  for (const col of ['project TEXT', 'project_id TEXT', 'project_inherited INTEGER', 'project_inherited_from TEXT']) db.exec('ALTER TABLE tickets ADD COLUMN ' + col);
  db.exec(ddl(/env\.DB\.exec\("(CREATE TABLE IF NOT EXISTS projects \([^"]+)"\)/));
  db.exec("CREATE UNIQUE INDEX idx_active_screen ON tickets(screen) WHERE status NOT IN ('resolved','cancelled')");
  db.exec('CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT, ts INTEGER, kind TEXT, author TEXT, text TEXT)');
  db.exec('CREATE TABLE fleet_ids(mission_id TEXT PRIMARY KEY, inbox_id TEXT)');
  let queries = 0;
  const statement = (sql, args = []) => ({
    bind(...next) { return statement(sql, next); },
    async run() { queries++; const info = db.prepare(sql).run(...args); return {meta:{changes:info.changes}}; },
    async first() { queries++; return db.prepare(sql).get(...args) ?? null; },
    async all() { queries++; return {results:db.prepare(sql).all(...args)}; }
  });
  return {db, env:{DB:{prepare:(sql) => statement(sql)}}, queries:() => queries};
}

function worker(env, extra = {}) {
  const context = vm.createContext({
    Date, Number, String, Math, JSON, Array, Set, Map, Error, Promise,
    ensureEstablishmentProject, __name: () => {},
    ensureSchema: async () => {},
    carbonRoster: async () => [{name:'Laura R.', zone:'Barcelona', skills:'players'}],
    hash: () => 0, aiRun: async () => '',
    backfillTodayDisplayRefs: async () => {}, ensureEntityDisplayRef: async () => {}, notifySubs: async () => {},
    resolveCreationProject: async (_env, ctx) => ({ok:true, project_id:ctx.project_id || 'galaxia-admira', project:'x', defaulted:!ctx.project_id}),
    ...extra
  });
  vm.runInContext([
    fn('addEvent'), fn('createTicket'), fn('createIncident'),
    'globalThis.api = {createTicket, createIncident};'
  ].join('\n'), context);
  return context.api;
}

test('el slug del establecimiento es exactamente projectSlug() del worker', () => {
  const context = vm.createContext({String, __name: () => {}});
  vm.runInContext(fn('projectSlug', 'function') + '\nglobalThis.projectSlug = projectSlug;', context);
  for (const v of ['alsea-sbux-021', 'Starbucks Paseo de Gracia', 'Café Ñandú · Gràcia', '  x  ', '']) {
    assert.equal(establishmentSlug(v), context.projectSlug(v), v);
  }
  assert.deepEqual(establishmentProjectRef('alsea-sbux-021', 'Starbucks Paseo de Gracia'),
    {id:'alsea-sbux-021', name:'Starbucks Paseo de Gracia', blurb:'Establecimiento · alsea-sbux-021'});
  assert.equal(establishmentProjectRef('', 'Starbucks Paseo de Gracia').id, 'starbucks-paseo-de-gracia');
  assert.equal(establishmentProjectRef('', ''), null);
});

test('alta idempotente del proyecto de establecimiento; nunca renombra un proyecto normal', async () => {
  const t = database();
  const a = await ensureEstablishmentProject(t.env, 'alsea-sbux-021', 'Starbucks Paseo de Gracia', 1000);
  const b = await ensureEstablishmentProject(t.env, 'alsea-sbux-021', 'Starbucks Paseo de Gracia', 2000);
  assert.deepEqual(a, {id:'alsea-sbux-021', name:'Starbucks Paseo de Gracia'});
  assert.deepEqual(b, a);
  const row = t.db.prepare('SELECT * FROM projects').get();
  assert.equal(row.status, 'activo');
  assert.equal(row.updated_by, 'yokup·establecimientos');
  assert.ok(isEstablishmentProject(row));
  assert.equal(t.db.prepare('SELECT COUNT(*) n FROM projects').get().n, 1);
  // El censo renombra la tienda: el proyecto de establecimiento lo sigue.
  await ensureEstablishmentProject(t.env, 'alsea-sbux-021', 'Starbucks Pg. de Gràcia', 3000);
  assert.equal(t.db.prepare('SELECT name FROM projects WHERE id=?').get('alsea-sbux-021').name, 'Starbucks Pg. de Gràcia');
  // Un proyecto dado de alta a mano con el mismo id se reutiliza, pero no se toca.
  t.db.prepare("INSERT INTO projects(id,name,blurb,status) VALUES('yokup','Yokup','Helpdesk','activo')").run();
  assert.deepEqual(await ensureEstablishmentProject(t.env, 'yokup', 'Otra cosa'), {id:'yokup', name:'Yokup'});
  assert.equal(t.db.prepare("SELECT blurb FROM projects WHERE id='yokup'").get().blurb, 'Helpdesk');
});

test('la incidencia de una pantalla nace con project_id del establecimiento', async () => {
  const t = database();
  const api = worker(t.env);
  const id = await api.createTicket(t.env, {screen:'sbux-021-menu', loc:'Starbucks Paseo de Gracia', loc_id:'alsea-sbux-021', loc_name:'Starbucks Paseo de Gracia', role:'menu', age:400});
  const row = t.db.prepare('SELECT * FROM tickets WHERE id=?').get(id);
  assert.equal(row.project_id, 'alsea-sbux-021');
  assert.equal(row.project, 'alsea-sbux-021');
  assert.equal(row.loc, 'Starbucks Paseo de Gracia');
  assert.equal(t.db.prepare('SELECT name FROM projects WHERE id=?').get('alsea-sbux-021').name, 'Starbucks Paseo de Gracia');
  // Segunda pantalla del mismo establecimiento: mismo proyecto, sin duplicarlo.
  const id2 = await api.createTicket(t.env, {screen:'sbux-021-caja', loc:'Starbucks Paseo de Gracia', loc_id:'alsea-sbux-021', loc_name:'Starbucks Paseo de Gracia'});
  assert.equal(t.db.prepare('SELECT project_id FROM tickets WHERE id=?').get(id2).project_id, 'alsea-sbux-021');
  assert.equal(t.db.prepare('SELECT COUNT(*) n FROM projects').get().n, 1);
});

test('sin loc usa el nombre; sin nada (o demo) conserva el comportamiento previo, sin proyecto', async () => {
  const t = database();
  const api = worker(t.env);
  const byName = await api.createTicket(t.env, {screen:'p-sin-id', loc:'Tienda Gràcia'});
  assert.equal(t.db.prepare('SELECT project_id FROM tickets WHERE id=?').get(byName).project_id, 'tienda-gracia');
  const bare = await api.createTicket(t.env, {screen:'p-sin-nada'});
  assert.equal(t.db.prepare('SELECT project_id FROM tickets WHERE id=?').get(bare).project_id, null);
  const demo = await api.createTicket(t.env, {screen:'demo-abc12', loc:'Madrid Centro', establishment:false});
  assert.equal(t.db.prepare('SELECT project_id FROM tickets WHERE id=?').get(demo).project_id, null);
});

test('POST /incident con loc y sin project_id cuelga del establecimiento; el explícito manda', async () => {
  const t = database();
  const api = worker(t.env);
  const a = await api.createIncident(t.env, {resource:'demo:alsea-sbux-021:pantalla-1', subject:'Pantalla negra', kind:'screen', loc:'alsea-sbux-021', loc_name:'Starbucks Paseo de Gracia'});
  assert.equal(t.db.prepare('SELECT project_id FROM tickets WHERE id=?').get(a).project_id, 'alsea-sbux-021');
  const b = await api.createIncident(t.env, {resource:'supervisor:admira-tv:x', subject:'Visión', kind:'screen', loc:'Sala 1', project_id:'admira-tv'});
  assert.equal(t.db.prepare('SELECT project_id FROM tickets WHERE id=?').get(b).project_id, 'admira-tv');
  const c = await api.createIncident(t.env, {resource:'svc:https://x', subject:'Web caída', kind:'service'});
  assert.equal(t.db.prepare('SELECT project_id FROM tickets WHERE id=?').get(c).project_id, 'galaxia-admira');
});

test('reconcile, sensor y simulador pasan el loc crudo y el locName a createTicket', () => {
  assert.match(fn('reconcile'), /createTicket\(env, \{ screen: s\.screen, loc: s\.locName \|\| s\.loc \|\| "", loc_id: s\.loc \|\| "", loc_name: s\.locName \|\| ""/);
  assert.match(source, /createPlayer: s => createTicket\(env, s\)/);
  assert.match(source, /find\(\(x\) => x\.online && isMonitoredScreen\(x\)\)/);
  assert.match(source, /createTicket\(env, \{ screen, loc, loc_id: locId, loc_name: locName, role, age, source: "agent-iot",\s*establishment: !screen\.startsWith\("demo-"\) \}\)/);
});

test('GET /tickets?scope=campo lanza el reconcile en 2º plano con ctx.waitUntil', () => {
  const route = source.slice(source.indexOf('if (url.pathname === "/tickets") {'), source.indexOf('if (url.pathname === "/tasks/all") {'));
  assert.match(route, /if \(ctx && typeof ctx\.waitUntil === "function"\) ctx\.waitUntil\(reconcile\(env\)\.catch\(\(\) => \{\}\)\);\s*else await reconcile\(env\);/);
  assert.match(route, /status:url\.searchParams\.get\("status"\) \|\| ""/);
});

test('ticketUniverseWhere acepta status explícito y rechaza estados desconocidos', () => {
  const context = vm.createContext({String, Date, __name: () => {}, MISSION_SCOPE_SQL_T:'(M)', FIELD_MISSION_SCOPE_SQL_T:'(F)', missionDayRange: () => null});
  vm.runInContext(source.match(/var TICKET_STATUSES = [^\n]+\n/)[0] +
    source.slice(source.indexOf('function ticketUniverseWhere('), source.indexOf('async function listTickets(')) +
    '\nglobalThis.where = ticketUniverseWhere;', context);
  const u = context.where('campo', {status:'resolved,cancelled'});
  assert.equal(u.ok, true);
  assert.match(u.sql, /t\.status IN \(\?,\?\)/);
  assert.deepEqual([...u.binds], ['resolved', 'cancelled']);
  assert.equal(u.status, 'resolved,cancelled');
  assert.equal(context.where('campo', {status:'open,in_progress'}).binds.length, 2);
  assert.equal(context.where('campo', {status:'borrada'}).ok, false);
  assert.equal(context.where('campo', {}).status, null);
});

test('POST /tickets/status con 250 ids: todas canceladas, nota en cada ficha y ~3 consultas por id', async () => {
  const t = database();
  const ids = Array.from({length:250}, (_, i) => 'INC-' + String(i).padStart(5, '0'));
  for (const id of ids) t.db.prepare("INSERT INTO tickets(id,screen,status,source,created_at,updated_at) VALUES(?,?,?,?,1,1)").run(id, 'scr-' + id, 'open', 'agent-iot');
  const start = source.indexOf('if (url.pathname === "/tickets/status" && req.method === "POST") {');
  const end = source.indexOf('// PERSONALIZACIÓN del perímetro', start);
  const context = vm.createContext({
    Date, Number, String, Math, JSON, Array, Set, Map, Request, __name: () => {},
    json: (o, s = 200) => ({status:s, body:o}), ensureSchema: async () => {},
    hasMissionProof: async () => true, ascendMissionProof: async () => {}, reconcileBatchTargetMission: async () => ({ok:true}),
    ctx: null, pushPortalChanges: async () => ({}), portalDeps: () => ({})
  });
  vm.runInContext([
    fn('addEvent'),
    fn('fleetInboxId', 'function'), fn('inboxIdFromScreen', 'function'), fn('fleetEncargoId'),
    'globalThis.route = async (url, req, env) => {' + source.slice(start, end) + ' return null; };'
  ].join('\n'), context);
  const note = 'Cierre en bloque para probar de cero (Carlos, 30-sep-2026)';
  const before = t.queries();
  const out = await context.route(new URL('https://api.yokup.com/tickets/status'),
    {method:'POST', json: async () => ({ids, status:'cancelled', author:'Carlos · Incidencias', note})}, t.env);
  assert.equal(out.status, 200);
  assert.equal(out.body.ok, true);
  assert.equal(out.body.updated, 250);
  assert.equal(t.db.prepare("SELECT COUNT(*) n FROM tickets WHERE status='cancelled'").get().n, 250);
  const events = t.db.prepare("SELECT ticket_id,author,text FROM events WHERE kind='status'").all();
  assert.equal(events.length, 250);
  assert.ok(events.every((e) => e.author === 'Carlos · Incidencias' && e.text === 'Estado → cancelled (cambio en bloque) · ' + note));
  // Límite práctico: D1 admite ~1000 consultas por invocación; el cliente manda lotes de 100.
  const perId = (t.queries() - before) / ids.length;
  assert.ok(perId <= 3, 'consultas por id: ' + perId);
  // Sin nota, el texto de siempre.
  const plain = await context.route(new URL('https://api.yokup.com/tickets/status'),
    {method:'POST', json: async () => ({ids:[ids[0]], status:'open'})}, t.env);
  assert.equal(plain.body.updated, 1);
  assert.equal(t.db.prepare("SELECT text FROM events WHERE ticket_id=? ORDER BY id DESC LIMIT 1").get(ids[0]).text, 'Estado → open (cambio en bloque)');
});
