import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import { parseAgentIdentity, identityKey, canonicalMachineSuffix, machineSuffix } from './src/agent-identity.js';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');
const trozo = (a, b) => source.slice(source.indexOf(a), source.indexOf(b));
const clave = new Function('parseAgentIdentity', 'identityKey', 'canonicalMachineSuffix', 'machineSuffix',
  'const highscoreVisibleKey=(a)=>String(a||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"");'
  + '\nconst __name=()=>{};\n'
  + trozo('function highscoreGroupKey', '__name(highscoreGroupKey')
  + '\nreturn highscoreGroupKey;')(parseAgentIdentity, identityKey, canonicalMachineSuffix, machineSuffix);

// Familia física: aliases del mismo equipo convergen; otra máquina conserva
// su propia puntuación. No se reasigna la historia al último proceso observado.
test('mismo equipo alias converge y máquinas distintas permanecen separadas', () => {
  assert.equal(clave('MorfeoMacMini',''),clave('MorfeoMini',''));
  assert.equal(clave('Morfeo','admira-macmini'),clave('MorfeoMacMini',''));
  assert.notEqual(clave('MorfeoMacMini',''),clave('MorfeoMBA16',''));
  assert.notEqual(clave('TrinityMacMini',''),clave('TrinityMBP14',''));
  assert.notEqual(clave('Morfeo',''),clave('MorfeoMacMini',''));
});

test('personas distintas NO se funden, compartan o no maquina', () => {
  assert.notEqual(clave('MorfeoMacMini', ''), clave('LinkMacMini', ''));
  assert.notEqual(clave('OraculoMacMini', ''), clave('NiobeMacMini', ''));
  assert.notEqual(clave('SmithMBP14', ''), clave('TrinityMBP14', ''));
});

test('el ROL no es la maquina: Sub e Infra siguen siendo ejecutores distintos', () => {
  assert.notEqual(clave('MorfeoMacMini', ''), clave('SubMorfeoMacMini', ''));
  assert.notEqual(clave('MorfeoMacMini', ''), clave('InfraMorfeoMacMini', ''));
  // Otro equipo también separa al ejecutor.
  assert.notEqual(clave('SubMorfeoMacMini', ''), clave('SubMorfeoMBA16', ''));
});

test('el criterio esta definido UNA vez y lo usan las tres fuentes de puntos', () => {
  assert.equal((source.match(/function highscoreGroupKey/g) || []).length, 1);
  for (const fn of ['highscorePeriodMetrics', 'highscoreCurrentTotals', 'highscoreHourlyContract']) {
    const cuerpo = trozo(`function ${fn}`, `__name(${fn}`);
    assert.match(cuerpo, /highscoreGroupKey\(/, `${fn} tiene que agrupar por el criterio comun`);
  }
});

test('la máquina es parte de identidad y nunca migra al último equipo', () => {
  const totales = trozo('async function highscoreCurrentTotals', '__name(highscoreCurrentTotals');
  assert.match(totales, /machine:canonicalMachineSuffix/);
  assert.match(totales, /agent_key:key/);
  assert.doesNotMatch(totales, /fila\.machine =/);
});
