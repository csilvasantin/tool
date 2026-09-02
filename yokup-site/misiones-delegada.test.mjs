import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Carlos, 2-sep-2026: «que esas peticiones queden reflejadas como misiones delegadas,
// algo como por Telegram me ha pedido Morfeo que haga esto». El dato estaba (columna
// role del ticket) pero no se enseñaba: en el tablero una mision delegada era
// indistinguible de una que el agente se puso solo.
const fuente = await readFile(new URL('./yk-misiones.js', import.meta.url), 'utf8');

const delegacionHtml = new Function('esc', `
  var ROLES_ESTRUCTURALES = ["mission", "standalone-task", ""];
  ${fuente.slice(fuente.indexOf('  function delegacionHtml('), fuente.indexOf('\n  }\n', fuente.indexOf('  function delegacionHtml(')) + 4)}
  return delegacionHtml;
`)((v) => String(v));

test('una mision pedida por otro agente lo dice, y por que canal', () => {
  const html = delegacionHtml({ role: 'MorfeoMacMini', assignee: 'Neo', source: 'fleet' });
  assert.match(html, /delegada por MorfeoMacMini/);
  assert.match(html, /Telegram/);
});

test('lo que entra por la web se firma con su canal, no con Telegram', () => {
  const html = delegacionHtml({ role: 'status-web · grok-tui', assignee: 'SmithMBP16' });
  assert.match(html, /yokup\.com/);
  assert.doesNotMatch(html, /Telegram/);
});

test('pedirtela tu no es delegar: no se pinta', () => {
  assert.equal(delegacionHtml({ role: 'MorfeoMacMini', assignee: 'MorfeoMacMini' }), '');
  // ni con apellido de equipo por medio: es el mismo agente
  assert.equal(delegacionHtml({ role: 'Morfeo', assignee: 'MorfeoMacMini' }), '');
  assert.equal(delegacionHtml({ role: 'MorfeoMacMini', assignee: 'Morfeo' }), '');
});

test('los roles estructurales no son nombres de nadie', () => {
  for (const role of ['mission', 'standalone-task', '', undefined])
    assert.equal(delegacionHtml({ role, assignee: 'Neo' }), '', String(role));
});

test('se pinta dentro de la linea meta de la mision', () => {
  assert.match(fuente, /var metaHtml = subjectMetaHtml \+ attachmentHtml \+ delegacionHtml\(t\);/);
});
