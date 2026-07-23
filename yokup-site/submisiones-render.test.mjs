// FLT-990 c — Render de SUBMISIONES a 2 niveles (madre → misión → submisión).
// Prueba la función groupedHtml de misiones.html EXTRAÍDA del fuente vivo, con un
// YkMisiones.rowHtml de juguete, para verificar el anidado de segundo nivel, los
// rótulos (hija/submisión) y el tope defensivo de profundidad 2. Cubre además el
// botón addChildBtn de yk-misiones.js por su contrato de niveles.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('./misiones.html', import.meta.url), 'utf8');
const jsSrc = await readFile(new URL('./yk-misiones.js', import.meta.url), 'utf8');

// ── groupedHtml extraída del fuente vivo ────────────────────────────────────
const gm = html.match(/function groupedHtml\(list\)\{[\s\S]*?\n\}/);
assert.ok(gm, 'no se encontró groupedHtml en misiones.html');
function makeGrouped(openSet) {
  const OPEN_GRP = openSet || new Set();
  const esc = (s) => String(s == null ? '' : s);
  const YkMisiones = { rowHtml: (t) => '<div class="tk" data-id="' + t.id + '">' + t.id + '</div>' };
  return new Function('YkMisiones', 'esc', 'OPEN_GRP', gm[0] + '\nreturn groupedHtml;')(YkMisiones, esc, OPEN_GRP);
}
const groupedHtml = makeGrouped();

test('render: lista plana (sin parent_id) sale sin grupos', () => {
  const out = groupedHtml([{ id: 'FLT-1' }, { id: 'FLT-2' }]);
  assert.ok(!/yk-grp/.test(out), 'no debe haber cajones de grupo');
  assert.ok(out.includes('data-id="FLT-1"') && out.includes('data-id="FLT-2"'));
});

test('render: madre con hijas → 1 cajón, rótulo «hija(s)»', () => {
  const list = [{ id: 'FLT-10' }, { id: 'FLT-11', parent_id: 'FLT-10' }, { id: 'FLT-12', parent_id: 'FLT-10' }];
  const out = groupedHtml(list);
  assert.match(out, /class="yk-grp yk-grp-l0/);
  assert.match(out, /<b>2<\/b> hijas/);
  assert.match(out, /data-kids="FLT-10"/);
  // las hijas NO se pintan sueltas al primer nivel: van dentro del cajón
  assert.equal((out.match(/yk-grp yk-grp-l0/g) || []).length, 1);
});

test('render: SEGUNDO NIVEL — la hija con submisiones anida su propio cajón', () => {
  const list = [
    { id: 'FLT-10' },                                 // madre raíz
    { id: 'FLT-11', parent_id: 'FLT-10' },            // hija (nivel 1)
    { id: 'FLT-12', parent_id: 'FLT-11' },            // submisión (nivel 2)
  ];
  const out = groupedHtml(list);
  assert.match(out, /yk-grp-l0/, 'cajón de la madre');
  assert.match(out, /yk-grp-l1/, 'cajón anidado de la hija');
  assert.match(out, /<b>1<\/b> hija\b/, 'rótulo de nivel 0 en singular');
  assert.match(out, /<b>1<\/b> submisión/, 'rótulo de nivel 1 = submisión');
  // el cajón de la hija (l1) va DENTRO de las kids de la madre
  assert.ok(out.indexOf('data-kids="FLT-10"') < out.indexOf('yk-grp-l1'));
});

test('render: TOPE de profundidad 2 — una nieta jamás abre un 3er cajón', () => {
  // Aunque los datos trajeran un 3er nivel (no debería, el worker lo impide), el
  // render no lo anida: la submisión se pinta como fila, sin cajón l2.
  const list = [
    { id: 'FLT-10' },
    { id: 'FLT-11', parent_id: 'FLT-10' },
    { id: 'FLT-12', parent_id: 'FLT-11' },
    { id: 'FLT-13', parent_id: 'FLT-12' },            // 3er nivel colado
  ];
  const out = groupedHtml(list);
  assert.ok(!/yk-grp-l2/.test(out), 'no debe existir un cajón de nivel 2');
  assert.ok(out.includes('data-id="FLT-13"'), 'la nieta sí se pinta, como fila');
});

// ── addChildBtn: contrato de niveles (nivel 0 → misión, 1 → submisión, 2 → nada) ─
function loadYk() {
  const windowObj = {};
  const ctx = vm.createContext({
    window: windowObj, document: { addEventListener() {}, querySelector: () => null },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    Date, Math, JSON, Promise, RegExp, Object, Array, String, Number, Boolean,
    setTimeout, clearTimeout, console
  });
  vm.runInContext(jsSrc, ctx);
  return windowObj.YkMisiones;
}
const Yk = loadYk();

test('addChildBtn: nivel 0 (madre/plana) ofrece «+ misión»', () => {
  const b = Yk.addChildBtn('FLT-100', { id: 'FLT-100' });
  assert.match(b, /\+ misión/);
  assert.match(b, /data-child-kind="mision"/);
});

test('addChildBtn: nivel 1 (hija, padre raíz cacheado) ofrece «+ submisión»', () => {
  // Primar la caché: rowHtml cachea cada fila. La madre FLT-100 sin parent_id.
  Yk.rowHtml({ id: 'FLT-100', subject: 'madre', status: 'open', assignee: 'Neo', source: 'fleet' });
  const b = Yk.addChildBtn('FLT-101', { id: 'FLT-101', parent_id: 'FLT-100' });
  assert.match(b, /\+ submisión/);
  assert.match(b, /data-child-kind="submision"/);
});

test('addChildBtn: nivel 2 (submisión, padre es a su vez hija) NO ofrece nada', () => {
  Yk.rowHtml({ id: 'FLT-100', subject: 'madre', status: 'open', assignee: 'Neo', source: 'fleet' });
  Yk.rowHtml({ id: 'FLT-101', subject: 'hija', status: 'open', assignee: 'Neo', source: 'fleet', parent_id: 'FLT-100' });
  const b = Yk.addChildBtn('FLT-102', { id: 'FLT-102', parent_id: 'FLT-101' });
  assert.equal(b, '', 'una submisión no debe ofrecer un 3er nivel');
});

test('addChildBtn: no aplica a misiones que no son de flota', () => {
  assert.equal(Yk.addChildBtn('123', { id: '123' }), '');
});
