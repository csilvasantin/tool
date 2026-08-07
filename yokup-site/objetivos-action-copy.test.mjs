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
  assert.match(actions, /"✨ Objetivo nuevo"/);
  assert.match(actions, /dale a «Añadir objetivo» cuando lo tengas/);
  assert.doesNotMatch(actions, /✨ Idea nueva|Añadir idea/);
});

// Los tres selectores dicen QUÉ pedimos, A QUIÉN y EN QUÉ PROYECTO. Pero si ya
// hay un titular escrito, eso es una PETICIÓN: el Consejo se adapta a ella en vez
// de inventar de cero (Carlos, 2026-08-07).
test('un titular escrito viaja como tema y el botón anuncia que lo desarrollará', () => {
  assert.match(source, /function peticionEscrita\(\)/);
  assert.match(source, /if\(!t\) return "";/, 'sin titular no hay petición que respetar');
  assert.match(source, /\.slice\(0,240\)/, 'el worker recorta el tema a 240');
  assert.match(source, /JSON\.stringify\(\{project_id,seat,tag,topic,preview:true\}\)/,
    'los tres selectores siguen viajando, y ahora también la petición');
  assert.match(source, /b\.textContent=hay\?"✨ Desarrollar lo escrito":"✨ Objetivo nuevo"/);
  assert.match(source, /else pintaGenBtn\(\);/, 'escribir cambia lo que el botón promete');
  assert.match(source, /pintaGenBtn\(\);\s*\/\/ en reposo/, 'y al soltar el reloj vuelve al modo que toque');
});

test('el cambio de copy no altera orden ni contrato interno del alta', () => {
  assert.ok(form.indexOf('id="genBtn"') < form.indexOf('id="fBtn"'));
  assert.match(source, /fetch\(WORKER\+"\/ideas\/generate"/);
  assert.match(source, /fetch\(WORKER\+"\/ideas",\{method:"POST"/);
  assert.match(source, /body:JSON\.stringify\(body\)/);
});
