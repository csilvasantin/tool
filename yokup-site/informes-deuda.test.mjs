// FLT-1018 (front) — el menú pinta INFORMES como COBERTURA, no como «curso/pend», y
// /informes nombra arriba las misiones terminadas SIN parte: una misión cerrada sin
// informe no tiene nada que pintar en la sábana, así que se quedaba invisible justo
// la que hay que perseguir. (Carlos, 24-jul-2026.)
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const FRAME = await readFile(new URL('./yk-frame.js', import.meta.url), 'utf8');
const CSS   = await readFile(new URL('./yk-frame.css', import.meta.url), 'utf8');
const INF   = await readFile(new URL('./informes.html', import.meta.url), 'utf8');
const WORKER_SRC = await readFile(new URL('../yokup-rtc/src/index.js', import.meta.url), 'utf8');

test('paintCounters trata INFORMES aparte del resto', () => {
  const i = FRAME.indexOf('function paintCounters(');
  const b = FRAME.slice(i, FRAME.indexOf('function paintDecisiones(', i));
  assert.match(b, /k === "informes"/, 'hay rama propia para informes');
  assert.match(b, /d\.hechos \| 0, total = d\.total \| 0/, 'lee hechos y total');
  assert.ok(b.indexOf('k === "informes"') < b.indexOf('var curso = d.curso'),
    'la rama de informes se resuelve ANTES de caer en curso/pend');
});

test('sin misiones terminadas, INFORMES queda limpio (no «0/0»)', () => {
  const i = FRAME.indexOf('function paintCounters(');
  const b = FRAME.slice(i, FRAME.indexOf('function paintDecisiones(', i));
  assert.match(b, /if \(!total\) \{ s\.textContent = ""/, 'total 0 → rótulo limpio');
});

test('la deuda se marca visualmente y se explica en el title', () => {
  const i = FRAME.indexOf('function paintCounters(');
  const b = FRAME.slice(i, FRAME.indexOf('function paintDecisiones(', i));
  assert.match(b, /faltan = total - hechos/, 'calcula la deuda');
  assert.match(b, /yk-count-debe", faltan > 0/, 'marca la clase sólo si falta alguno');
  assert.match(b, /faltan " \+ faltan/, 'el title dice cuántos faltan');
  assert.match(CSS, /\.yk-nav-c\.yk-count-debe\{/, 'la clase existe en el CSS');
});

test('/informes lista las misiones terminadas sin parte', () => {
  assert.match(INF, /id="debe" hidden/, 'la banda nace oculta');
  assert.match(INF, /async function loadDebe\(\)/, 'hay carga propia de la deuda');
  assert.match(INF, /\/fleet\/informes-deuda/, 'usa el endpoint propio, no la lista capada a 120');
  assert.match(INF, /\/ticket\?id='\+encodeURIComponent\(m\.id\)/, 'cada fila abre su misión');
});

test('el endpoint de deuda no está capado ni ordena por abiertas', () => {
  const RTC = WORKER_SRC;
  const i = RTC.indexOf('/fleet/informes-deuda');
  const b = RTC.slice(i, i + 900);
  assert.match(b, /t\.status='resolved'/, 'sólo terminadas');
  assert.match(b, /NOT EXISTS \(/, 'sin un solo parte');
  assert.ok(!/LIMIT/.test(b), 'sin tope: la deuda vieja también cuenta');
});

test('la deuda NO se filtra por fecha: una deuda vieja sigue siendo deuda', () => {
  const i = INF.indexOf('async function loadDebe()');
  const b = INF.slice(i, i + 1400);
  assert.ok(!/inRange\(/.test(b), 'loadDebe no aplica el filtro de fecha');
  assert.match(INF, /loadDebe\(\); setInterval\(loadDebe/, 'se refresca por su cuenta');
});

test('sin deuda, la banda desaparece del todo', () => {
  const i = INF.indexOf('async function loadDebe()');
  const b = INF.slice(i, i + 1400);
  assert.match(b, /if\(!sin\.length\)\{ box\.hidden=true; box\.innerHTML=""/,
    'ni banda ni restos cuando no falta ninguno');
});
