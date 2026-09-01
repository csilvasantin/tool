import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// src/index.js se mantiene a mano y no exporta sus internos, asi que el contrato
// de este estado se fija sobre el texto, como en standalone-close-contract.
const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');
const reconcile = source.slice(source.indexOf('async function fleetReconcileMission'),
                               source.indexOf('__name(fleetReconcileMission'));
const taskStatus = source.slice(source.indexOf('if (url.pathname === "/fleet/task-status"'),
                                source.indexOf('if (url.pathname === "/fleet/plan"'));
const tercios = source.slice(source.indexOf('function tercios(tasks, standalone)'),
                             source.indexOf('__name(tercios'));

test('existe el cuarto estado y va aparte de los tres de siempre', () => {
  assert.match(source, /var TASK_STATUS = \["pending", "in_progress", "done", "no_aplica"\];/);
  assert.match(source, /var TASK_NO_APLICA = "no_aplica";/);
  assert.match(source, /function tareaConcluida\(t\)/);
});

test('descartar un paso EXIGE motivo, y con codigo propio', () => {
  assert.match(taskStatus, /b\.status === "done" \|\| b\.status === TASK_NO_APLICA/);
  assert.match(taskStatus, /motivo_required/);
  assert.match(taskStatus, /no se puede descartar un paso sin motivo/);
});

test('el cierre acepta concluidas pero exige al menos una HECHA de verdad', () => {
  assert.match(reconcile, /tasks\.every\(tareaConcluida\) && tasks\.some\(\(x\) => x\.status === "done"\)/);
});

test('un descarte NO cuenta como hecho en el contador de tercios', () => {
  // `hecho` sigue mirando solo 'done'; los descartes tienen su propia cuenta.
  assert.match(tercios, /const hecho = \(a\) => a\.filter\(\(t\) => t\.status === "done"\)\.length;/);
  assert.match(tercios, /const nada = \(a\) => a\.filter\(\(t\) => t\.status === TASK_NO_APLICA\)\.length;/);
  assert.match(tercios, /na: nada\(top\), sna: nada\(sub\)/);
  // y jamas se suman: 'done:' nunca incluye nada(...)
  assert.doesNotMatch(tercios, /done: hecho\(\w+\) \+ nada/);
});

test('el informe final no puede pisar un paso declarado no aplicable', () => {
  const guardas = source.match(/code!='z1' AND status!='done' AND status!='no_aplica'/g) || [];
  assert.equal(guardas.length, 2, 'las dos rutas de cierre deben proteger el descarte');
});

test('la tarea madre asciende con hijas concluidas, no solo hechas', () => {
  assert.match(source, /h\.status!='done' AND h\.status!='no_aplica'/);
});

test('el cierre DECLARA cuantos pasos no aplicaban', () => {
  assert.match(reconcile, /no_aplican: noAplican/);
  assert.match(reconcile, /NO APLICABAN \(no cuentan como hechos\)/);
});

test('un descarte no puntua: el marcador sigue cruzando solo done', () => {
  assert.match(source, /m\.status='done' /);
  assert.doesNotMatch(source, /m\.status IN \('done','no_aplica'\)/);
});

test('setTaskStatus, escritor comun, tambien exige motivo al descartar', () => {
  const set = source.slice(source.indexOf('async function setTaskStatus'),
                           source.indexOf('__name(setTaskStatus'));
  assert.match(set, /\(st === "done" \|\| st === TASK_NO_APLICA\) && !String\(rp \|\| ""\)\.trim\(\)/);
  assert.match(set, /motivo_required/);
});
