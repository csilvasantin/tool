// FLT-1016 c · Latido de la rutina programada: observabilidad (worker_beats) +
// cerrojo temporal por D1 + cuerpo único runScheduledRoutine.
// Extrae del propio src/index.js las funciones bajo prueba (mismo patrón vm que el
// resto de tests) y las corre contra un motor SQL REAL (node:sqlite) con un shim que
// imita la API de D1 (.bind().run()/.first()/.all() y meta.changes). No toca
// producción: base en memoria. Ejecutar: `node --test worker-beats.test.mjs`.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');

const pick = (re) => {
  const m = source.match(re);
  if (!m) throw new Error('no se encontró en el source: ' + re);
  return m[0];
};

const chunks = [
  pick(/async function ensureWorkerBeatsSchema\(env\) \{[^]*?\n\}/),
  pick(/async function recordBeat\(env, routine, ok, error\) \{[^]*?\n\}/),
  pick(/async function tryAcquireBeatLease\(env, name, minGapMs\) \{[^]*?\n\}/),
  pick(/async function beatAge\(env, routine\) \{[^]*?\n\}/),
  pick(/async function runScheduledRoutine\(env, event\) \{[^]*?\n\}/),
].join('\n');

// Shim D1 sobre node:sqlite (motor SQL real → ON CONFLICT y changes() de verdad).
function makeEnv() {
  const db = new DatabaseSync(':memory:');
  const mkStmt = (sql) => {
    const runWith = (args) => { const info = db.prepare(sql).run(...args); return { meta: { changes: info.changes, last_row_id: info.lastInsertRowid } }; };
    const firstWith = (args) => db.prepare(sql).get(...args) ?? null;
    const allWith = (args) => ({ results: db.prepare(sql).all(...args) });
    return {
      bind: (...args) => ({ run: async () => runWith(args), first: async () => firstWith(args), all: async () => allWith(args) }),
      run: async () => runWith([]),
      first: async () => firstWith([]),
      all: async () => allWith([]),
    };
  };
  return { _db: db, DB: { exec: async (sql) => db.exec(sql), prepare: (sql) => mkStmt(sql) } };
}

const context = vm.createContext({});
vm.runInContext(`
  ${chunks}
  globalThis.__name = (f) => f;
  // Contadores y control de los stubs de las sub-rutinas (runScheduledRoutine).
  globalThis.__stub = { calls: {}, throwOn: null, scheduleThrows: false };
  const bump = (n) => { __stub.calls[n] = (__stub.calls[n] || 0) + 1; if (__stub.throwOn === n) throw new Error('boom-' + n); };
  globalThis.ensureSchema = async () => { if (__stub.scheduleThrows) throw new Error('no-schema'); };
  globalThis.expireDecisionsAndStartBatches = async () => bump('expireDecisions');
  globalThis.reconcile = async () => bump('reconcile');
  globalThis.checkWebs = async () => bump('checkWebs');
  globalThis.checkMachines = async () => bump('checkMachines');
  globalThis.fleetSync = async () => bump('fleetSync');
  globalThis.fleetPlanPending = async () => bump('fleetPlan');
  globalThis.fleetReconcileAll = async () => bump('fleetReconcile');
  globalThis.runCouncilTick = async () => bump('council');
  globalThis.api = { ensureWorkerBeatsSchema, recordBeat, tryAcquireBeatLease, beatAge, runScheduledRoutine };
  globalThis.resetStub = (o) => { __stub.calls = {}; __stub.throwOn = (o && o.throwOn) || null; __stub.scheduleThrows = !!(o && o.scheduleThrows); };
  globalThis.stubCalls = () => __stub.calls;
`, context);

const { ensureWorkerBeatsSchema, recordBeat, tryAcquireBeatLease, beatAge, runScheduledRoutine } = context.api;

test('cerrojo D1: sólo UN turno por ventana; vencida la ventana, vuelve a conceder', async () => {
  const env = makeEnv();
  // Primer intento en tabla vacía → inserta y gana el turno.
  assert.equal(await tryAcquireBeatLease(env, '__scheduled', 120000), true);
  // Segundo intento inmediato (misma ventana) → BLOQUEADO: evita el solape de isolates.
  assert.equal(await tryAcquireBeatLease(env, '__scheduled', 120000), false);
  assert.equal(await tryAcquireBeatLease(env, '__scheduled', 120000), false);
  // Simulamos que pasó el tiempo envejeciendo la fila-cerrojo por debajo del umbral.
  env._db.prepare("UPDATE worker_beats SET at = ? WHERE routine='__scheduled'").run(Date.now() - 200000);
  assert.equal(await tryAcquireBeatLease(env, '__scheduled', 120000), true, 'vencida la ventana, concede de nuevo');
  assert.equal(await tryAcquireBeatLease(env, '__scheduled', 120000), false, 'y vuelve a cerrar');
});

test('cerrojo con gap=0: no throttlea (siempre concede) — util para forzar en pruebas', async () => {
  const env = makeEnv();
  assert.equal(await tryAcquireBeatLease(env, '__x', 0), true);
  assert.equal(await tryAcquireBeatLease(env, '__x', 0), true);
});

test('registro: upsert por rutina (una fila) con el ULTIMO resultado; error recortado a 300', async () => {
  const env = makeEnv();
  await recordBeat(env, 'reconcile', true, '');
  await recordBeat(env, 'reconcile', false, new Error('x'.repeat(1000)));
  const rows = env._db.prepare("SELECT * FROM worker_beats WHERE routine='reconcile'").all();
  assert.equal(rows.length, 1, 'una sola fila por rutina (idempotente)');
  assert.equal(rows[0].ok, 0, 'refleja el ULTIMO resultado (fallo)');
  assert.ok(rows[0].error.length > 0 && rows[0].error.length <= 300, 'error no vacío y recortado a ≤300');
  // Un ok posterior limpia el error.
  await recordBeat(env, 'reconcile', true, '');
  const r2 = env._db.prepare("SELECT * FROM worker_beats WHERE routine='reconcile'").get();
  assert.equal(r2.ok, 1);
  assert.equal(r2.error, '');
});

test('registro: poda a 100 filas', async () => {
  const env = makeEnv();
  for (let i = 0; i < 130; i++) await recordBeat(env, 'r' + i, true, '');
  const n = env._db.prepare('SELECT COUNT(*) c FROM worker_beats').get().c;
  assert.ok(n <= 100, 'la bitácora se poda a ~100 filas (era ' + n + ')');
});

test('beatAge: Infinity si nunca corrió; pequeño tras registrar', async () => {
  const env = makeEnv();
  assert.equal(await beatAge(env, 'checkWebs'), Infinity);
  await recordBeat(env, 'checkWebs', true, '');
  const age = await beatAge(env, 'checkWebs');
  assert.ok(Number.isFinite(age) && age >= 0 && age < 5000, 'edad finita y reciente');
});

test('rutina: corre todas las sub-rutinas y deja latido ok en cada una', async () => {
  const env = makeEnv();
  context.resetStub({});
  const out = await runScheduledRoutine(env, null);
  const calls = context.stubCalls();
  // Sub-rutinas siempre presentes en cada tick.
  for (const n of ['expireDecisions', 'reconcile', 'fleetSync', 'fleetPlan', 'fleetReconcile', 'council']) {
    assert.equal(calls[n], 1, n + ' debe correr una vez');
    assert.equal(out[n].ok, true, n + ' latido ok');
  }
  // checkWebs es caro: corre la 1ª vez (beat inexistente → Infinity ≥ umbral).
  assert.equal(calls.checkWebs, 1, 'checkWebs corre la 1ª vez');
  assert.equal(calls.checkMachines, 1);
  // Y queda registrado en worker_beats.
  const beats = env._db.prepare('SELECT routine,ok FROM worker_beats').all();
  const names = beats.map((b) => b.routine);
  for (const n of ['expireDecisions', 'reconcile', 'checkWebs', 'fleetSync', 'fleetPlan', 'fleetReconcile', 'council']) {
    assert.ok(names.includes(n), 'bitácora incluye ' + n);
  }
});

test('rutina: checkWebs se autolimita por su propia edad (~10 min), el resto corre siempre', async () => {
  const env = makeEnv();
  context.resetStub({});
  await runScheduledRoutine(env, null);          // 1ª: checkWebs corre
  context.resetStub({});
  await runScheduledRoutine(env, null);          // 2ª inmediata: checkWebs se salta
  const calls = context.stubCalls();
  assert.equal(calls.checkWebs, undefined, 'checkWebs NO corre en la 2ª (edad < 10 min)');
  assert.equal(calls.reconcile, 1, 'reconcile SÍ corre cada tick');
  assert.equal(calls.council, 1, 'council SÍ corre cada tick');
});

test('rutina: doble ejecución segura — repetir no rompe ni duplica filas de bitácora', async () => {
  const env = makeEnv();
  context.resetStub({});
  await runScheduledRoutine(env, null);
  context.resetStub({});
  await runScheduledRoutine(env, null);
  // Cada rutina sigue teniendo UNA sola fila (upsert), aunque haya corrido dos veces.
  const dup = env._db.prepare("SELECT routine, COUNT(*) c FROM worker_beats GROUP BY routine HAVING c > 1").all();
  assert.equal(dup.length, 0, 'ninguna rutina duplica fila de bitácora');
});

test('rutina: una sub-rutina que revienta NO tumba a las siguientes; su fallo queda grabado', async () => {
  const env = makeEnv();
  context.resetStub({ throwOn: 'fleetSync' });   // fleetSync lanza
  const out = await runScheduledRoutine(env, null);
  const calls = context.stubCalls();
  assert.equal(out.fleetSync.ok, false, 'fleetSync marcado como fallo');
  assert.ok(out.fleetSync.error.includes('boom-fleetSync'), 'el error se propaga al resumen');
  // Las posteriores SIGUEN corriendo.
  assert.equal(calls.fleetPlan, 1, 'fleetPlan corre pese al fallo previo');
  assert.equal(calls.fleetReconcile, 1);
  assert.equal(calls.council, 1, 'council corre pese al fallo previo');
  // Y el fallo queda en la bitácora (ok=0, error grabado).
  const row = env._db.prepare("SELECT ok,error FROM worker_beats WHERE routine='fleetSync'").get();
  assert.equal(row.ok, 0);
  assert.ok(row.error.length > 0);
});

test('rutina: sin esquema (ensureSchema revienta) aborta limpio sin correr nada', async () => {
  const env = makeEnv();
  context.resetStub({ scheduleThrows: true });
  const out = await runScheduledRoutine(env, null);
  assert.equal(Object.keys(out).length, 0, 'no corre ninguna sub-rutina si no hay esquema');
  assert.equal(context.stubCalls().reconcile, undefined);
});
