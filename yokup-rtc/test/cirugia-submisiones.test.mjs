// FLT-990 c — Cirugía de worker (SubNeoMini): submisiones a 2 niveles, auto-claim
// server-side y mapeo FLT↔encargo por el dato REAL (fleet_ids/screen).
//
// Se prueba contra un motor SQL REAL (node:sqlite) con el mismo shim D1 que usa
// reparto-ids.test.mjs. Las funciones bajo prueba se EXTRAEN del fuente vivo
// (src/index.js) para que la prueba no derive de la implementación. No toca
// producción: base en memoria. Ejecutar: `node --test test/cirugia-submisiones.test.mjs`.
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import assert from 'node:assert';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');

// ── Extracción de las funciones vivas del fuente ────────────────────────────
function grab(re, name) {
  const m = source.match(re);
  assert.ok(m, 'no se encontró en src/index.js: ' + name);
  return m[0];
}
const bundle = [
  grab(/function fleetInboxId\(mid\) \{[\s\S]*?\n\}/, 'fleetInboxId'),
  grab(/function inboxIdFromScreen\(screen\) \{[\s\S]*?\n\}/, 'inboxIdFromScreen'),
  grab(/async function fleetEncargoId\(env, mid, screen\) \{[\s\S]*?\n\}/, 'fleetEncargoId'),
  grab(/async function fleetSetParent\(env, b\) \{[\s\S]*?\n\}/, 'fleetSetParent'),
].join('\n');
const make = new Function('__name', 'addEvent',
  bundle + '\nreturn { fleetInboxId, inboxIdFromScreen, fleetEncargoId, fleetSetParent };');
const F = make(() => {}, async () => {});   // __name no-op · addEvent no-op (con .catch)

// ── Shim D1 sobre node:sqlite ───────────────────────────────────────────────
function mkEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec("CREATE TABLE tickets (id TEXT PRIMARY KEY, subject TEXT, screen TEXT, status TEXT, assignee TEXT, source TEXT, parent_id TEXT, note TEXT, created_at INTEGER, updated_at INTEGER)");
  db.exec("CREATE TABLE fleet_ids (inbox_id INTEGER PRIMARY KEY, mission_id TEXT UNIQUE, created_at INTEGER)");
  const DB = {
    exec: (sql) => db.exec(sql),
    prepare: (sql) => ({
      bind: (...args) => ({
        first: () => db.prepare(sql).get(...args) ?? null,
        run: () => { db.prepare(sql).run(...args); return { meta: {} }; },
        all: () => ({ results: db.prepare(sql).all(...args) }),
      }),
      first: () => db.prepare(sql).get() ?? null,
    }),
  };
  return { DB, _db: db };
}
const seed = (env, id, extra = {}) =>
  env.DB.prepare("INSERT INTO tickets(id,subject,screen,status,assignee,source,parent_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .bind(id, extra.subject || id, extra.screen || null, extra.status || 'open', extra.assignee || 'Neo', extra.source || 'fleet', extra.parent_id || null, 1, 1).run();
const tk = (env, id) => env.DB.prepare("SELECT * FROM tickets WHERE id=?").bind(id).first();

// ── PIEZA 1 · SUBMISIONES A 2 NIVELES (madre → misión → submisión) ──────────
test('pieza1: se cuelga una hija (nivel 1) de una madre raíz', async () => {
  const env = mkEnv();
  seed(env, 'FLT-100'); seed(env, 'FLT-101');
  const r = await F.fleetSetParent(env, { child: 'FLT-101', parent: 'FLT-100' });
  assert.ok(r.ok, 'debería colgar la hija: ' + JSON.stringify(r));
  assert.equal(tk(env, 'FLT-101').parent_id, 'FLT-100');
});

test('pieza1: PROFUNDIDAD 2 OK — se cuelga una submisión bajo una hija', async () => {
  const env = mkEnv();
  seed(env, 'FLT-100');                                  // madre raíz
  seed(env, 'FLT-101', { parent_id: 'FLT-100' });        // hija (nivel 1)
  seed(env, 'FLT-102');                                  // futura submisión
  const r = await F.fleetSetParent(env, { child: 'FLT-102', parent: 'FLT-101' });
  assert.ok(r.ok, 'el 2º nivel debe permitirse: ' + JSON.stringify(r));
  assert.equal(tk(env, 'FLT-102').parent_id, 'FLT-101');
});

test('pieza1: PROFUNDIDAD 3 RECHAZADA — no se cuelga nada bajo una submisión', async () => {
  const env = mkEnv();
  seed(env, 'FLT-100');                                  // madre raíz
  seed(env, 'FLT-101', { parent_id: 'FLT-100' });        // hija (nivel 1)
  seed(env, 'FLT-102', { parent_id: 'FLT-101' });        // submisión (nivel 2)
  seed(env, 'FLT-103');                                  // intento de 3er nivel
  const r = await F.fleetSetParent(env, { child: 'FLT-103', parent: 'FLT-102' });
  assert.equal(r.ok, false, 'el 3er nivel DEBE rechazarse');
  assert.match(r.error, /profundidad máxima 2/i);
  assert.equal(tk(env, 'FLT-103').parent_id, null, 'no debe haberse colgado');
});

test('pieza1: una madre que ya tiene hijas no puede volverse submisión (3er nivel indirecto)', async () => {
  const env = mkEnv();
  seed(env, 'FLT-200');                                  // raíz A
  seed(env, 'FLT-201', { parent_id: 'FLT-200' });        // hija de A (nivel 1)
  seed(env, 'FLT-300');                                  // raíz B (madre con hija)
  seed(env, 'FLT-301', { parent_id: 'FLT-300' });        // hija de B
  // Colgar FLT-300 (que ya es madre) bajo la hija FLT-201 empujaría a FLT-301 al nivel 3.
  const r = await F.fleetSetParent(env, { child: 'FLT-300', parent: 'FLT-201' });
  assert.equal(r.ok, false);
  assert.match(r.error, /3er nivel|tercer nivel/i);
});

test('pieza1: una madre CON hijas sí puede volverse hija de una raíz (queda en nivel 1)', async () => {
  const env = mkEnv();
  seed(env, 'FLT-400');                                  // raíz destino
  seed(env, 'FLT-500'); seed(env, 'FLT-501', { parent_id: 'FLT-500' }); // FLT-500 es madre
  const r = await F.fleetSetParent(env, { child: 'FLT-500', parent: 'FLT-400' });
  assert.ok(r.ok, 'una madre puede colgarse de una raíz: ' + JSON.stringify(r));
  assert.equal(tk(env, 'FLT-500').parent_id, 'FLT-400');
  // Sus hijas siguen a nivel 2, no 3.
  assert.equal(tk(env, 'FLT-501').parent_id, 'FLT-500');
});

test('pieza1: desenganchar (parent:null) devuelve una misión a plana', async () => {
  const env = mkEnv();
  seed(env, 'FLT-100'); seed(env, 'FLT-101', { parent_id: 'FLT-100' });
  const r = await F.fleetSetParent(env, { child: 'FLT-101', parent: null });
  assert.ok(r.ok);
  assert.equal(tk(env, 'FLT-101').parent_id, null);
});

// ── PIEZA 2 · AUTO-CLAIM server-side (open → in_progress) ───────────────────
// El guard es una sola sentencia idempotente; se prueba su efecto y su neutralidad.
const AUTOCLAIM = "UPDATE tickets SET status='in_progress', updated_at=? WHERE id=? AND status='open'";
test('pieza2: open → in_progress al primer toque', () => {
  const env = mkEnv();
  seed(env, 'FLT-100', { status: 'open' });
  env.DB.prepare(AUTOCLAIM).bind(Date.now(), 'FLT-100').run();
  assert.equal(tk(env, 'FLT-100').status, 'in_progress');
});
test('pieza2: no degrada una ya resuelta ni pisa una en curso', () => {
  const env = mkEnv();
  seed(env, 'FLT-1', { status: 'resolved' });
  seed(env, 'FLT-2', { status: 'in_progress' });
  env.DB.prepare(AUTOCLAIM).bind(Date.now(), 'FLT-1').run();
  env.DB.prepare(AUTOCLAIM).bind(Date.now(), 'FLT-2').run();
  assert.equal(tk(env, 'FLT-1').status, 'resolved');
  assert.equal(tk(env, 'FLT-2').status, 'in_progress');
});
test('pieza2: los dos endpoints llevan el guard de auto-claim', () => {
  const informe = source.slice(source.indexOf('"/fleet/informe"'), source.indexOf('"/fleet/cancel"'));
  const taskSt = source.slice(source.indexOf('"/fleet/task-status"'), source.indexOf('"/incident"'));
  assert.match(informe, /status='in_progress'[^]*?AND status='open'/);
  assert.match(taskSt, /status='in_progress'[^]*?AND status='open'/);
});

// ── PIEZA 3 · MAPEO FLT↔ENCARGO por el dato REAL (fleet_ids → screen → FLT) ──
test('pieza3: inboxIdFromScreen extrae el #<n> del screen', () => {
  assert.equal(F.inboxIdFromScreen('Neo·MacMini #991'), '991');
  assert.equal(F.inboxIdFromScreen('?·? #1005'), '1005');
  assert.equal(F.inboxIdFromScreen('sin numero'), null);
  assert.equal(F.inboxIdFromScreen(''), null);
});

test('pieza3: CASO FLT-1005/#991 — el encargo REAL sale de fleet_ids, no del id pelado', async () => {
  const env = mkEnv();
  // El reparto anticolisión dio FLT-1005 al encargo #991; su screen lo confirma.
  seed(env, 'FLT-1005', { screen: 'Neo·MacMini #991' });
  env.DB.prepare("INSERT INTO fleet_ids(inbox_id,mission_id,created_at) VALUES(?,?,?)").bind(991, 'FLT-1005', 1).run();
  const id = await F.fleetEncargoId(env, 'FLT-1005', tk(env, 'FLT-1005').screen);
  assert.equal(id, '991', 'debe cerrar/cancelar el encargo #991, no el inexistente #1005');
  // El viejo replace ingenuo habría dado 1005 (el bug).
  assert.notEqual(id, '1005');
});

test('pieza3: sin fila en fleet_ids cae al #<n> del screen', async () => {
  const env = mkEnv();
  seed(env, 'FLT-1005', { screen: 'Neo·MacMini #991' });   // sin fleet_ids
  const id = await F.fleetEncargoId(env, 'FLT-1005', tk(env, 'FLT-1005').screen);
  assert.equal(id, '991');
});

test('pieza3: sin fleet_ids ni screen, último recurso = pelar FLT-', async () => {
  const env = mkEnv();
  seed(env, 'FLT-777', { screen: null });
  const id = await F.fleetEncargoId(env, 'FLT-777', null);
  assert.equal(id, '777');
});

test('pieza3: caso natural (id == encargo) resuelve igual por fleet_ids', async () => {
  const env = mkEnv();
  seed(env, 'FLT-985', { screen: 'Neo·MacMini #985' });
  env.DB.prepare("INSERT INTO fleet_ids(inbox_id,mission_id,created_at) VALUES(?,?,?)").bind(985, 'FLT-985', 1).run();
  assert.equal(await F.fleetEncargoId(env, 'FLT-985', tk(env, 'FLT-985').screen), '985');
});

test('pieza3: informe y cancel usan fleetEncargoId (no el replace ingenuo)', () => {
  const informe = source.slice(source.indexOf('"/fleet/informe"'), source.indexOf('"/fleet/cancel"'));
  const cancel = source.slice(source.indexOf('"/fleet/cancel"'), source.indexOf('"/fleet/task-status"'));
  assert.match(informe, /fleetEncargoId\(env, mid, t\.screen\)/);
  assert.match(cancel, /fleetEncargoId\(env, mid, t\.screen\)/);
});
