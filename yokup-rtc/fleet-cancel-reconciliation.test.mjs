import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import worker from './src/index.js';

const telegramSource = await readFile(
  new URL('../../../github-csilvasantin/admira-telegram/src/index.js', import.meta.url),
  'utf8'
);

function d1(database) {
  const statement = (sql, args = []) => ({
    bind(...values) { return statement(sql, values); },
    async first() { return database.prepare(sql).get(...args) || null; },
    async all() { return {results: database.prepare(sql).all(...args)}; },
    async run() { return {meta: database.prepare(sql).run(...args)}; }
  });
  return {
    async exec(sql) { database.exec(sql); },
    prepare(sql) { return statement(sql); },
    async batch(statements) {
      database.exec('BEGIN');
      try {
        const results = [];
        for (const item of statements) results.push(await item.run());
        database.exec('COMMIT');
        return results;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    }
  };
}

const local = new DatabaseSync(':memory:');
const inbox = new DatabaseSync(':memory:');
const env = {DB:d1(local), TELEGRAM:null};
local.exec(`CREATE TABLE tickets(id TEXT PRIMARY KEY,screen TEXT,subject TEXT,loc TEXT,role TEXT,status TEXT,
  priority TEXT,assignee TEXT,source TEXT,ai_triage TEXT,created_at INTEGER,updated_at INTEGER,resolved_at INTEGER);
  CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT,ticket_id TEXT,ts INTEGER,kind TEXT,author TEXT,text TEXT);
  CREATE TABLE fleet_ids(inbox_id INTEGER PRIMARY KEY,mission_id TEXT UNIQUE,created_at INTEGER);`);
inbox.exec('CREATE TABLE telegram_inbox(id INTEGER PRIMARY KEY,status TEXT,note TEXT,done_at TEXT)');

function realBulkStatusBinding({override} = {}) {
  return {fetch:async (request) => {
    if (override) return override(request);
    const body = await request.json();
    assert.deepEqual(Object.keys(body).sort(), ['by','ids','note','status']);
    assert.equal(body.status, 'done');
    const updated = [];
    for (const id of body.ids) {
      const row = inbox.prepare('SELECT id FROM telegram_inbox WHERE id=?').get(id);
      if (!row) continue;
      inbox.prepare('UPDATE telegram_inbox SET status=?,note=?,done_at=? WHERE id=?')
        .run(body.status, body.note, new Date().toISOString(), id);
      updated.push(id);
    }
    return Response.json({ok:true,updated:updated.length});
  }};
}

async function reset({withInbox = true} = {}) {
  local.prepare('DELETE FROM events').run();
  local.prepare('DELETE FROM fleet_ids').run();
  local.prepare('DELETE FROM tickets').run();
  inbox.prepare('DELETE FROM telegram_inbox').run();
  local.prepare(`INSERT INTO tickets(id,screen,subject,loc,role,status,priority,assignee,source,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run('FLT-1005','NeoMini #991','Obsoleta','Mac Mini','agent','open','normal','NeoMini','fleet',1,1);
  local.prepare('INSERT INTO fleet_ids(inbox_id,mission_id,created_at) VALUES(?,?,?)').run(991,'FLT-1005',1);
  if (withInbox) inbox.prepare("INSERT INTO telegram_inbox(id,status,note) VALUES(991,'pending','original')").run();
}

async function cancel(telegram) {
  env.TELEGRAM = telegram;
  const response = await worker.fetch(new Request('https://yokup.com/fleet/cancel', {
    method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({mission:'FLT-1005',by:'SubOraculoMini',note:'obsoleta'})
  }), env, {});
  return {response, body:await response.json()};
}

test('fixture corresponde al bulk-status real: persiste note y no metadata', () => {
  const start = telegramSource.indexOf('async function handleBotInboxBulkStatus');
  const end = telegramSource.indexOf('\nasync function ', start + 20);
  assert.ok(start >= 0 && end > start, 'existe handleBotInboxBulkStatus real');
  const contract = telegramSource.slice(start, end);
  assert.match(contract, /const note = String\(b\.note/);
  assert.match(contract, /UPDATE telegram_inbox SET status=\?1, note=COALESCE/);
  assert.match(contract, /done_at = CASE WHEN \?1='done' THEN \?3/);
  assert.match(contract, /updated: updated\.length/);
  assert.doesNotMatch(contract, /metadata/);
});

test('handler real cancela D1 sólo tras confirmar exactamente una fila del inbox', async () => {
  await reset();
  const {response,body} = await cancel(realBulkStatusBinding());
  assert.equal(response.status, 200);
  assert.equal(body.cancelled, true);
  assert.equal(local.prepare('SELECT status FROM tickets WHERE id=?').get('FLT-1005').status, 'cancelled');
  const mirrored = inbox.prepare('SELECT status,note,done_at FROM telegram_inbox WHERE id=?').get(991);
  assert.equal(mirrored.status, 'done');
  assert.match(mirrored.note, /^Cancelación administrativa · NO EJECUTADO · Motivo: obsoleta$/);
  assert.ok(mirrored.done_at);
  const event = local.prepare('SELECT kind,author,text FROM events WHERE ticket_id=?').get('FLT-1005');
  assert.equal(event.kind, 'log');
  assert.equal(event.author, 'SubOraculoMini');
  assert.equal(event.text, '🗑 Eliminada: obsoleta.');
});

test('HTTP 200 updated:0 no muta ticket ni cronología local', async () => {
  await reset({withInbox:false});
  const {response,body} = await cancel(realBulkStatusBinding());
  assert.equal(response.status, 502);
  assert.equal(body.code, 'cancel_reconciliation_failed');
  assert.equal(body.local_cancelled, false);
  assert.equal(local.prepare('SELECT status FROM tickets WHERE id=?').get('FLT-1005').status, 'open');
  assert.equal(local.prepare('SELECT COUNT(*) n FROM events WHERE ticket_id=?').get('FLT-1005').n, 0);
});

test('updated exige el entero numérico exacto 1; coerciones JSON no mutan D1', async (t) => {
  for (const [name,updated] of [
    ['string', '1'], ['boolean', true], ['array', [1]], ['null', null], ['object', {value:1}]
  ]) await t.test(name, async () => {
    await reset();
    const override = async () => Response.json({ok:true,updated});
    const {response,body} = await cancel(realBulkStatusBinding({override}));
    assert.equal(response.status, 502);
    assert.equal(body.code, 'cancel_reconciliation_failed');
    assert.equal(body.local_cancelled, false);
    assert.equal(local.prepare('SELECT status FROM tickets WHERE id=?').get('FLT-1005').status, 'open');
    assert.equal(local.prepare('SELECT COUNT(*) n FROM events WHERE ticket_id=?').get('FLT-1005').n, 0);
    assert.equal(inbox.prepare('SELECT status FROM telegram_inbox WHERE id=?').get(991).status, 'pending');
  });
});

test('payload inválido o error HTTP del espejo tampoco mutan D1', async (t) => {
  for (const [name,override] of [
    ['json inválido', async () => new Response('not-json', {status:200})],
    ['payload inválido', async () => Response.json({ok:true})],
    ['error HTTP', async () => Response.json({ok:false,updated:1}, {status:500})]
  ]) await t.test(name, async () => {
    await reset();
    const {response} = await cancel(realBulkStatusBinding({override}));
    assert.equal(response.status, 502);
    assert.equal(local.prepare('SELECT status FROM tickets WHERE id=?').get('FLT-1005').status, 'open');
    assert.equal(local.prepare('SELECT COUNT(*) n FROM events WHERE ticket_id=?').get('FLT-1005').n, 0);
    assert.equal(inbox.prepare('SELECT status FROM telegram_inbox WHERE id=?').get(991).status, 'pending');
  });
});
