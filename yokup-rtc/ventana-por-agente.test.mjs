import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Carlos, 3-sep-2026: «el limite es por agente no por hora». Ya era por agente, pero
// contaba las CREADAS en 60 minutos: la ventana automatica de las 06:13, caducada y
// con opciones de hace 540 horas, seguia ocupando el hueco y la propuesta que pidio
// no podia abrirse. Una ventana que ya no admite respuesta no reserva sitio.
const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');
const bloque = source.slice(source.indexOf('const previas = ((await env.DB.prepare'),
                            source.indexOf('const id = "DEC-"'));

test('solo cuentan las ventanas VIVAS: pendientes y dentro de plazo', () => {
  assert.match(bloque, /status='pending'/);
  assert.match(bloque, /deadline > \?/);
  assert.match(bloque, /\.bind\(agent, now\)/);
});

test('una ventana caducada ya no reserva el hueco', () => {
  // el tope dejo de mirar la hora de creacion
  assert.doesNotMatch(bloque, /created_at > \?/);
  assert.doesNotMatch(bloque, /now - HOURLY_WINDOW_MS/);
});

test('el tope sigue siendo POR AGENTE, no global', () => {
  assert.match(bloque, /lower\(agent\).*=.*lower\(\?\)/);
});

test('cuando se rechaza, se dice la hora BUENA: cuando caduca la viva', () => {
  assert.match(bloque, /nextAt: Number\(previous\.deadline\)/);
});

test('una ventana hija no cuenta como ventana propia', () => {
  assert.match(bloque, /parent_decision IS NULL OR parent_decision=''/);
});
