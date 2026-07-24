// FLT-1016 · Autocuración + observabilidad del cron del Consejo.
// Extrae del propio src/index.js las funciones bajo prueba (mismo patrón vm que el
// resto de tests del repo) y les inyecta stubs de generateCouncilIdea / ensureIdeasSchema
// + un env.DB en memoria que entiende las pocas consultas que tocan estas funciones.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');

const pick = (re) => {
  const m = source.match(re);
  if (!m) throw new Error('no se encontró en el source: ' + re);
  return m[0];
};

const chunks = [
  pick(/const COUNCIL_ORDER = \[[^\]]*\];/),
  pick(/function councilSeatForHour\(h\) \{[^]*?\n\}/),
  pick(/async function ensureCouncilTicksSchema\(env\) \{[^]*?\n\}/),
  pick(/async function recordCouncilTick\(env, \{ slotStart, seat, ok, error \}\) \{[^]*?\n\}/),
  pick(/async function runCouncilTick\(env\) \{[^]*?\n\}/),
].join('\n');

const context = vm.createContext({});
vm.runInContext(`
  ${chunks}
  globalThis.__name = (f) => f;
  globalThis.console = { log() {} };
  // Estado mutable que las pruebas manejan para dirigir el stub de la IA.
  globalThis.__mock = { mode: 'fail', calls: 0, longMsg: 'x'.repeat(1000) };
  globalThis.ensureIdeasSchema = async () => {};
  // Stub del generador: 'fail' → null (IA no usable), 'ok' → inserta idea del hueco,
  // 'throw' → excepción con mensaje largo (para probar el recorte del error).
  globalThis.generateCouncilIdea = async (env, seat) => {
    __mock.calls++;
    if (__mock.mode === 'throw') throw new Error(__mock.longMsg);
    if (__mock.mode === 'fail') return null;
    env._ideas.push({ tag: 'consejo', created_at: Date.now() });
    return { id: 'IDEA-test', seat, tag: 'consejo', status: 'estudio' };
  };
  // env.DB en memoria: modela ideas (idempotencia por hueco) y council_ticks (upsert).
  globalThis.makeEnv = () => {
    const ideas = [];
    const ticks = new Map();
    const stmt = (sql) => {
      let p = [];
      return {
        bind(...a) { p = a; return this; },
        async first() {
          if (/SELECT id FROM ideas WHERE tag='consejo' AND created_at >= \\?/.test(sql)) {
            const slotStart = p[0];
            return ideas.some((i) => i.tag === 'consejo' && i.created_at >= slotStart) ? { id: 'x' } : null;
          }
          return null;
        },
        async run() {
          if (/INSERT INTO council_ticks/.test(sql)) {
            const [slot_start, seat, ok, error, at] = p;
            ticks.set(slot_start, { slot_start, seat, ok, error, at });
          } else if (/DELETE FROM council_ticks/.test(sql)) {
            const keep = new Set([...ticks.keys()].sort((a, b) => b - a).slice(0, 50));
            for (const k of [...ticks.keys()]) if (!keep.has(k)) ticks.delete(k);
          }
          return {};
        },
        async all() { return { results: [] }; },
      };
    };
    return { _ideas: ideas, _ticks: ticks, DB: { prepare: (sql) => stmt(sql), exec: async () => {} } };
  };
  globalThis.setMock = (mode) => { __mock.mode = mode; };
  globalThis.mockCalls = () => __mock.calls;
  globalThis.resetMock = () => { __mock.calls = 0; __mock.mode = 'fail'; };
  globalThis.api = { runCouncilTick, councilSeatForHour };
`, context);

const { runCouncilTick, councilSeatForHour } = context.api;
const slotStartNow = () => Math.floor(Date.now() / (3 * 60 * 60 * 1e3)) * (3 * 60 * 60 * 1e3);

test('seat determinista: la franja UTC 3-5 la firma el CTO (índice 1 del orden)', () => {
  assert.equal(councilSeatForHour(3), 'cto');
  assert.equal(councilSeatForHour(4), 'cto');
  assert.equal(councilSeatForHour(5), 'cto');
  assert.equal(councilSeatForHour(0), 'ceo');
  assert.equal(councilSeatForHour(21), 'cso');
});

test('idempotencia por slot con reintento: fallo → reintento acierta → siguiente tick no regenera', async () => {
  context.resetMock();
  const env = context.makeEnv();

  // Tick 1: la IA falla. Sin idea; el hueco queda registrado con ok=0 y su error.
  context.setMock('fail');
  const r1 = await runCouncilTick(env);
  assert.equal(r1, null);
  assert.equal(env._ideas.length, 0);
  const slot = slotStartNow();
  const t1 = env._ticks.get(slot);
  assert.ok(t1, 'debe haber registro del hueco');
  assert.equal(t1.ok, 0);
  assert.ok(t1.error.length > 0, 'el error del fallo se graba');
  assert.equal(context.mockCalls(), 1);

  // Tick 2 (mismo hueco, siguiente */2): la IA acierta. Nace la idea, ok=1.
  context.setMock('ok');
  const r2 = await runCouncilTick(env);
  assert.ok(r2 && r2.id, 'el reintento genera la idea');
  assert.equal(env._ideas.length, 1);
  const t2 = env._ticks.get(slot);
  assert.equal(t2.ok, 1);
  assert.equal(t2.error, '');
  assert.equal(context.mockCalls(), 2);

  // Tick 3 (mismo hueco): ya hay idea → NO se vuelve a llamar al generador.
  const r3 = await runCouncilTick(env);
  assert.equal(r3, null, 'con idea en el hueco no genera otra');
  assert.equal(env._ideas.length, 1);
  assert.equal(context.mockCalls(), 2, 'idempotencia: el generador no se llama de nuevo');
  const t3 = env._ticks.get(slot);
  assert.equal(t3.ok, 1, 'el hueco sigue marcado como cubierto');
});

test('registro de error: una excepción de la IA se graba (ok=0) y se recorta a 300', async () => {
  context.resetMock();
  const env = context.makeEnv();
  context.setMock('throw');
  const r = await runCouncilTick(env);
  assert.equal(r, null);
  const t = env._ticks.get(slotStartNow());
  assert.ok(t, 'el tick que revienta deja rastro');
  assert.equal(t.ok, 0);
  assert.ok(t.error.length > 0 && t.error.length <= 300, 'error no vacío y recortado a ≤300');
});

test('el seat grabado en la bitácora es el determinista de la hora actual', async () => {
  context.resetMock();
  const env = context.makeEnv();
  context.setMock('ok');
  await runCouncilTick(env);
  const t = env._ticks.get(slotStartNow());
  assert.equal(t.seat, councilSeatForHour(new Date().getUTCHours()));
});
