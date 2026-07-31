import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('./misiones.html', import.meta.url), 'utf8');

test('la agrupación de flota distingue el agente ejecutor', () => {
  const start = html.indexOf('function agrupaFlota(tks)');
  assert.notEqual(start, -1);
  const block = html.slice(start, html.indexOf('\n}\n', start) + 3);
  assert.match(block, /machineOf\(t\)\+"\|\|"\+norm\(t\.assignee\)/);
});
