import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const board = await readFile(new URL('./misiones.html', import.meta.url), 'utf8');
const header = await readFile(new URL('./yk-cabezal.js', import.meta.url), 'utf8');

test('el tablero sustituye Sin asignar por Eliminadas a la derecha de Finalizadas', () => {
  assert.doesNotMatch(board, /data-f="sin"/);
  assert.doesNotMatch(header, /data-f="sin"/);
  assert.doesNotMatch(header, /id="kSin"/);

  const finalizadas = header.indexOf('data-f="resolved"');
  const eliminadas = header.indexOf('data-f="cancelled"');
  const fecha = header.indexOf('id="selDia"');
  assert.ok(finalizadas >= 0 && eliminadas > finalizadas && fecha > eliminadas);
  assert.match(header, /id="kDel">—<\/b> eliminadas/);
});

test('la acción manual elimina de forma recuperable, sin borrado definitivo', () => {
  assert.match(board, /<option value="cancelled">🗑 Eliminada<\/option>/);
  assert.match(board, /<option value="open">↺ Reabrir<\/option>/);
  assert.doesNotMatch(board, /<option value="delete">/);
  assert.doesNotMatch(board, /\/tickets\/delete/);
  assert.match(board, /status,author:"Misiones \(bloque\)"/);
});

test('contador, filtro y agrupación conservan el estado Eliminada', () => {
  assert.match(board, /nDel=Number\(vc\.cancelled\)\|\|0/);
  assert.match(board, /\$\("kDel"\)\.textContent=nDel/);
  assert.match(board, /cancelled===n \? "cancelled"/);
  assert.match(board, /data-f="cancelled"/);
  assert.match(board, /FILTER!=="todas"\) base=base\.filter/);
  assert.doesNotMatch(board, /nDel>0\?"cancelled"/,
    'Eliminadas sigue accesible, pero ya no desplaza En curso/Finalizadas en la apertura');
});
