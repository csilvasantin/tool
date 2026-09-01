import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');

function body(name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `falta ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} incompleta`);
}

const cancellation = new Function('fleetEncargoId',
  `${body('notifyFleetAdministrativeCancellation')}; return notifyFleetAdministrativeCancellation;`)(async () => '991');

test('cancelación usa un estado admitido y deja trazabilidad de no ejecución', async () => {
  let sent;
  const env = {TELEGRAM:{fetch:async (request) => {
    sent = await request.json();
    return new Response(JSON.stringify({ok:true}), {status:200, headers:{'content-type':'application/json'}});
  }}};
  const result = await cancellation(env, {source:'fleet',screen:'NeoMini #991'}, 'FLT-1005', 'SubOraculoMini', 'obsoleta');
  assert.equal(result.updated, true);
  assert.equal(sent.status, 'done');
  assert.match(sent.note, /cancelada sin ejecutar/i);
  assert.deepEqual(sent.metadata, {resolution:'administrative_cancel', executed:false, mission_id:'FLT-1005'});
});

test('un rechazo o fallo de red del espejo nunca se presenta como actualizado', async () => {
  const rejected = await cancellation({TELEGRAM:{fetch:async () =>
    new Response(JSON.stringify({ok:false}), {status:400, headers:{'content-type':'application/json'}})}},
    {source:'fleet'}, 'FLT-1', 'SubOraculoMini', '');
  assert.equal(rejected.updated, false);
  const failed = await cancellation({TELEGRAM:{fetch:async () => { throw new Error('offline'); }}},
    {source:'fleet'}, 'FLT-1', 'SubOraculoMini', '');
  assert.equal(failed.updated, false);
});

test('/fleet/cancel reconcilia antes de mutar y devuelve 502 explícito si falla', () => {
  const route = source.slice(source.indexOf('url.pathname === "/fleet/cancel"'),
    source.indexOf('url.pathname === "/fleet/task-status"'));
  const mirror = route.indexOf('notifyFleetAdministrativeCancellation');
  const mutation = route.indexOf("UPDATE tickets SET status='cancelled'");
  assert.ok(mirror >= 0 && mutation > mirror, 'el espejo se confirma antes de cancelar localmente');
  assert.match(route, /cancel_reconciliation_failed/);
  assert.match(route, /inbox_resolution:"administrative_cancel"/);
  assert.doesNotMatch(route, /status:\s*"cancelled"/);
});
