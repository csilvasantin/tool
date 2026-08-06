import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./objetivos.html', import.meta.url), 'utf8');

function countLabelApi() {
  const start = source.indexOf('function objectiveCountLabel(total){');
  const end = source.indexOf('\n}', start) + 2;
  assert.ok(start >= 0 && end > start, 'existe el formateador del contador');
  const context = {};
  vm.runInNewContext(source.slice(start, end) + ';this.label=objectiveCountLabel;', context);
  return context.label;
}

test('la cabecera principal contiene el único contador accesible', () => {
  assert.match(source, /<h1>🎯 Objetivos<\/h1>\s*<span class="objective-count" id="objectiveCount" role="status" aria-label="Número total de objetivos" aria-live="polite" aria-atomic="true">0 objetivos<\/span>/);
  assert.equal((source.match(/id="objectiveCount"/g) || []).length, 1);
  assert.doesNotMatch(source, /id="count"/);
  assert.doesNotMatch(source, /Ideas a desarrollar/i);
});

test('pluraliza cero, uno y cualquier total como objetivos, nunca ideas', () => {
  const label = countLabelApi();
  assert.equal(label(0), '0 objetivos');
  assert.equal(label(1), '1 objetivo');
  assert.equal(label(301), '301 objetivos');
  for (const n of [0, 1, 301]) assert.doesNotMatch(label(n), /idea/i);
});

test('render conserva el total cargado del scope y no el subconjunto visible', () => {
  const render = source.slice(source.indexOf('function render(){'), source.indexOf('function refreshBulk'));
  assert.match(render, /const scoped=IDEAS\.filter/);
  assert.match(render, /const list=scoped\.filter/);
  assert.match(render, /\$\("#objectiveCount"\)\.textContent=objectiveCountLabel\(scoped\.length\)/);
  assert.doesNotMatch(render, /objectiveCount[^\n]*list\.length/);
});

test('la carga inicial y los refrescos vuelven a renderizar el contador', () => {
  const load = source.slice(source.indexOf('async function load(){'), source.indexOf('async function loadProjects'));
  assert.match(load, /IDEAS=d\.ideas\|\|\[\]; render\(\)/);
  assert.match(source, /if\(d\.ok\)[\s\S]*toast\("Idea guardada 💡"\); load\(\)/);
  assert.match(source, /IDEAS=IDEAS\.filter\(x=>x\.id!==id\); render\(\)/);
  assert.match(source, /window\.addEventListener\)window\.addEventListener\("yk:project-change"[\s\S]*render\(\)/);
});
