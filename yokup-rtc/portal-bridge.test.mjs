// FLT-101298 · Incidencias unificadas, lado bandeja Yokup. Arnés: createIncident/addEvent reales,
// extraídos de src/index.js y ejecutados sobre SQLite en memoria con el DDL de producción. El binding
// INCIDENT_DESK (yokup-api) se simula con un fetch inyectado. Al final, prueba de extremo a extremo con
// el lado real del portal (../api) conectado por los dos bindings simulados.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {ensureEstablishmentProject} from './src/incident-project.js';
import {PORTAL_LINKS_SQL, PORTAL_STATUS_URL, applyPortalSync, pushPortalChanges, portalAssigned, portalLinksFor, handlePortalInternal} from './src/portal-bridge.js';
import {queueSignal, ensureSensorSchema, flushSensorOutbox} from './src/incident-sensors.js';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');
const fn = (name, kind = 'async function') => {
  const start = source.indexOf(`${kind} ${name}(`);
  const end = source.indexOf(`__name(${name}, "${name}");`, start);
  assert.ok(start >= 0 && end > start, 'falta ' + name);
  return source.slice(start, end);
};
const ddl = (re) => source.match(re)[1];

function database({links = true} = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(ddl(/env\.DB\.exec\("(CREATE TABLE IF NOT EXISTS tickets \([^"]+)"\)/));
  for (const col of ['project TEXT', 'project_id TEXT', 'project_inherited INTEGER', 'project_inherited_from TEXT']) db.exec('ALTER TABLE tickets ADD COLUMN ' + col);
  db.exec(ddl(/env\.DB\.exec\("(CREATE TABLE IF NOT EXISTS projects \([^"]+)"\)/));
  db.exec("CREATE UNIQUE INDEX idx_active_screen ON tickets(screen) WHERE status NOT IN ('resolved','cancelled')");
  db.exec('CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT, ts INTEGER, kind TEXT, author TEXT, text TEXT)');
  if (links) db.exec(PORTAL_LINKS_SQL);
  const statement = (sql, args = []) => ({
    bind(...next) { return statement(sql, next); },
    async run() { const info = db.prepare(sql).run(...args); return {meta:{changes:info.changes}}; },
    async first() { return db.prepare(sql).get(...args) ?? null; },
    async all() { return {results:db.prepare(sql).all(...args)}; }
  });
  const env = {DB:{prepare:(sql) => statement(sql)}};
  const context = vm.createContext({
    Date, Number, String, Math, JSON, Array, Set, Map, Error, Promise, ensureEstablishmentProject, __name: () => {},
    ensureSchema: async () => {}, carbonRoster: async () => [{name:'Laura R.', zone:'Barcelona', skills:'players'}], hash: () => 0, aiRun: async () => '',
    backfillTodayDisplayRefs: async () => {}, ensureEntityDisplayRef: async () => {}, notifySubs: async () => {},
    resolveCreationProject: async (_env, ctx) => ({ok:true, project_id:ctx.project_id || 'galaxia-admira', project:'x'})
  });
  vm.runInContext([fn('addEvent'), fn('createIncident'), 'globalThis.api = {addEvent, createIncident};'].join('\n'), context);
  const deps = {createIncident:context.api.createIncident, addEvent:context.api.addEvent, ensureEstablishmentProject};
  const events = (id) => db.prepare('SELECT kind,author,text FROM events WHERE ticket_id=? ORDER BY id').all(id);
  const ticket = (id) => db.prepare('SELECT * FROM tickets WHERE id=?').get(id);
  const link = (pid) => db.prepare('SELECT * FROM portal_links WHERE portal_incident_id=?').get(pid);
  return {db, env, deps, events, ticket, link};
}
const portal = (extra = {}) => ({portal_incident_id:'retail-1', origin:'portal', rtc_ticket_id:null, state:'open', title:'No suena el hilo musical',
  description:'El equipo dejó de reproducir música.', priority:'urgent', channel:'campo', device:{name:'Hilo musical', skill:'audio'},
  site:{name:'Estanco local', establishment:'yokup-site-1'}, technician_name:null, resolution:null, evidence_url:null, rating:null, followup_id:null,
  parent_portal_incident_id:null, portal_url:'https://www.yokup.com/retailer/incidencia?id=retail-1', ...extra});
const binding = (body, {host = 'yokup-rtc.internal', headers = {}} = {}) => new Request('https://' + host + '/internal/portal/sync', {method:'POST', headers:{'content-type':'application/json', ...headers}, body:JSON.stringify(body)});

test('una incidencia del portal nace como ticket espejo del establecimiento, una sola vez', async () => {
  const t = database();
  const r = await applyPortalSync(t.env, portal(), t.deps, 1000);
  assert.equal(r.ok, true); assert.equal(r.created, true); assert.equal(r.status, 'open');
  const row = t.ticket(r.ticket_id);
  assert.deepEqual({screen:row.screen, source:row.source, role:row.role, priority:row.priority, project_id:row.project_id, loc:row.loc, assignee:row.assignee},
    {screen:'portal:retail-1', source:'portal-comercio', role:'screen', priority:'urgente', project_id:'yokup-site-1', loc:'Estanco local', assignee:'Yokup Desk'});
  assert.equal(t.db.prepare('SELECT name FROM projects WHERE id=?').get('yokup-site-1').name, 'Estanco local');
  assert.match(t.events(r.ticket_id).at(-1).text, /^Enlazada con la incidencia retail-1 del portal · Estanco local\.$/);
  assert.deepEqual({o:t.link('retail-1').origin, s:t.link('retail-1').portal_state, u:t.link('retail-1').portal_url}, {o:'portal', s:'open', u:'https://www.yokup.com/retailer/incidencia?id=retail-1'});
  // Idempotente: repetir no crea ni anota nada.
  const n = t.events(r.ticket_id).length;
  assert.deepEqual(await applyPortalSync(t.env, portal(), t.deps, 2000), {ok:true, ticket_id:r.ticket_id, status:'open', created:false});
  assert.equal(t.events(r.ticket_id).length, n);
  assert.equal(t.db.prepare('SELECT COUNT(*) n FROM tickets').get().n, 1);
});

test('el ciclo de campo del portal manda: técnico → en curso, resuelta, valoración; «open» nunca baja un estado', async () => {
  const t = database();
  const {ticket_id:id} = await applyPortalSync(t.env, portal(), t.deps);
  t.db.prepare("UPDATE tickets SET status='in_progress' WHERE id=?").run(id);
  assert.equal((await applyPortalSync(t.env, portal(), t.deps)).status, 'in_progress', 'una nota en Yokup no se deshace');
  await applyPortalSync(t.env, portal({state:'assigned', technician_name:'Test Installer'}), t.deps);
  assert.equal(t.ticket(id).status, 'in_progress'); assert.equal(t.events(id).at(-1).text, 'Técnico asignado en el portal: Test Installer.');
  await applyPortalSync(t.env, portal({state:'resolved', technician_name:'Test Installer', resolution:'Cable sustituido y audio comprobado.', evidence_url:'https://evidencia.test/c.jpg'}), t.deps);
  assert.equal(t.ticket(id).status, 'resolved'); assert.ok(t.ticket(id).resolved_at > 0);
  assert.equal(t.events(id).at(-1).text, 'Resuelta en el portal por Test Installer: Cable sustituido y audio comprobado. Evidencia: https://evidencia.test/c.jpg');
  await applyPortalSync(t.env, portal({state:'rated', rating:{stars:2, satisfied:false}, followup_id:'review-abc'}), t.deps);
  assert.deepEqual({...t.events(id).at(-1)}, {kind:'rating', author:'Portal del comercio', text:'Valoración del comercio: 2★ · sigue fallando, revisión review-abc abierta.'});
  // La revisión es un ticket nuevo enlazado al padre, que sigue resuelto.
  const child = await applyPortalSync(t.env, portal({portal_incident_id:'review-abc', parent_portal_incident_id:'retail-1', title:'Revisión: No suena el hilo musical'}), t.deps);
  assert.equal(child.created, true); assert.notEqual(child.ticket_id, id); assert.equal(t.ticket(id).status, 'resolved');
  assert.equal(t.events(child.ticket_id).at(-1).text, `Revisión de ${id}: el comercio indicó que sigue fallando.`);
  assert.equal(t.events(id).at(-1).text, `El comercio pidió revisión: ticket ${child.ticket_id}.`);
  // Eliminada en Yokup y resuelta en el portal: se queda eliminada.
  const other = await applyPortalSync(t.env, portal({portal_incident_id:'retail-2', site:{name:'Otro', establishment:'yokup-site-2'}}), t.deps);
  t.db.prepare("UPDATE tickets SET status='cancelled' WHERE id=?").run(other.ticket_id);
  assert.equal((await applyPortalSync(t.env, portal({portal_incident_id:'retail-2', state:'resolved'}), t.deps)).status, 'cancelled');
});

test('una incidencia que nació aquí (sensor) se enlaza a su ticket, sin espejo', async () => {
  const t = database();
  t.db.prepare("INSERT INTO tickets(id,screen,subject,status,source,created_at,updated_at) VALUES('INC-AAA1','tcl-terminator','Pantalla sin señal','open','agent-iot',1,1)").run();
  const r = await applyPortalSync(t.env, portal({portal_incident_id:'desk:0a1b', origin:'rtc', rtc_ticket_id:'INC-AAA1', site:{name:'Starbucks Paseo de Gracia', establishment:'alsea-sbux-021'}}), t.deps);
  assert.deepEqual({id:r.ticket_id, created:r.created}, {id:'INC-AAA1', created:false});
  assert.equal(t.db.prepare('SELECT COUNT(*) n FROM tickets').get().n, 1);
  assert.equal(t.link('desk:0a1b').origin, 'rtc');
  // Un desk sin comercio (equipo sintético, agente) también se enlaza, sin ficha de portal.
  t.db.prepare("INSERT INTO tickets(id,screen,subject,status,source,created_at,updated_at) VALUES('AGT-1','agt:oraculo','Agente','open','sensor-agent',1,1)").run();
  await applyPortalSync(t.env, portal({portal_incident_id:'desk:ff', origin:'rtc', rtc_ticket_id:'AGT-1', site:null, portal_url:null, state:'assigned', technician_name:'DeepAgent Smith'}), t.deps);
  assert.equal(t.ticket('AGT-1').status, 'in_progress'); assert.equal(t.link('desk:ff').portal_url, null);
  assert.match(t.events('AGT-1')[0].text, /Yokup Desk, sin comercio/);
  // Ticket borrado a mano: se vuelve a crear el espejo en vez de quedarse colgado.
  t.db.prepare("DELETE FROM tickets WHERE id='INC-AAA1'").run();
  const again = await applyPortalSync(t.env, portal({portal_incident_id:'desk:0a1b', origin:'rtc', rtc_ticket_id:'INC-AAA1', site:{name:'Starbucks Paseo de Gracia', establishment:'alsea-sbux-021'}}), t.deps);
  assert.equal(again.created, true); assert.equal(t.ticket(again.ticket_id).screen, 'portal:desk:0a1b');
  await assert.rejects(applyPortalSync(t.env, {portal_incident_id:'x y', state:'open'}, t.deps), /requeridos/);
  await assert.rejects(applyPortalSync(t.env, portal({state:'borrada'}), t.deps), /requeridos/);
});

function desk(responses) {
  const calls = [];
  return {calls, async fetch(req) {
    assert.equal(req.url, PORTAL_STATUS_URL); assert.equal(req.headers.get('cf-connecting-ip'), null);
    const body = await req.json(); calls.push(body);
    const r = typeof responses === 'function' ? responses(body) : responses;
    if (r instanceof Error) throw r;
    return Response.json(r.body, {status:r.status || 200});
  }};
}

test('los cierres de Yokup viajan al portal; con técnico asignado se rechazan y el ticket vuelve a «En curso»', async () => {
  const t = database(), now = 10_000_000;
  const a = (await applyPortalSync(t.env, portal(), t.deps)).ticket_id;
  const b = (await applyPortalSync(t.env, portal({portal_incident_id:'retail-2', site:{name:'Otro', establishment:'yokup-site-2'}}), t.deps)).ticket_id;
  assert.equal((await pushPortalChanges(t.env, t.deps, now)).skipped, 'portal_binding_missing');
  t.env.INCIDENT_DESK = desk((p) => p.portal_incident_id === 'retail-1'
    ? {body:{ok:true, applied:true, ...portal({state:'resolved', resolution:`Cancelada desde Yokup (ticket ${a}).`})}}
    : {body:{ok:true, applied:false, ...portal({portal_incident_id:'retail-2', state:'assigned', technician_name:'Laura'})}});
  assert.deepEqual(await pushPortalChanges(t.env, t.deps, now), {pushed:0, failed:0}, 'nada cerrado, nada que empujar');
  t.db.prepare("UPDATE tickets SET status='cancelled' WHERE id=?").run(a);
  t.db.prepare("UPDATE tickets SET status='resolved' WHERE id=?").run(b);
  assert.deepEqual(await pushPortalChanges(t.env, t.deps, now), {pushed:2, failed:0});
  assert.deepEqual(t.env.INCIDENT_DESK.calls.map((c) => [c.portal_incident_id, c.rtc_ticket_id, c.status]), [['retail-1', a, 'cancelled'], ['retail-2', b, 'resolved']]);
  assert.equal(t.ticket(a).status, 'cancelled'); assert.equal(t.link('retail-1').portal_state, 'resolved');
  assert.equal(t.ticket(b).status, 'in_progress');
  assert.equal(t.events(b).at(-1).text, 'Estado → in_progress: sigue en curso en el portal del comercio (técnico Laura); se cierra allí con evidencia.');
  assert.deepEqual(await portalAssigned(t.env, b), {technician_name:'Laura'});
  // Anti-bucle: ya acordados, no se vuelve a llamar.
  assert.deepEqual(await pushPortalChanges(t.env, t.deps, now + 1), {pushed:0, failed:0});
  assert.equal(t.env.INCIDENT_DESK.calls.length, 2);
});

test('si el portal no responde, espera exponencial; se reintenta al vencer', async () => {
  const t = database(), now = 10_000_000;
  const id = (await applyPortalSync(t.env, portal(), t.deps)).ticket_id;
  t.db.prepare("UPDATE tickets SET status='resolved' WHERE id=?").run(id);
  t.env.INCIDENT_DESK = desk(new Error('down'));
  assert.deepEqual(await pushPortalChanges(t.env, t.deps, now), {pushed:0, failed:1});
  assert.deepEqual({a:t.link('retail-1').attempts, e:t.link('retail-1').last_error, n:t.link('retail-1').next_attempt_at}, {a:1, e:'portal_unreachable', n:now + 60000});
  assert.deepEqual(await pushPortalChanges(t.env, t.deps, now + 30000), {pushed:0, failed:0});
  t.env.INCIDENT_DESK = desk({status:503, body:{error:'x'}});
  await pushPortalChanges(t.env, t.deps, now + 60000);
  assert.deepEqual({a:t.link('retail-1').attempts, e:t.link('retail-1').last_error, n:t.link('retail-1').next_attempt_at}, {a:2, e:'portal_rejected_503', n:now + 60000 + 120000});
  t.env.INCIDENT_DESK = desk({body:{ok:true, applied:true, ...portal({state:'resolved'})}});
  assert.deepEqual(await pushPortalChanges(t.env, t.deps, now + 180000), {pushed:1, failed:0});
  assert.deepEqual({a:t.link('retail-1').attempts, e:t.link('retail-1').last_error}, {a:0, e:null});
});

test('/internal/portal/sync solo por el binding; sin tabla la bandeja no se rompe', async () => {
  const t = database();
  for (const req of [binding(portal(), {host:'api.yokup.com'}), binding(portal(), {host:'yokup-rtc.csilvasantin.workers.dev'}), binding(portal(), {headers:{'CF-Connecting-IP':'203.0.113.7'}}), binding(portal(), {headers:{'CF-Ray':'8c-MAD'}})])
    assert.equal((await handlePortalInternal(req, t.env, t.deps)).status, 404);
  assert.equal((await handlePortalInternal(new Request('https://yokup-rtc.internal/internal/otra', {method:'POST', body:'{}'}), t.env, t.deps)).status, 404);
  assert.equal((await handlePortalInternal(new Request('https://yokup-rtc.internal/internal/portal/sync', {method:'POST', body:'[]'}), t.env, t.deps)).status, 400);
  const ok = await handlePortalInternal(binding(portal()), t.env, t.deps);
  assert.equal(ok.status, 200); const body = await ok.json(); assert.equal(body.ok, true); assert.match(body.ticket_id, /^INC-/);
  assert.deepEqual([...(await portalLinksFor(t.env, [body.ticket_id, 'INC-NADA'])).entries()],
    [[body.ticket_id, {incident_id:'retail-1', origin:'portal', site_name:'Estanco local', url:'https://www.yokup.com/retailer/incidencia?id=retail-1', state:'open', technician_name:null}]]);
  const bare = database({links:false});
  assert.equal((await portalLinksFor(bare.env, ['INC-1'])).size, 0);
  assert.equal(await portalAssigned(bare.env, 'INC-1'), null);
});

test('el sensor de players manda el establecimiento al Desk y, con él, sale aunque no traiga coordenadas', async () => {
  const t = database(); await ensureSensorSchema(t.env);
  t.db.prepare("INSERT INTO tickets(id,screen,status) VALUES('INC-P','tcl-terminator','open'),('INC-Q','sin-loc','open')").run();
  await queueSignal(t.env, 'INC-P', {sensor:'player', resource:'tcl-terminator', subject:'Pantalla sin señal de emisión', loc:'Starbucks', locId:'alsea-sbux-021', detail:'x'});
  await queueSignal(t.env, 'INC-Q', {sensor:'player', resource:'sin-loc', subject:'Pantalla sin señal de emisión', loc:'', locId:'', detail:'x'});
  const sent = []; t.env.ADMIRA_TELEGRAM_PANEL_KEY = 'test';
  t.env.INCIDENT_DESK = {fetch:async (req) => { const p = await req.json(); sent.push(p); return Response.json({ok:true, id:'desk:' + p.external_id, channel:p.channel}); }};
  const out = await flushSensorOutbox(t.env);
  assert.equal(out.delivered, 1); assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].admira, {store_id:'alsea-sbux-021', device_id:'tcl-terminator'}); assert.equal(sent[0].external_id, 'rtc:INC-P');
  assert.equal(t.db.prepare("SELECT last_error FROM incident_sensor_outbox WHERE ticket_id='INC-Q'").get().last_error, 'player_coordinates_required');
});

test('cableado en el worker: ruta interna antes de la verja, esquema en una línea, cron, guardas y marca en /tickets', async () => {
  const fetchStart = source.indexOf('var worker_app = {');
  const internal = source.indexOf('if (url.pathname.startsWith(PORTAL_INTERNAL_PREFIX)) return handlePortalInternal(req, env, portalDeps());', fetchStart);
  assert.ok(internal > fetchStart && internal < source.indexOf('handleAuthRequest(req, env', fetchStart), 'la ruta interna va antes de la verja');
  assert.match(source, /await env\.DB\.exec\(unaLinea\(PORTAL_LINKS_SQL\)\);/);
  assert.match(fn('runScheduledRoutine'), /step\("portalBridge", async \(\) => \{\s*const r = await pushPortalChanges\(env, portalDeps\(\)\);/);
  assert.match(fn('reconcile'), /now - last\.ts >= FIELD_AUTOCLOSE_MS && !\(await portalAssigned\(env, open\.id\)\)/);
  const status = source.slice(source.indexOf('if (url.pathname === "/ticket/status" && req.method === "POST") {'));
  assert.match(status.slice(0, 1500), /portalAssigned\(env, b\.id\)[\s\S]*portal_assigned: true[\s\S]*409\);/);
  assert.match(status.slice(0, 6000), /ctx\.waitUntil\(pushPortalChanges\(env, portalDeps\(\)\)/);
  const bulk = source.slice(source.indexOf('if (url.pathname === "/tickets/status" && req.method === "POST") {'), source.indexOf('// PERSONALIZACIÓN del perímetro'));
  assert.match(bulk, /ctx\.waitUntil\(pushPortalChanges\(env, portalDeps\(\)\)/);
  assert.match(fn('listTickets'), /if \(scope !== "fleet" && rows\.length\) \{\s*const portal = await portalLinksFor/);
  const toml = await readFile(new URL('./wrangler.toml', import.meta.url), 'utf8');
  assert.match(toml, /\[\[services\]\]\s*binding = "INCIDENT_DESK"\s*service = "yokup-api"/);
  const apiToml = await readFile(new URL('../api/wrangler.toml', import.meta.url), 'utf8');
  assert.match(apiToml, /\[\[services\]\]\s*binding = "RTC"\s*service = "yokup-rtc"/);
});

// ── Extremo a extremo: yokup-api real (fixture SQLite de ../api) ↔ esta bandeja, por los dos bindings ──
test('extremo a extremo: alta en el portal, técnico, cierre desde Yokup rechazado, cierre con evidencia y valoración, sin rebotes', async () => {
  const {setup, call, account} = await import('../api/test-fixture.mjs');
  const {handleRetailer} = await import('../api/src/retailer-portal.js');
  const {dispatchNotifications} = await import('../api/src/installer-portal.js');
  const {syncIncidentLinks, handleIncidentLinksInternal} = await import('../api/src/incident-links.js');
  const B = setup(), A = database();
  let toA = 0, toB = 0;
  B.env.RTC = {fetch: async (req) => { toA++; return handlePortalInternal(req, A.env, A.deps); }};
  A.env.INCIDENT_DESK = {fetch: async (req) => { toB++; return handleIncidentLinksInternal(req, B.env); }};
  const retail = async (path, body, cookie) => { const r = await handleRetailer(new Request('https://data.yokup.com/api/retailer' + path, {method:body ? 'POST' : 'GET', headers:{Origin:'https://www.yokup.com', 'Content-Type':'application/json', ...(cookie ? {Cookie:cookie} : {})}, body:body ? JSON.stringify(body) : undefined}), B.env); return {status:r.status, body:await r.json(), cookie:r.headers.get('set-cookie')?.split(';')[0]}; };
  const me = await retail('/register', {name:'Comercio', email:crypto.randomUUID() + '@example.test', password:'retailer-test-password'});
  const site = await retail('/sites', {name:'Estanco local', kind:'tobacco', country:'ES', city:'Barcelona', address:'Dirección privada 1', latitude:41.3874, longitude:2.1686}, me.cookie);
  const device = await retail('/devices', {site_id:site.body.id, name:'Hilo musical', skill:'audio'}, me.cookie);
  const tech = await call(B.env, '/register', account({skills:['audio']}));
  const id = (await retail('/incidents', {device_id:device.body.id, title:'No suena el hilo musical', description:'El equipo dejó de reproducir música.', priority:'urgent', request_key:crypto.randomUUID()}, me.cookie)).body.id;
  await dispatchNotifications(B.env);
  // 1) El portal empuja el alta: ticket espejo en la bandeja, con proyecto = establecimiento.
  await syncIncidentLinks(B.env);
  const ticketId = B.db.prepare('SELECT rtc_ticket_id FROM incident_links WHERE installer_incident_id=?').get(id).rtc_ticket_id;
  assert.equal(A.ticket(ticketId).screen, 'portal:' + id); assert.equal(A.ticket(ticketId).project_id, 'yokup-' + site.body.id);
  // 2) Técnico acepta → en curso aquí.
  assert.equal((await call(B.env, '/incidents/' + id + '/accept', {}, tech.cookie)).status, 200);
  await syncIncidentLinks(B.env); assert.equal(A.ticket(ticketId).status, 'in_progress');
  // 3) Alguien la cierra en bloque desde Yokup: el portal lo rechaza y aquí vuelve a «En curso».
  A.db.prepare("UPDATE tickets SET status='resolved' WHERE id=?").run(ticketId);
  await pushPortalChanges(A.env, A.deps);
  assert.equal(A.ticket(ticketId).status, 'in_progress'); assert.equal(B.db.prepare('SELECT status FROM installer_incidents WHERE id=?').get(id).status, 'assigned');
  // 4) El técnico cierra con evidencia y el comercio valora: resuelta y valorada aquí.
  assert.equal((await call(B.env, '/incidents/' + id + '/resolve', {resolution:'Amplificador revisado, cable sustituido y audio comprobado.', evidence_url:'https://evidencia.test/cierre.jpg'}, tech.cookie)).status, 200);
  assert.equal((await retail('/incidents/' + id + '/rating', {stars:5, satisfied:true, comment:'Perfecto, gracias.'}, me.cookie)).status, 201);
  await syncIncidentLinks(B.env);
  assert.equal(A.ticket(ticketId).status, 'resolved'); assert.equal(A.events(ticketId).at(-1).text, 'Valoración del comercio: 5★ · funciona.');
  // 5) Nada más que hacer en ninguno de los dos lados: sin rebotes.
  const [a0, b0] = [toA, toB];
  assert.deepEqual(await syncIncidentLinks(B.env), {pushed:0, failed:0}); assert.deepEqual(await pushPortalChanges(A.env, A.deps), {pushed:0, failed:0});
  assert.deepEqual([toA, toB], [a0, b0]);
  // 6) El comercio ve el nº de ticket de Yokup en su ficha.
  assert.equal((await retail('/incidents/' + encodeURIComponent(id), undefined, me.cookie)).body.incident.yokup_ticket, ticketId);
  // 7) Otra, sin técnico: cancelarla en Yokup la cierra en el portal como «Cancelada desde Yokup».
  const device2 = await retail('/devices', {site_id:site.body.id, name:'Pantalla', skill:'screen'}, me.cookie);
  const id2 = (await retail('/incidents', {device_id:device2.body.id, title:'Pantalla negra', description:'No enciende desde esta mañana.', priority:'normal', request_key:crypto.randomUUID()}, me.cookie)).body.id;
  await syncIncidentLinks(B.env);
  const t2 = B.db.prepare('SELECT rtc_ticket_id FROM incident_links WHERE installer_incident_id=?').get(id2).rtc_ticket_id;
  A.db.prepare("UPDATE tickets SET status='cancelled' WHERE id=?").run(t2);
  await pushPortalChanges(A.env, A.deps);
  assert.match(B.db.prepare('SELECT resolution FROM installer_incidents WHERE id=?').get(id2).resolution, /^Cancelada desde Yokup \(ticket /);
  assert.equal(A.ticket(t2).status, 'cancelled');
  assert.deepEqual(await syncIncidentLinks(B.env), {pushed:0, failed:0}, 'el cierre que vino de Yokup no rebota');
});
