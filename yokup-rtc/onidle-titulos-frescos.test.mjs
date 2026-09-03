import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// El generador de propuestas frescas llevaba mudo desde el 12 de agosto: la consulta de
// titulos ya ofrecidos no tenia limite de tiempo, asi que cada opcion quedaba vetada de
// por vida. yokup quemo 22 ventanas entre el 7 y el 12 de agosto y desde entonces devolvia
// CERO propuestas con doce tickets abiertos delante. De ahi que las ventanas automaticas
// salieran con opciones de hace 540 horas: caian al fichero a mano.
const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');

test('un titulo ofrecido se libera, no se gasta para siempre', () => {
  assert.match(source, /var ONIDLE_TITULO_GASTADO_MS = 7 \* 24 \* 60 \* 60 \* 1000;/);
  const fn = source.slice(source.indexOf('async function canonicalOnIdleProposals'),
                          source.indexOf('__name(canonicalOnIdleProposals'));
  assert.match(fn, /AND created_at >= \? ORDER BY created_at DESC/);
  assert.match(fn, /Date\.now\(\) - ONIDLE_TITULO_GASTADO_MS/);
});

test('el veto dura mas de una ventana: no se repite la de hace un rato', () => {
  // una semana, no una hora: repetir la opcion recien ofrecida seria igual de inutil
  const ms = 7 * 24 * 60 * 60 * 1000;
  assert.ok(ms > 60 * 60 * 1000, 'tiene que cubrir mas de una hora');
  assert.ok(ms < 90 * 24 * 60 * 60 * 1000, 'y no puede ser practicamente para siempre');
});
