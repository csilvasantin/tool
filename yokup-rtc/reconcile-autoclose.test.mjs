// FLT-100514 · Incidencias automáticas de players: el reconcile abre por player
// caído (ya lo hacía), anota la recuperación y AHORA cierra solo a los 5 minutos
// seguidos de latido sano; una recaída dentro de esos 5 minutos reinicia el contador
// y NO abre una segunda incidencia. Arnés: las funciones reales del worker,
// extraídas de src/index.js y ejecutadas sobre un SQLite en memoria con el mismo
// índice parcial de producción (una incidencia activa por recurso).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');
const pick = (re) => {
  const match = source.match(re);
  if (!match) throw new Error('bloque no encontrado en src/index.js: ' + re);
  return match[0];
};

const MIN = 60000;

function build(screens) {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE tickets(id TEXT PRIMARY KEY, screen TEXT, status TEXT, updated_at INTEGER, resolved_at INTEGER);
    CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT, ts INTEGER, kind TEXT, author TEXT, text TEXT);
    CREATE UNIQUE INDEX idx_active_screen ON tickets(screen) WHERE status NOT IN ('resolved','cancelled');
  `);
  const statement = (sql, args = []) => ({
    bind(...next) { return statement(sql, next); },
    async run() { const info = db.prepare(sql).run(...args); return {meta:{changes:info.changes}}; },
    async first() { return db.prepare(sql).get(...args) ?? null; },
    async all() { return {results:db.prepare(sql).all(...args)}; }
  });
  const calls = {created:[], notified:0};
  const context = vm.createContext({
    Date, Number, String, Math, JSON,
    fetch: async () => ({ json: async () => ({screens: screens.list}) }),
    createTicket: async (env, s) => { calls.created.push(s.screen); },
    notifySubs: async () => { calls.notified++; },
    __name: () => {}
  });
  vm.runInContext([
    pick(/var FIELD_AUTOCLOSE_MS = [^]*?var FIELD_RECOVER_TEXT = [^\n]*\n/),
    pick(/async function addEvent\(env, ticketId, kind, author, text\) \{[^]*?\n\}/),
    pick(/async function lastEventKind\(env, ticketId\) \{[^]*?\n\}/),
    pick(/async function lastEvent\(env, ticketId\) \{[^]*?\n\}/),
    pick(/async function reconcile\(env\) \{[^]*?\n\}/),
    'globalThis.api = {reconcile, FIELD_AUTOCLOSE_MS};'
  ].join('\n'), context);
  const env = {DB:{prepare:(sql) => statement(sql)}};
  const seed = (id, screen, status, events) => {
    db.prepare('INSERT INTO tickets VALUES(?,?,?,?,NULL)').run(id, screen, status, Date.now() - 60 * MIN);
    for (const [kind, agoMs] of events) {
      db.prepare('INSERT INTO events(ticket_id,ts,kind,author,text) VALUES(?,?,?,?,?)').run(id, Date.now() - agoMs, kind, 'test', kind);
    }
  };
  const ticket = (id) => db.prepare('SELECT id,status,resolved_at FROM tickets WHERE id=?').get(id);
  const kinds = (id) => db.prepare('SELECT kind FROM events WHERE ticket_id=? ORDER BY id').all(id).map(r => r.kind);
  return {env, calls, seed, ticket, kinds, reconcile: () => context.api.reconcile(env), autocloseMs: context.api.FIELD_AUTOCLOSE_MS};
}

test('el umbral de cierre automático es 5 minutos', () => {
  const t = build({list:[]});
  assert.equal(t.autocloseMs, 5 * MIN);
});

test('online tras 5 minutos de recover: la incidencia se cierra sola con evento close y aviso', async () => {
  const t = build({list:[{screen:'tcl-terminator', online:true, age_seconds:46}]});
  t.seed('INC-A', 'tcl-terminator', 'open', [['log', 60 * MIN], ['recover', 6 * MIN]]);
  await t.reconcile();
  const row = t.ticket('INC-A');
  assert.equal(row.status, 'resolved');
  assert.ok(row.resolved_at > 0, 'resolved_at queda escrito');
  assert.deepEqual(t.kinds('INC-A'), ['log', 'recover', 'close']);
  assert.equal(t.calls.notified, 1);
});

test('online con recover de hace 1 minuto: sigue abierta y sin eventos nuevos', async () => {
  const t = build({list:[{screen:'p1', online:true}]});
  t.seed('INC-B', 'p1', 'open', [['log', 30 * MIN], ['recover', 1 * MIN]]);
  await t.reconcile();
  assert.equal(t.ticket('INC-B').status, 'open');
  assert.deepEqual(t.kinds('INC-B'), ['log', 'recover']);
  assert.equal(t.calls.notified, 0);
});

test('online sin recover previo: anota recover y no cierra todavía', async () => {
  const t = build({list:[{screen:'p2', online:true}]});
  t.seed('INC-C', 'p2', 'open', [['log', 30 * MIN], ['ai', 30 * MIN]]);
  await t.reconcile();
  assert.equal(t.ticket('INC-C').status, 'open');
  assert.deepEqual(t.kinds('INC-C'), ['log', 'ai', 'recover']);
  await t.reconcile();
  assert.deepEqual(t.kinds('INC-C'), ['log', 'ai', 'recover'], 'un segundo reconcile no duplica el recover');
});

test('recaída antes de los 5 minutos: relapse, misma incidencia, y el contador vuelve a cero', async () => {
  const screens = {list:[{screen:'p3', online:false, age_seconds:400}]};
  const t = build(screens);
  t.seed('INC-D', 'p3', 'open', [['log', 30 * MIN], ['recover', 4 * MIN]]);
  await t.reconcile();
  assert.equal(t.ticket('INC-D').status, 'open');
  assert.deepEqual(t.kinds('INC-D'), ['log', 'recover', 'relapse']);
  assert.deepEqual(t.calls.created, [], 'la recaída no abre una segunda incidencia');
  await t.reconcile();
  assert.deepEqual(t.kinds('INC-D'), ['log', 'recover', 'relapse'], 'seguir caída no repite el relapse');
  screens.list = [{screen:'p3', online:true, age_seconds:10}];
  await t.reconcile();
  assert.deepEqual(t.kinds('INC-D'), ['log', 'recover', 'relapse', 'recover'], 'al volver, nuevo recover con hora nueva');
  assert.equal(t.ticket('INC-D').status, 'open', 'el cierre cuenta desde el recover nuevo, no desde el viejo');
});

test('caída sin incidencia activa: se abre (createTicket); una resuelta no se reabre, se abre otra', async () => {
  const t = build({list:[{screen:'p4', online:false, age_seconds:500}, {screen:'p5', online:false, age_seconds:500}]});
  t.seed('INC-OLD', 'p5', 'resolved', [['close', 10 * MIN]]);
  await t.reconcile();
  assert.deepEqual(t.calls.created.sort(), ['p4', 'p5']);
  assert.equal(t.ticket('INC-OLD').status, 'resolved');
  assert.deepEqual(t.kinds('INC-OLD'), ['close']);
});

test('una pantalla online sin incidencia no genera nada', async () => {
  const t = build({list:[{screen:'p6', online:true}]});
  await t.reconcile();
  assert.deepEqual(t.calls.created, []);
  assert.equal(t.calls.notified, 0);
});
