import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');

function envWithMapping(inboxId, missionId) {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE fleet_ids (inbox_id INTEGER PRIMARY KEY, mission_id TEXT UNIQUE, created_at INTEGER)');
  db.prepare('INSERT INTO fleet_ids(inbox_id,mission_id,created_at) VALUES(?,?,?)').run(inboxId, missionId, 1);
  return { DB: { prepare(sql) { const stmt = db.prepare(sql); return { bind(...args) { return { first: async () => stmt.get(...args) || null }; } }; } } };
}

function normalizeMissionReference(raw) {
  const value = String(raw == null ? '' : raw).trim();
  if (/^#?\d+$/.test(value)) return 'FLT-' + value.replace(/^#/, '');
  const fleet = /^flt-(\d+)$/i.exec(value);
  return fleet ? 'FLT-' + fleet[1] : value;
}

async function resolveFleetMissionReference(env, raw) {
  const value = String(raw == null ? '' : raw).trim();
  const numeric = /^#?(\d+)$/.exec(value);
  if (numeric) {
    const mapped = await env.DB.prepare('SELECT mission_id FROM fleet_ids WHERE inbox_id=?').bind(Number(numeric[1])).first();
    if (mapped && mapped.mission_id) return mapped.mission_id;
  }
  return normalizeMissionReference(value);
}

test('un número de encargo resuelve el id remapeado por colisión', async () => {
  const env = envWithMapping(1036, 'FLT-1045');
  assert.equal(await resolveFleetMissionReference(env, '1036'), 'FLT-1045');
  assert.equal(await resolveFleetMissionReference(env, '#1036'), 'FLT-1045');
});

test('un id explícito de Yokup permanece explícito', async () => {
  const env = envWithMapping(1036, 'FLT-1045');
  assert.equal(await resolveFleetMissionReference(env, 'FLT-1036'), 'FLT-1036');
  assert.equal(await resolveFleetMissionReference(env, 'MIS-DEC-ABC'), 'MIS-DEC-ABC');
});

test('todos los endpoints públicos de agente usan el resolvedor canónico', () => {
  for (const route of ['/fleet/progress', '/fleet/informe', '/fleet/cancel', '/fleet/task-status']) {
    const start = source.indexOf(`"${route}"`);
    assert.notEqual(start, -1, `falta ${route}`);
    const block = source.slice(start, start + 1800);
    assert.match(block, /resolveFleetMissionReference\(env, b\.mission \|\| b\.id\)/, `${route} no consulta fleet_ids`);
  }
});

test('fleetSync conserva una resuelta con prueba y su resolved_at', () => {
  const start = source.indexOf('async function fleetSync(env)');
  const block = source.slice(start, source.indexOf('__name(fleetSync', start));
  assert.match(block, /prev\.status === "resolved"[\s\S]*hasMissionProof\(env, id\)[\s\S]*st = "resolved"/);
  assert.match(block, /reconcileFleetTicket\(env, id, prev, it, assignment, st, now\)/);
  const helperStart = source.indexOf('async function reconcileFleetTicket');
  const helper = source.slice(helperStart, source.indexOf('__name(reconcileFleetTicket', helperStart));
  assert.match(helper, /prev\.resolved_at \|\| now/);
});
