import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import { groupingIdentityKey, reportAgentIdentity } from './src/agent-identity.js';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');
const totales = source.slice(source.indexOf('async function highscoreCurrentTotals'),
                             source.indexOf('__name(highscoreCurrentTotals'));

test('Mini y MacMini son la MISMA maquina: misma clave de agrupacion', () => {
  for (const persona of ['Morfeo', 'Link', 'Oraculo', 'Neo']) {
    assert.equal(groupingIdentityKey(`${persona}Mini`, ''), groupingIdentityKey(`${persona}MacMini`, ''),
      `${persona}Mini y ${persona}MacMini tienen que agrupar juntos`);
  }
});

test('personas distintas NO se mezclan aunque compartan maquina', () => {
  assert.notEqual(groupingIdentityKey('MorfeoMacMini', ''), groupingIdentityKey('LinkMacMini', ''));
  assert.notEqual(groupingIdentityKey('OraculoMacMini', ''), groupingIdentityKey('NiobeMacMini', ''));
});

test('maquinas distintas siguen siendo filas distintas (eso lo decide FLT-1490, no esto)', () => {
  assert.notEqual(groupingIdentityKey('NeoMBAAzul', ''), groupingIdentityKey('NeoMBP14', ''));
  assert.notEqual(groupingIdentityKey('SmithMBP14', ''), groupingIdentityKey('SmithMBP16', ''));
});

test('el marcador agrupa por identidad canonica, no por el literal del nombre', () => {
  assert.match(totales, /const key = groupingIdentityKey\(visible, machine\) \|\| keyOf\(visible\)/);
  // y el agent_key que sale al front sigue derivandose del nombre visible
  assert.match(totales, /agent_key: keyOf\(visible\)/);
});

test('Sub e Infra no se funden con el agente principal', () => {
  assert.notEqual(groupingIdentityKey('MorfeoMacMini', ''), groupingIdentityKey('SubMorfeoMacMini', ''));
  assert.notEqual(groupingIdentityKey('MorfeoMacMini', ''), groupingIdentityKey('InfraMorfeoMacMini', ''));
});
