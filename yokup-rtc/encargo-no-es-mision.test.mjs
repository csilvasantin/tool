import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// El numero de un ENCARGO no es el numero de una MISION. El respaldo «encargo N nacio
// como FLT-N» solo valia mientras las numeraciones no se separaran, y ya se separaron:
// FLT-1515 nacio del encargo #1487, y el encargo #1515 no tiene mision. Informar del
// #1515 escribia contra FLT-1515, que es de otro agente; hoy solo lo freno un
// owner_mismatch. Con la mision del mismo agente, habria pasado en silencio.
const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');

function extraer(nombre) {
  const i = source.indexOf(`async function ${nombre}(`);
  assert.ok(i > 0, `falta ${nombre}`);
  return source.slice(i, source.indexOf('\n}\n', i) + 2);
}

// La serie propia de misiones (FLT-2705) empieza en 100001: se inyecta como en el worker.
const resolver = new Function('normalizeMissionReference', 'FLEET_MISSION_SERIES_START', `
  ${extraer('resolveFleetMissionReference')}
  return resolveFleetMissionReference;
`)((v) => (/^#?\d+$/.test(String(v).trim()) ? 'FLT-' + String(v).replace('#', '').trim() : String(v).trim()), 100001);

// D1 de mentira con el reparto REAL que provoco el fallo.
const REPARTO = [{ inbox_id: 1487, mission_id: 'FLT-1515' }];
const env = {
  DB: {
    prepare(sql) {
      return {
        bind(valor) {
          return {
            async first() {
              if (/WHERE inbox_id=\?/.test(sql)) return REPARTO.find((r) => r.inbox_id === valor) || null;
              if (/WHERE mission_id=\?/.test(sql)) return REPARTO.find((r) => r.mission_id === valor) || null;
              return null;
            },
          };
        },
      };
    },
  },
};

test('el reparto real manda: el encargo #1487 resuelve a SU mision', async () => {
  assert.equal(await resolver(env, '1487'), 'FLT-1515');
  assert.equal(await resolver(env, '#1487'), 'FLT-1515');
});

test('un encargo SIN mision no se cuela en la mision de otro encargo', async () => {
  // FLT-1515 nacio del #1487: el #1515 no puede aterrizar ahi.
  assert.equal(await resolver(env, '1515'), '');
});

test('el respaldo historico sigue vivo cuando no pisa a nadie', async () => {
  // FLT-1499 no nacio de ningun encargo: el respaldo de siempre se conserva.
  assert.equal(await resolver(env, '1499'), 'FLT-1499');
});

test('una referencia explicita no la toca nadie', async () => {
  assert.equal(await resolver(env, 'FLT-1520'), 'FLT-1520');
});

test('el cierre dice que el encargo no tiene mision, no que «falta mission»', () => {
  assert.match(source, /code: "encargo_sin_mision"/);
  assert.match(source, /no tiene mision en yokup: no hay donde escribir el informe/);
  // y dice como seguir
  assert.match(source, /alta-mision\.sh si merece mision propia, o cierralo con bot-inbox-ack\.sh/);
});
