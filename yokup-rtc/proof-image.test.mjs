// FLT-989 b3 — normalizeProofImage no tenía NINGUNA prueba unitaria pese a ser el
// único sitio que decide qué formato de prueba vale (FLT-988 la centralizó ahí).
// Se prueba su COMPORTAMIENTO, no su forma: se extrae la función del fuente y se
// evalúa aislada (sin runtime de Worker, sin tocar el bundle ni añadir exports —
// prod se coteja byte a byte). Cubre lo que antes divergía entre endpoints: URL
// http(s), data:image base64, vacío, ruta local y el corte por tamaño.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');
const m = source.match(/function normalizeProofImage\(raw\) \{[\s\S]*?\n\}\n__name\(normalizeProofImage/);
assert.ok(m, 'no se encontró normalizeProofImage en el fuente');
const body = m[0].replace(/\n__name\(normalizeProofImage$/, '');
const normalizeProofImage = new Function(body + '\nreturn normalizeProofImage;')();

test('una URL http(s) normal se acepta tal cual', () => {
  const r = normalizeProofImage('https://yokup.com/proof/x.png');
  assert.equal(r.value, 'https://yokup.com/proof/x.png');
  assert.equal(r.error, null);
});

test('http (sin s) también vale', () => {
  assert.equal(normalizeProofImage('http://a.b/c.jpg').error, null);
});

test('recorta espacios antes de decidir', () => {
  assert.equal(normalizeProofImage('  https://a.b/c.png  ').value, 'https://a.b/c.png');
});

test('una URL de más de 500 caracteres se rechaza con motivo', () => {
  const url = 'https://a.b/' + 'x'.repeat(600);
  const r = normalizeProofImage(url);
  assert.equal(r.value, null);
  assert.match(r.error, /500 caracteres/);
});

test('un data:image/png;base64 pequeño se acepta entero', () => {
  const data = 'data:image/png;base64,iVBORw0KGgoAAAA';
  const r = normalizeProofImage(data);
  assert.equal(r.value, data);
  assert.equal(r.error, null);
});

test('acepta jpeg/jpg, gif, webp y avif como data:image', () => {
  for (const t of ['jpeg', 'jpg', 'gif', 'webp', 'avif']) {
    assert.equal(normalizeProofImage(`data:image/${t};base64,AAAA`).error, null, t);
  }
});

test('un data:image por encima de 195 KB se rechaza SIN recorte mudo', () => {
  const big = 'data:image/png;base64,' + 'A'.repeat(200001);
  const r = normalizeProofImage(big);
  assert.equal(r.value, null);
  assert.match(r.error, /195 KB/);
});

test('vacío o solo espacios → {value:null, error:"vacía"}', () => {
  assert.deepEqual(normalizeProofImage(''), {value: null, error: 'vacía'});
  assert.deepEqual(normalizeProofImage('   '), {value: null, error: 'vacía'});
  assert.deepEqual(normalizeProofImage(null), {value: null, error: 'vacía'});
  assert.deepEqual(normalizeProofImage(undefined), {value: null, error: 'vacía'});
});

test('una ruta local (/…, C:\\…, file:) se rechaza porque nadie más la ve', () => {
  assert.match(normalizeProofImage('/Users/x/captura.png').error, /ruta local/);
  assert.match(normalizeProofImage('C:\\Users\\x\\a.png').error, /ruta local/);
  assert.match(normalizeProofImage('file:///tmp/a.png').error, /ruta local/);
});

test('texto que no es ni URL ni data:image se rechaza con motivo', () => {
  const r = normalizeProofImage('esto no es una imagen');
  assert.equal(r.value, null);
  assert.match(r.error, /no es una URL http\(s\) ni un data:image/);
});

test('data: de un tipo NO imagen no cuela por la puerta de data:', () => {
  const r = normalizeProofImage('data:text/html;base64,AAAA');
  assert.equal(r.value, null);
});
