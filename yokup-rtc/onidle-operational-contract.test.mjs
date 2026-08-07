import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('./src/index.js',import.meta.url),'utf8');
const script=await readFile(new URL('./tools/onidle-hora.sh',import.meta.url),'utf8');

test('API publica elegibilidad y aplica el mismo guard al alta OnIdle',()=>{
  assert.match(source,/ONIDLE_DAILY_LIMIT = 8/);
  assert.match(source,/url\.pathname === "\/fleet\/onidle-state"/);
  assert.match(source,/operationalOnIdleState\(env, decisionIdentity\)/);
  assert.match(source,/pauseTimedOutOnIdleBatches/);
  assert.match(source,/WHERE id=\? AND status='active'/);
  assert.match(source,/operational_limit_ms:MISSION_UNCONCLUDED_AFTER_MS/);
});

test('script versionado consulta el guard y publica exactamente 3 + atrás + custom',()=>{
  assert.match(script,/ONIDLE_AGENT:-OraculoMacMini/);
  assert.match(script,/fleet\/onidle-state/);
  assert.match(script,/head -3/);
  assert.match(script,/\["↩ Volver atrás", "✍️ Custom · Escribe la mejora que quieras a mano"\]/);
  assert.match(script,/"onidle":True/);
  assert.match(script,/\$\(\(used\+1\)\)\/8/);
  assert.doesNotMatch(script,/head -5/);
});

test('started_at se fija una vez y los reportes no reinician el reloj',()=>{
  assert.match(source,/ALTER TABLE tickets ADD COLUMN started_at INTEGER/);
  assert.match(source,/status='in_progress',started_at=COALESCE\(started_at,\?\)/);
  assert.match(source,/ALTER TABLE mission_tasks ADD COLUMN started_at INTEGER/);
  assert.match(source,/COALESCE\(started_at,\?\)/);
  assert.match(source,/m\.created_at, m\.started_at, m\.updated_at/);
  assert.match(source,/visible_state:visible\.state/);
});
