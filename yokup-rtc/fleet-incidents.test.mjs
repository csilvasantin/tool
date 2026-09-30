// FLT-101298 · Incidencias para el MCP de flota. Rutas internas /internal/mcp/incidents/*
// que solo acepta el binding del gate (token de ejecutor + sin CF-Connecting-IP ni
// Origin). Arnés: createIncident/addEvent REALES extraídos de src/index.js sobre un
// SQLite en memoria con el DDL de producción, y el worker completo para el rechazo público.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import worker from './src/index.js';
import {FLEET_INCIDENTS_PREFIX, handleFleetIncidents, incidentListQuery, INCIDENT_LIST_MAX} from './src/fleet-incidents.js';
import {ensureEstablishmentProject} from './src/incident-project.js';

const TOKEN = 'executor-test-token';
const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');
const fn = (name) => {
  const start = source.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `falta ${name}`);
  const end = source.indexOf(`__name(${name}, "${name}");`, start);
  return source.slice(start, end);
};
const ddl = (re) => { const m = source.match(re); assert.ok(m, 'falta DDL ' + re); return m[1]; };

function harness() {
  const db = new DatabaseSync(':memory:');
  db.exec(ddl(/env\.DB\.exec\("(CREATE TABLE IF NOT EXISTS tickets \([^"]+)"\)/));
  for (const col of ['project TEXT', 'project_id TEXT', 'project_inherited INTEGER', 'project_inherited_from TEXT', 'proof_image TEXT']) db.exec('ALTER TABLE tickets ADD COLUMN ' + col);
  db.exec(ddl(/env\.DB\.exec\("(CREATE TABLE IF NOT EXISTS projects \([^"]+)"\)/));
  db.exec("CREATE UNIQUE INDEX idx_active_screen ON tickets(screen) WHERE status NOT IN ('resolved','cancelled')");
  db.exec('CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT, ts INTEGER, kind TEXT, author TEXT, text TEXT)');
  const stmt = (sql, args = []) => ({
    bind: (...next) => stmt(sql, next),
    run: async () => ({meta:{changes:Number(db.prepare(sql).run(...args).changes)}}),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({results:db.prepare(sql).all(...args)})
  });
  const env = {DB:{prepare:stmt}, YOKUP_CLI_EXECUTOR_TOKEN:TOKEN};
  const context = vm.createContext({
    Date, Number, String, Math, JSON, Array, Set, Map, Error, Promise, ensureEstablishmentProject, __name: () => {},
    ensureSchema: async () => {}, carbonRoster: async () => [{name:'Laura R.', zone:'Barcelona', skills:'players'}],
    hash: () => 0, backfillTodayDisplayRefs: async () => {}, ensureEntityDisplayRef: async () => {}, notifySubs: async () => {},
    resolveCreationProject: async (_env, ctx) => ctx.project_id === 'inexistente'
      ? {ok:false, status:400, code:'invalid_project_id', error:'project_id activo y exacto requerido'}
      : {ok:true, project_id:ctx.project_id || 'galaxia-admira', project:'x'}
  });
  vm.runInContext([fn('addEvent'), fn('createIncident'), 'globalThis.api = {addEvent, createIncident};'].join('\n'), context);
  const json = (o, s = 200) => new Response(JSON.stringify(o), {status:s, headers:{'content-type':'application/json'}});
  const deps = {json, ensureSchema: async () => {}, createIncident:context.api.createIncident, addEvent:context.api.addEvent};
  // Petición tal y como la construye el gate: fresca, sin CF-Connecting-IP, con el token.
  const call = async (path, body, headers = {}) => {
    const url = new URL('https://api.yokup.com' + FLEET_INCIDENTS_PREFIX + path);
    const req = new Request(url, {method:body ? 'POST' : 'GET', headers:{authorization:'Bearer ' + TOKEN, 'content-type':'application/json', ...headers}, body:body ? JSON.stringify(body) : undefined});
    const res = await handleFleetIncidents(req, env, url, deps);
    return {status:res.status, body:await res.json()};
  };
  const seed = (id, over = {}) => db.prepare('INSERT INTO tickets(id,screen,subject,loc,role,status,priority,assignee,source,ai_triage,created_at,updated_at,project,project_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, over.screen ?? id.toLowerCase(), over.subject ?? 'Asunto ' + id, over.loc ?? '', over.role ?? 'service', over.status ?? 'open', 'alta', 'Laura R.', over.source ?? 'monitor', '', over.created_at ?? 1000, 1000, over.project ?? 'yokup', over.project ?? 'yokup');
  return {db, env, call, seed};
}
const who = {actor:'MorfeoMacMini', machine:'MacMini'};
const AUTHOR = 'MorfeoMacMini · MacMini';

test('solo el binding: sin token 401, con CF-Connecting-IP u Origin 403 aunque lleve el token', async () => {
  const h = harness();
  assert.equal((await h.call('', null, {authorization:''})).status, 401);
  assert.equal((await h.call('', null, {authorization:'Bearer otro'})).status, 401);
  const edge = await h.call('', null, {'cf-connecting-ip':'203.0.113.9'});
  assert.equal(edge.status, 403); assert.equal(edge.body.code, 'internal_only');
  assert.equal((await h.call('/open', {...who, subject:'x', kind:'service', severity:'alta'}, {origin:'https://evil.test'})).status, 403);
  delete h.env.YOKUP_CLI_EXECUTOR_TOKEN;
  assert.equal((await h.call('')).status, 503);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM tickets').get().n, 0);
});

test('worker real: una petición pública directa a api.yokup.com/internal/... se rechaza sin tocar D1', async () => {
  let touched = 0;
  const DB = {prepare:() => { touched++; throw new Error('no debe consultar D1'); }, exec:async () => { touched++; }, batch:async () => { touched++; }};
  const env = {DB, YOKUP_CLI_EXECUTOR_TOKEN:TOKEN};
  const pub = (path, init = {}) => worker.fetch(new Request('https://api.yokup.com' + path, init), env, {});
  // Desde Internet el borde añade CF-Connecting-IP: ni con el token de ejecutor entra.
  for (const [path, init] of [
    [FLEET_INCIDENTS_PREFIX, {headers:{'cf-connecting-ip':'198.51.100.7'}}],
    [FLEET_INCIDENTS_PREFIX + '/get?id=INC-1', {headers:{'cf-connecting-ip':'198.51.100.7', authorization:'Bearer ' + TOKEN}}],
    [FLEET_INCIDENTS_PREFIX + '/bulk-status', {method:'POST', headers:{'cf-connecting-ip':'198.51.100.7', authorization:'Bearer ' + TOKEN, 'content-type':'application/json'}, body:JSON.stringify({...who, ids:['INC-1'], status:'resolved', note:'x'})}]
  ]) {
    const r = await pub(path, init);
    assert.equal(r.status, 403, path); assert.equal((await r.json()).code, 'internal_only');
  }
  const noToken = await pub(FLEET_INCIDENTS_PREFIX + '/list');
  assert.equal(noToken.status, 401);
  assert.equal(touched, 0);
});

test('open crea con autor persona·máquina, source mcp y dedup por recurso; loc → proyecto del establecimiento', async () => {
  const h = harness();
  const r = await h.call('/open', {...who, subject:'Player caído en caja 2', detail:'Pantalla negra', kind:'screen', severity:'urgente', loc:'alsea-sbux-021'});
  assert.equal(r.status, 200); assert.match(r.body.id, /^INC-/);
  assert.equal(r.body.url, 'https://www.yokup.com/ticket?id=' + r.body.id);
  assert.equal(r.body.deduplicated, false); assert.equal(r.body.author, AUTHOR); assert.equal(r.body.audited, true);
  const t = h.db.prepare('SELECT * FROM tickets WHERE id=?').get(r.body.id);
  assert.equal(t.source, 'mcp'); assert.equal(t.priority, 'urgente'); assert.equal(t.role, 'screen');
  assert.equal(t.project_id, 'alsea-sbux-021', 'el establecimiento cuelga su proyecto');
  assert.equal(t.screen, 'mcp:screen:player-caido-en-caja-2');
  const ev = h.db.prepare('SELECT kind,author,text FROM events WHERE ticket_id=?').all(r.body.id);
  assert.deepEqual(ev.map((e) => [e.kind, e.author, e.text]), [['log', AUTHOR, 'Pantalla negra']]);
  const again = await h.call('/open', {...who, subject:'Player caído en caja 2', kind:'screen', severity:'alta'});
  assert.equal(again.body.id, r.body.id); assert.equal(again.body.deduplicated, true);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM tickets').get().n, 1);
  const bad = await h.call('/open', {...who, subject:'x', kind:'service', severity:'alta', project_id:'inexistente'});
  assert.equal(bad.status, 400); assert.equal(bad.body.code, 'invalid_project_id');
  for (const body of [{...who, kind:'service', severity:'alta'}, {...who, subject:'x', kind:'otro', severity:'alta'}, {...who, subject:'x', kind:'service', severity:'high'}, {subject:'x', kind:'service', severity:'alta'}]) {
    assert.equal((await h.call('/open', body)).status, 400, JSON.stringify(body));
  }
  const audit = h.db.prepare('SELECT actor,machine,action,ticket_ids FROM mcp_incident_audit ORDER BY id').all();
  assert.deepEqual(audit.map((a) => a.action), ['open', 'open_duplicate']);
  assert.equal(audit[0].actor, 'MorfeoMacMini'); assert.equal(audit[0].machine, 'MacMini');
});

test('open no reutiliza un recurso que es una misión activa', async () => {
  const h = harness(); h.seed('FLT-1', {source:'fleet', role:'mission', screen:'svc:web'});
  const r = await h.call('/open', {...who, subject:'Web caída', kind:'service', severity:'alta', resource:'svc:web'});
  assert.equal(r.status, 409); assert.equal(r.body.code, 'resource_is_mission');
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM events').get().n, 0);
});

test('list filtra estado, proyecto, origen, tipo y texto; nunca devuelve misiones', async () => {
  const h = harness();
  h.seed('SVC-A', {created_at:3000}); h.seed('SVC-B', {status:'in_progress', project:'otro', created_at:2000});
  h.seed('INC-C', {status:'resolved', role:'mupi', source:'agent-iot', subject:'Pantalla sin señal'});
  h.seed('INC-D', {status:'cancelled', source:'mcp'});
  h.seed('FLT-9', {source:'fleet', role:'mission'}); h.seed('DCL-8', {source:'cli-declare'});
  const ids = async (qs) => (await h.call('?' + qs)).body.incidents.map((i) => i.id);
  assert.deepEqual(await ids(''), ['SVC-A', 'SVC-B']);
  assert.deepEqual(await ids('state=todas'), ['SVC-A', 'SVC-B', 'INC-C', 'INC-D']);
  assert.deepEqual(await ids('state=resolved'), ['INC-C']);
  assert.deepEqual(await ids('state=todas&project_id=otro'), ['SVC-B']);
  assert.deepEqual(await ids('state=todas&source=mcp'), ['INC-D']);
  assert.deepEqual(await ids('state=todas&kind=screen'), ['INC-C']);
  assert.deepEqual(await ids('state=todas&q=se%C3%B1al'), ['INC-C']);
  assert.deepEqual(await ids('state=todas&q=%25'), [], 'el comodín se escapa');
  const page = (await h.call('?state=todas&limit=1')).body;
  assert.equal(page.returned, 1); assert.equal(page.total, 4);
  const one = page.incidents[0];
  for (const k of ['id', 'subject', 'status', 'priority', 'kind', 'source', 'project_id', 'project', 'loc', 'resource', 'assignee', 'created_at', 'updated_at', 'url']) assert.ok(k in one, k);
  assert.equal((await h.call('?limit=' + (INCIDENT_LIST_MAX + 1))).status, 400);
  assert.equal((await h.call('?state=abiertas')).status, 400);
  assert.throws(() => incidentListQuery({state:'todas', limit:'0'}));
});

test('get devuelve la ficha con su historial y rechaza misiones e inexistentes', async () => {
  const h = harness(); h.seed('SVC-A'); h.seed('FLT-9', {source:'fleet', role:'mission'});
  h.db.prepare('INSERT INTO events(ticket_id,ts,kind,author,text) VALUES(?,?,?,?,?)').run('SVC-A', 5, 'log', 'Monitor', 'Caída');
  const r = await h.call('/get?id=SVC-A');
  assert.equal(r.body.incident.id, 'SVC-A'); assert.deepEqual(r.body.events.map((e) => e.text), ['Caída']);
  const mission = await h.call('/get?id=FLT-9');
  assert.equal(mission.status, 409); assert.equal(mission.body.code, 'not_an_incident');
  assert.equal((await h.call('/get?id=NOPE')).status, 404);
});

test('note anota con autor y pone en curso; update exige nota para cerrar y deja el evento', async () => {
  const h = harness(); h.seed('SVC-A');
  const n = await h.call('/note', {...who, id:'SVC-A', text:'Reinicio remoto lanzado'});
  assert.equal(n.status, 200); assert.equal(n.body.status, 'in_progress');
  assert.equal(h.db.prepare('SELECT status FROM tickets WHERE id=?').get('SVC-A').status, 'in_progress');
  const noNote = await h.call('/status', {...who, id:'SVC-A', status:'resolved'});
  assert.equal(noNote.status, 400); assert.equal(noNote.body.code, 'note_required');
  assert.equal((await h.call('/status', {...who, id:'SVC-A', status:'cancelled', note:''})).status, 400);
  const done = await h.call('/status', {...who, id:'SVC-A', status:'resolved', note:'Player responde de nuevo'});
  assert.equal(done.status, 200); assert.equal(done.body.previous, 'in_progress');
  const t = h.db.prepare('SELECT status,resolved_at FROM tickets WHERE id=?').get('SVC-A');
  assert.equal(t.status, 'resolved'); assert.ok(t.resolved_at > 0);
  const reopen = await h.call('/status', {...who, id:'SVC-A', status:'open'});
  assert.equal(reopen.status, 200);
  assert.equal(h.db.prepare('SELECT resolved_at FROM tickets WHERE id=?').get('SVC-A').resolved_at, null);
  const ev = h.db.prepare("SELECT kind,author,text FROM events WHERE ticket_id='SVC-A' ORDER BY id").all();
  assert.deepEqual(ev.map((e) => [e.kind, e.author, e.text]), [
    ['note', AUTHOR, 'Reinicio remoto lanzado'],
    ['status', AUTHOR, 'Estado → resolved: Player responde de nuevo'],
    ['status', AUTHOR, 'Estado → open']
  ]);
  assert.equal((await h.call('/status', {...who, id:'SVC-A', status:'blocked', note:'x'})).status, 400);
  assert.deepEqual(h.db.prepare('SELECT action FROM mcp_incident_audit ORDER BY id').all().map((a) => a.action), ['note', 'status', 'status']);
});

test('note y update no tocan misiones de flota', async () => {
  const h = harness(); h.seed('FLT-9', {source:'fleet', role:'mission', status:'in_progress'});
  assert.equal((await h.call('/note', {...who, id:'FLT-9', text:'x'})).body.code, 'not_an_incident');
  assert.equal((await h.call('/status', {...who, id:'FLT-9', status:'resolved', note:'x'})).body.code, 'not_an_incident');
  assert.equal(h.db.prepare("SELECT status FROM tickets WHERE id='FLT-9'").get().status, 'in_progress');
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM events').get().n, 0);
});

test('cierre en bloque: todo o nada, nota obligatoria, ≤100, evento por ficha y una fila de auditoría', async () => {
  const h = harness(); h.seed('SVC-A'); h.seed('SVC-B', {status:'in_progress'}); h.seed('FLT-9', {source:'fleet', role:'mission'});
  const mixed = await h.call('/bulk-status', {...who, ids:['SVC-A', 'FLT-9', 'NOPE'], status:'resolved', note:'Limpieza'});
  assert.equal(mixed.status, 409); assert.deepEqual(mixed.body.not_incidents, ['FLT-9']); assert.deepEqual(mixed.body.not_found, ['NOPE']);
  assert.equal(h.db.prepare("SELECT COUNT(*) n FROM tickets WHERE status='resolved'").get().n, 0, 'no se tocó ninguna');
  assert.equal((await h.call('/bulk-status', {...who, ids:['SVC-A'], status:'resolved'})).status, 400);
  assert.equal((await h.call('/bulk-status', {...who, ids:['SVC-A'], status:'in_progress', note:'x'})).status, 400);
  assert.equal((await h.call('/bulk-status', {...who, ids:Array.from({length:101}, (_, i) => 'X-' + i), status:'cancelled', note:'x'})).body.code, 'too_many_ids');
  const ok = await h.call('/bulk-status', {...who, ids:['SVC-A', 'SVC-B', 'SVC-A'], status:'cancelled', note:'Duplicadas del monitor'});
  assert.equal(ok.status, 200); assert.equal(ok.body.updated, 2);
  assert.deepEqual(h.db.prepare("SELECT id,status FROM tickets WHERE id LIKE 'SVC-%' ORDER BY id").all().map((r) => r.status), ['cancelled', 'cancelled']);
  const ev = h.db.prepare("SELECT ticket_id,author,text FROM events ORDER BY id").all();
  assert.deepEqual(ev.map((e) => e.ticket_id), ['SVC-A', 'SVC-B']);
  assert.ok(ev.every((e) => e.author === AUTHOR && e.text === 'Estado → cancelled (cambio en bloque · MCP) · Duplicadas del monitor'));
  const audit = h.db.prepare('SELECT action,ticket_ids,status,detail FROM mcp_incident_audit').all().map((r) => ({...r}));
  assert.deepEqual(audit, [{action:'bulk_status', ticket_ids:'["SVC-A","SVC-B"]', status:'cancelled', detail:'Duplicadas del monitor'}]);
});

test('index.js solo añade el import y una línea de enrutado antes del perímetro', () => {
  const lines = source.split('\n').filter((l) => l.includes('handleFleetIncidents'));
  assert.equal(lines.length, 2);
  const route = source.indexOf('return handleFleetIncidents(');
  assert.ok(route > 0 && route < source.indexOf('if (PROTECTED.has(url.pathname)'), 'el enrutado va antes de la guarda de sesión');
});
