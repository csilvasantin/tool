// «Pendiente» vs «En curso» según el RASTRO REAL del plan (fix 23-jul-2026, SubNeoMini).
//
// Bug: un agente CLI (Claude Code) ejecuta sin emitir el «claim» (bot-inbox-claim)
// que sube la misión a in_progress. FLT-1005, con tareas a·b DONE y subtareas con
// informe, seguía marcada «Pendiente» — absurdo. Fix (SOLO front): estadoDe() lee
// «En curso» también del rastro real (t._tasks in_progress/done, o el resumen en
// tercios t._prog con hechas>0), como OR con el claim existente. Null-safe: una
// misión sin plan (sin _tasks ni _prog) NO peta y conserva «Pendiente»/«Sin asignar».
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./yk-misiones.js', import.meta.url), 'utf8');

// Contexto mínimo: el IIFE toca window.fetch (en try/catch → tolera ausencia),
// localStorage (try/catch) y document.addEventListener al cargar. Le damos stubs
// inertes y recogemos el export window.YkMisiones.
function loadModule() {
  const windowObj = {};
  const documentObj = {addEventListener() {}, querySelector: () => null};
  const ctx = vm.createContext({
    window: windowObj, document: documentObj,
    localStorage: {getItem: () => null, setItem() {}, removeItem() {}},
    Date, Math, JSON, Promise, RegExp, Object, Array, String, Number, Boolean,
    setTimeout, clearTimeout, console
  });
  vm.runInContext(source, ctx);
  return windowObj.YkMisiones;
}

const Yk = loadModule();
const estL = t => Yk.estadoDe(t).l;

// ── El caso FLT-1005: misión asignada, status crudo aún «open» (sin claim CLI),
//    pero con tareas a·b DONE en el array del plan → NUNCA «Pendiente». ──
test('misión con tareas done (rastro CLI, sin claim) ⇒ «En curso», no «Pendiente»', () => {
  const flt1005 = {
    id: 'FLT-1005', status: 'open', assignee: 'Neo', machine: 'MacMini',
    _tasks: [
      {code: 'a', status: 'done'},
      {code: 'b', status: 'done'},
      {code: 'c', status: 'pending'},
      {code: 'a1', status: 'done'}
    ]
  };
  assert.equal(estL(flt1005), 'En curso');
});

test('misión con UNA subtarea in_progress (sin ninguna done) ⇒ «En curso»', () => {
  const t = {id: 'FLT-x', status: 'open', assignee: 'Neo',
    _tasks: [{code: 'a', status: 'pending'}, {code: 'a1', status: 'in_progress'}]};
  assert.equal(estL(t), 'En curso');
});

// ── «Pendiente» sobrevive SOLO con cero rastro de trabajo. ──
test('misión asignada con plan intacto (todo pending) ⇒ sigue «Pendiente»', () => {
  const t = {id: 'FLT-y', status: 'open', assignee: 'Neo', machine: 'MacMini',
    _tasks: [{code: 'a', status: 'pending'}, {code: 'b', status: 'pending'}]};
  assert.equal(estL(t), 'Pendiente');
});

test('misión asignada SIN array de tareas (plan aún no cargado) ⇒ «Pendiente», sin petar', () => {
  const t = {id: 'FLT-z', status: 'open', assignee: 'Neo', machine: 'MacMini'};
  assert.doesNotThrow(() => estL(t));
  assert.equal(estL(t), 'Pendiente');
});

test('misión sin agente ni tareas ⇒ «Sin asignar» (el fix no la toca)', () => {
  assert.equal(estL({id: 'FLT-0', status: 'open'}), 'Sin asignar');
});

// ── Null-safe con formas raras del payload. ──
test('null-safe: _tasks vacío, _tasks=null y _prog=null no petan', () => {
  assert.doesNotThrow(() => estL({id: 'A', status: 'open', assignee: 'Neo', _tasks: []}));
  assert.equal(estL({id: 'A', status: 'open', assignee: 'Neo', _tasks: []}), 'Pendiente');
  assert.doesNotThrow(() => estL({id: 'B', status: 'open', assignee: 'Neo', _tasks: null, _prog: null}));
  assert.equal(estL({id: 'B', status: 'open', assignee: 'Neo', _tasks: null, _prog: null}), 'Pendiente');
});

// ── Vía resumen en tercios (t._prog) cuando NO viaja el array crudo: si el resumen
//    ya cuenta hechas (done/sdone/extraDone), es «En curso». ──
test('sin _tasks pero _prog con hechas>0 (resumen en tercios) ⇒ «En curso»', () => {
  assert.equal(estL({id: 'C', status: 'open', assignee: 'Neo', _prog: {done: 1, sdone: 0, total: 3, stotal: 9}}), 'En curso');
  assert.equal(estL({id: 'D', status: 'open', assignee: 'Neo', _prog: {done: 0, sdone: 2, total: 3, stotal: 9}}), 'En curso');
  assert.equal(estL({id: 'E', status: 'open', assignee: 'Neo', _prog: {done: 0, sdone: 0, extraDone: 1}}), 'En curso');
});

test('_prog con cero hechas (plan definido pero nada tocado) ⇒ «Pendiente»', () => {
  assert.equal(estL({id: 'F', status: 'open', assignee: 'Neo', _prog: {done: 0, sdone: 0, total: 3, stotal: 9}}), 'Pendiente');
});

// ── Los estados terminales/explícitos mandan sobre el rastro (no se degradan). ──
test('status explícito manda: resolved/in_progress/cancelled no los pisa el rastro', () => {
  assert.equal(estL({status: 'resolved', assignee: 'Neo', _tasks: [{status: 'pending'}]}), 'Finalizada');
  assert.equal(estL({status: 'in_progress', assignee: 'Neo'}), 'En curso');
  assert.equal(estL({status: 'cancelled', assignee: 'Neo', _tasks: [{status: 'done'}]}), 'Cancelada');
});
