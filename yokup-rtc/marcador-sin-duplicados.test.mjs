import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import { parseAgentIdentity, identityKey } from './src/agent-identity.js';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');
const trozo = (a, b) => source.slice(source.indexOf(a), source.indexOf(b));
const clave = new Function('parseAgentIdentity', 'identityKey',
  'const highscoreVisibleKey=(a)=>String(a||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"");'
  + '\nconst __name=()=>{};\n'
  + trozo('function highscoreGroupKey', '__name(highscoreGroupKey')
  + '\nreturn highscoreGroupKey;')(parseAgentIdentity, identityKey);

// MODELO (Carlos, 1-sep-2026): «una cosa son los agentes y otra las máquinas físicas;
// un agente puede correr en distintas máquinas, pero una máquina siempre será esa
// máquina». Es lo que yokup.com/dashboard enseña en tres listas y lo que
// /fleet/equipo ya devuelve. El marcador tiene que contar AGENTES, no parejas
// agente+equipo.

test('el mismo agente en distintas maquinas es UNA fila', () => {
  const morfeo = ['MorfeoMacMini', 'MorfeoMBA16', 'MorfeoMini', 'Morfeo'].map((a) => clave(a, ''));
  assert.equal(new Set(morfeo).size, 1, 'Morfeo es Morfeo corra donde corra');
  assert.equal(new Set(['NeoMBAAzul', 'NeoMBP14', 'NeoMini'].map((a) => clave(a, ''))).size, 1);
  assert.equal(new Set(['TrinityMBA16', 'TrinityMBP14'].map((a) => clave(a, ''))).size, 1);
});

test('personas distintas NO se funden, compartan o no maquina', () => {
  assert.notEqual(clave('MorfeoMacMini', ''), clave('LinkMacMini', ''));
  assert.notEqual(clave('OraculoMacMini', ''), clave('NiobeMacMini', ''));
  assert.notEqual(clave('SmithMBP14', ''), clave('TrinityMBP14', ''));
});

test('el ROL no es la maquina: Sub e Infra siguen siendo ejecutores distintos', () => {
  assert.notEqual(clave('MorfeoMacMini', ''), clave('SubMorfeoMacMini', ''));
  assert.notEqual(clave('MorfeoMacMini', ''), clave('InfraMorfeoMacMini', ''));
  // …pero un Sub tampoco se parte por cambiar de equipo
  assert.equal(clave('SubMorfeoMacMini', ''), clave('SubMorfeoMBA16', ''));
});

test('el criterio esta definido UNA vez y lo usan las tres fuentes de puntos', () => {
  assert.equal((source.match(/function highscoreGroupKey/g) || []).length, 1);
  for (const fn of ['highscorePeriodMetrics', 'highscoreCurrentTotals', 'highscoreHourlyContract']) {
    const cuerpo = trozo(`function ${fn}`, `__name(${fn}`);
    assert.match(cuerpo, /highscoreGroupKey\(/, `${fn} tiene que agrupar por el criterio comun`);
  }
});

test('la maquina sigue viajando en la fila, como atributo', () => {
  const totales = trozo('async function highscoreCurrentTotals', '__name(highscoreCurrentTotals');
  assert.match(totales, /machine: String\(machine \|\| ""\)/);
  assert.match(totales, /fila\.machine = String\(machine\)\.trim\(\)/);
});
