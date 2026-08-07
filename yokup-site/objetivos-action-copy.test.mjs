import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./objetivos.html', import.meta.url), 'utf8');
const form = source.match(/<form class="add"[\s\S]*?<\/form>/)?.[0] || '';
const actions = source.slice(source.indexOf('const AUTO_MS='), source.indexOf('async function generate'));

test('objetivos presenta las dos acciones con lenguaje de objetivo', () => {
  assert.match(form, /id="genBtn"[^>]*>✨ Objetivo nuevo<\/button>/);
  assert.match(form, /id="fBtn">Añadir objetivo<\/button>/);
  assert.doesNotMatch(form, />\s*✨ Idea nueva<|>Añadir idea</);
});

test('el copy dinámico y el mensaje accesible conservan el lenguaje de objetivo', () => {
  assert.match(actions, /genLabel\("✨ Objetivo nuevo"\)/);
  assert.match(actions, /dale a «Añadir objetivo» cuando lo tengas/);
  assert.doesNotMatch(actions, /✨ Idea nueva|Añadir idea/);
});

test('el cambio de copy no altera orden ni contrato interno del alta', () => {
  assert.ok(form.indexOf('id="genBtn"') < form.indexOf('id="fBtn"'));
  assert.match(source, /fetch\(WORKER\+"\/ideas\/generate"/);
  assert.match(source, /fetch\(WORKER\+"\/ideas",\{method:"POST"/);
  assert.match(source, /body:JSON\.stringify\(body\)/);
});
