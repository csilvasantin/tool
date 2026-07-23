// FLT-1005 — el falso «⚠ apagada» del radar de /misiones.
//
// CAUSA: el router de encargos (admira-telegram) manda la máquina destino como
// «admira-macmini», pero la presencia y los navegadores laten con el nombre
// pelado «MacMini». canonMachine() no normalizaba el prefijo «admira-», así que
// los dos nombres daban canónicos DISTINTOS: la misión salía «apagada» aunque el
// Mac Mini estuviera vivo y trabajando. (Datos REALES de /api/presence el
// 23-jul-2026: NeoMini·MacMini, SmithMini·MacMini, OraculoMini·MacMini.)
//
// El módulo es un script clásico (expone window.YkMisiones); se carga tal cual en
// un vm con un DOM mínimo y se ejercita la función REAL, no una reconstrucción.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const src = await readFile(new URL('./yk-misiones.js', import.meta.url), 'utf8');

function loadModule() {
  const noop = () => {};
  const el = { addEventListener: noop, getElementById: () => null,
    querySelector: () => null, querySelectorAll: () => [], createElement: () => ({}) };
  const ctx = vm.createContext({
    window: {}, document: el, setInterval: () => 0, clearInterval: noop,
    localStorage: { getItem: () => null, setItem: noop }, Date, Math, JSON, RegExp, String
  });
  vm.runInContext(`${src}\nglobalThis.YK = window.YkMisiones;`, ctx);
  return ctx.YK;
}
const YK = loadModule();

// ── canonMachine: el prefijo «admira-» ya no rompe el canónico ────────────────
test('admira-macmini y MacMini colapsan al MISMO canónico', () => {
  assert.equal(YK.canonMachine('admiramacmini'), 'MacMini');   // como llega en el ticket (sin guion)
  assert.equal(YK.canonMachine('admira-macmini'), 'MacMini');  // como lo escribe el router
  assert.equal(YK.canonMachine('MacMini'), 'MacMini');         // como late la presencia
  assert.equal(YK.canonMachine('admiramacmini'), YK.canonMachine('MacMini'));
});

test('la normalización del prefijo es GENÉRICA, no una tabla a dedo', () => {
  // Cualquier ComputerName conocido prefijado con «admira-» resuelve igual.
  assert.equal(YK.canonMachine('admira-macbookpro14'), 'MacBookPro14');
  assert.equal(YK.canonMachine('admira-macbookairazul'), 'MacBookAirAzul');
  // y respeta los ALIAS existentes bajo el prefijo (macbookair16 → MacBookAir16plata).
  assert.equal(YK.canonMachine('admira-macbookair16'), 'MacBookAir16plata');
});

test('no rompe lo que ya funcionaba: nombres normales y desconocidos', () => {
  assert.equal(YK.canonMachine('MacBookAirRosa'), 'MacBookAirRosa');
  assert.equal(YK.canonMachine('DGX Spark'), 'DGX Spark');
  assert.equal(YK.canonMachine(''), '');
  // «admira» a secas o un prefijo hacia un nombre no censado NO inventa canónico.
  assert.equal(YK.canonMachine('admira'), 'admira');
  assert.equal(YK.canonMachine('admira-loquesea'), 'admira-loquesea');
});

// ── machineOf: la misión FLT-1005 casa con la máquina viva ────────────────────
test('machineOf(FLT-1005) == machineOf(presencia MacMini)', () => {
  const flt1005 = { id: 'FLT-1005', machine: 'admiramacmini', loc: 'admiramacmini',
    screen: 'NeoMini·admiramacmini #991', assignee: 'NeoMini', status: 'open' };
  assert.equal(YK.machineOf(flt1005), 'MacMini');
  assert.equal(YK.machineOf(flt1005), YK.canonMachine('MacMini'));
});

// ── machOffOf: la decisión REAL de «apagada» ya no se dispara ─────────────────
test('con el Mac Mini VIVO, FLT-1005 ya NO se marca «apagada»', () => {
  // Set de vivas tal como lo arma /misiones desde la presencia real (canon).
  const vivas = new Set(['MacBookAirRosa', 'MacMini', 'MacBookAirAzul'].map(YK.canonMachine));
  YK.setLiveMachines(vivas);
  const flt1005 = { id: 'FLT-1005', machine: 'admiramacmini', loc: 'admiramacmini',
    created_at: Date.now(), status: 'open' };
  // surface=null (pendiente, sin plataforma confirmada): antes del fix daba «apagada».
  assert.equal(YK.machOffOf(flt1005, null), null, 'la máquina está viva → no hay aviso');
});

test('una máquina de verdad apagada SÍ se sigue detectando (no se anula el aviso)', () => {
  YK.setLiveMachines(new Set(['MacMini'].map(YK.canonMachine)));
  const enApagada = { id: 'FLT-9', machine: 'MacBookAirRosa', created_at: Date.now(), status: 'open' };
  const off = YK.machOffOf(enApagada, null);
  assert.ok(off && off.machine === 'MacBookAirRosa', 'la que NO está viva sigue avisando');
});

test('sin datos de vivas no se alarma (mejor «pendiente» que un falso «apagada»)', () => {
  YK.setLiveMachines(null);
  const t = { id: 'FLT-1', machine: 'admiramacmini', created_at: Date.now(), status: 'open' };
  assert.equal(YK.machOffOf(t, null), null);
  YK.setLiveMachines(new Set());
  assert.equal(YK.machOffOf(t, null), null);
});

// ── b1 · el botón «+ misión» en la ficha (contrato de texto) ──────────────────
const front = await readFile(new URL('./misiones.html', import.meta.url), 'utf8');
test('la ficha ofrece «+ misión» (nivel 0) y «+ submisión» (nivel 1), nunca un 3er nivel', () => {
  assert.match(src, /class="mdet-addchild" data-add-child=/);
  // El botón lo decide addChildBtn por NIVEL: madre/plana → «+ misión»; hija → «+ submisión».
  const btn = src.match(/function addChildBtn\(id, t\) \{[\s\S]*?\n  \}/)?.[0] || '';
  assert.ok(btn, 'no se encontró addChildBtn');
  assert.match(btn, /if \(!t\.parent_id\)/);                       // nivel 0 → + misión
  assert.match(btn, /data-child-kind="mision"[^]*?\+ misión/);
  assert.match(btn, /padre && !padre\.parent_id/);                 // nivel 1 (padre raíz) → + submisión
  assert.match(btn, /data-child-kind="submision"[^]*?\+ submisión/);
  assert.match(btn, /return "";\s*\/\/ nivel 2 o incierto/);       // nivel 2 → sin botón (no 3er nivel)
});
test('la página cablea el alta de la hija (bot-inbox → fleet\\/sync → fleet\\/parent)', () => {
  assert.match(front, /\.mdet-addchild/);
  assert.match(front, /TG\+"\/api\/bot-inbox"/);
  assert.match(front, /WORKER\+"\/fleet\/sync"/);
  assert.match(front, /WORKER\+"\/fleet\/parent"/);
  assert.match(front, /OPEN_GRP\.add\(madre\)/);   // la hija aparece replegada bajo su madre
});
