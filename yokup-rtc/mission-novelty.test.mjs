import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {
  MISSION_NOVELTY_INSERT_SQL,
  MISSION_NOVELTY_TABLE_SQL,
  missionNoveltyContract,
  missionNoveltyEventKey
} from './src/mission-novelty.js';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE tickets(id TEXT PRIMARY KEY, created_at INTEGER, source TEXT)');
  db.exec(MISSION_NOVELTY_TABLE_SQL);
  return db;
}

function publish(db, missionId, createdAt, decisionId, batchId) {
  db.prepare('INSERT OR IGNORE INTO tickets(id,created_at,source) VALUES(?,?,?)')
    .run(missionId, createdAt, 'decision-batch');
  db.prepare(MISSION_NOVELTY_INSERT_SQL)
    .run(missionNoveltyEventKey(missionId), decisionId, batchId, missionId);
}

test('el cursor es monotónico y un reintento de la misma misión no lo duplica', () => {
  const db = database();
  publish(db, 'MIS-DEC-0131-01', 1000, 'DEC-0131', 'BATCH-0131');
  publish(db, 'MIS-DEC-0131-01', 9999, 'DEC-0131', 'BATCH-0131');
  publish(db, 'MIS-DEC-0132-01', 2000, 'DEC-0132', 'BATCH-0132');
  const rows = db.prepare('SELECT * FROM mission_novelty_events ORDER BY cursor').all();
  assert.equal(rows.length, 2);
  assert.ok(Number(rows[1].cursor) > Number(rows[0].cursor), 'AUTOINCREMENT puede dejar huecos, pero siempre avanza');
  assert.equal(rows[0].created_at, 1000, 'el retry conserva created_at del ticket original');
  assert.equal(rows[0].mission_id, 'MIS-DEC-0131-01');
  db.close();
});

test('el contrato público no depende de que la misión siga abierta', () => {
  const contract = missionNoveltyContract([
    {cursor:9, mission_id:'MIS-NEW', created_at:3000, source:'decision-batch', decision_id:'DEC-X', batch_id:'BATCH-X'},
    {cursor:8, mission_id:'MIS-OLD', created_at:2000, source:'fleet', decision_id:'', batch_id:''}
  ]);
  assert.equal(contract.created_cursor, 9);
  assert.equal(contract.latest_created_at, 3000);
  assert.equal(contract.newest_id, 'MIS-NEW');
  assert.equal(contract.events.length, 2);
  assert.deepEqual(Object.keys(contract.events[0]), ['cursor','mission_id','created_at','source','decision_id','batch_id']);
});

test('ticket, plan, estados, evento legible y cursor comparten una DB.batch', () => {
  const fn = source.slice(source.indexOf('async function activateNextMissionBatchItem'), source.indexOf('__name(activateNextMissionBatchItem'));
  assert.match(fn, /const atomic = \[/);
  assert.match(fn, /INSERT OR IGNORE INTO tickets/);
  assert.match(fn, /INSERT OR IGNORE INTO mission_tasks/);
  assert.match(fn, /UPDATE mission_batch_items/);
  assert.match(fn, /UPDATE mission_batches/);
  assert.match(fn, /MISSION_NOVELTY_INSERT_SQL/);
  assert.match(fn, /INSERT INTO events/);
  assert.match(fn, /await env\.DB\.batch\(atomic\)/);
  assert.doesNotMatch(fn, /await addEvent/);
});

test('elección manual, timeout y continuación convergen en la materialización', () => {
  const choose = source.slice(source.indexOf('if (/^\\/decisions\\/[^/]+\\/choose$/.test'), source.indexOf('if (/^\\/decisions\\/[^/]+$/.test'));
  assert.match(choose, /ensureMissionBatchFromDecision\(env, chosen\)/);
  assert.match(source, /async function expireDecisions[\s\S]*status='expired'/);
  assert.match(source, /async function startDecisionBatches[\s\S]*status IN \('decided','expired'\)/);
  const ensure = source.slice(source.indexOf('async function ensureMissionBatchFromDecision'), source.indexOf('__name(ensureMissionBatchFromDecision'));
  assert.match(ensure, /if \(continuation\)/);
  assert.equal((ensure.match(/activateNextMissionBatchItem\(env, batchId, decision\.id\)/g) || []).length, 3, 'raíz, continuación y recuperación convergen');
});

test('/menu/contadores clasifica toda misión y publica el cursor durable', () => {
  const menu = source.slice(source.indexOf('async function menuCounters'), source.indexOf('__name(menuCounters'));
  assert.match(menu, /role='mission' OR source IN \('fleet','decision-batch','cli-declare'\)/);
  assert.match(menu, /MISSION_NOVELTY_RECENT_SQL/);
  assert.match(menu, /Object\.assign\(out\.misiones, missionNoveltyContract\(novelty\)\)/);
});
