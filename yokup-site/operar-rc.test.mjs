// FLT-1019 — el botón «🖥 operar ↗» de /misiones abre admira.live/control?rc=…
// El id de flota va en MINÚSCULAS con un único prefijo «admira-» (admira-macbookaircrema).
// Antes se concatenaba «admira-» + el nombre CANÓNICO, que va en CamelCase, así que
// salía «admira-MacBookAirCrema»: no casaba con NINGÚN equipo del registro.
// (Carlos, 24-jul-2026: «tenemos que probar todos los operar de los MacBookAir».)
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const SRC = await readFile(new URL('./yk-misiones.js', import.meta.url), 'utf8');

// Se evalúa la rcId REAL del fichero: si alguien la cambia, esta prueba lo ve.
const m = SRC.match(/function rcId\(maq\) \{[\s\S]*?\n  \}/);
assert.ok(m, 'existe rcId en yk-misiones.js');
const rcId = eval('(' + m[0].replace('function rcId', 'function') + ')');

test('el id sale en minúsculas y sin separadores', () => {
  assert.equal(rcId('MacBookAirCrema'), 'admira-macbookaircrema');
  assert.equal(rcId('MacBookAirRosa'),  'admira-macbookairrosa');
  assert.equal(rcId('MacBookPro16'),    'admira-macbookpro16');
  assert.equal(rcId('DGX Spark'),       'admira-dgxspark');
  assert.equal(rcId('ASUS Zenbook'),    'admira-asuszenbook');
});

test('un nombre que YA trae el prefijo no lo duplica', () => {
  assert.equal(rcId('admira-macbookaircrema'), 'admira-macbookaircrema');
  assert.equal(rcId('admira-MacBookPro16'),    'admira-macbookpro16');
});

test('sin máquina no se inventa un id', () => {
  assert.equal(rcId(''), '');
  assert.equal(rcId(null), '');
  assert.equal(rcId(undefined), '');
});

test('el enlace usa rcId, no la concatenación a pelo de antes', () => {
  assert.match(SRC, /\?rc=' \+ encodeURIComponent\(rcId\(maq\)\)/, 'el href pasa por rcId');
  assert.ok(!/\?rc=admira-' \+ encodeURIComponent\(maq\)/.test(SRC),
    'ya no se pega «admira-» al nombre canónico en CamelCase');
});

test('rcId se exporta para que /misiones y las pruebas usen la misma', () => {
  assert.match(SRC, /rcId: rcId/, 'expuesta en el módulo');
});
