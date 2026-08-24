// El sync se quedó sin responder (http 000, ni con 600 s) porque recorría el buzón
// ENTERO —80 entradas— y por cada una lanzaba hasta ~33 consultas a D1: del orden de
// 1.500-2.600 subpeticiones por llamada, contra el límite de 1.000 de un Worker.
// fleetSyncLote reparte el buzón en lo que se atiende ahora y lo que espera.
// Se prueba la función PURA: sin D1, sin red.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');

function extract(name) {
  const match = new RegExp(`(?:async\\s+)?function ${name}\\(`).exec(source);
  assert.ok(match, `falta ${name}`);
  const start = match.index, brace = source.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let i = brace; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if ('"\'`'.includes(char)) { quote = char; continue; }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`función incompleta: ${name}`);
}

const fleetSyncLote = new Function(`${extract('fleetSyncLote')}; return fleetSyncLote;`)();

const buzon = (n, desde = 1) => Array.from({length: n}, (_, i) => ({id: desde + i}));

test('nunca se atiende más de un lote: es lo que devuelve el sync al mundo', () => {
  const r = fleetSyncLote(buzon(80), 0, 0, 25);
  assert.equal(r.elegidos.length, 25);
  assert.equal(r.pendientes, 55);
});

test('lo NUEVO no hace cola aunque el buzón esté lleno de viejo', () => {
  const items = buzon(80);                       // ids 1..80
  const r = fleetSyncLote(items, 0, 78, 25);     // ya vistos hasta el 78
  const ids = r.elegidos.map(x => x.id);
  assert.ok(ids.includes(79) && ids.includes(80), 'los recién entrados deben ir en esta vuelta');
});

test('el primer sync tras desplegar (marca de agua 0) NO se salta el presupuesto', () => {
  // Con visto=0 todo el buzón cuenta como nuevo. La primera versión los atendía
  // todos y reproducía exactamente el fallo que se está arreglando.
  const r = fleetSyncLote(buzon(80), 0, 0, 25);
  assert.equal(r.elegidos.length, 25);
  assert.equal(r.pendientes, 55, 'los nuevos que no caben esperan, no desaparecen');
});

test('lo nuevo que no cupo va PRIMERO en la vuelta siguiente', () => {
  const items = buzon(80);
  const r1 = fleetSyncLote(items, 0, 0, 25);
  const r2 = fleetSyncLote(items, r1.cursor, r1.visto, 25);
  assert.deepEqual(r1.elegidos.map(x => x.id), Array.from({length:25},(_,i)=>i+1));
  assert.deepEqual(r2.elegidos.map(x => x.id), Array.from({length:25},(_,i)=>i+26));
});

test('la ventana ROTA: llamadas sucesivas acaban repasando el buzón entero', () => {
  const items = buzon(80);
  let cursor = 0, visto = 80;                    // nada nuevo: solo repaso
  const cubierto = new Set();
  for (let i = 0; i < 4; i += 1) {
    const r = fleetSyncLote(items, cursor, visto, 25);
    r.elegidos.forEach(x => cubierto.add(x.id));
    cursor = r.cursor;
  }
  assert.equal(cubierto.size, 80, 'en 4 vueltas de 25 debe haberlas visto todas');
});

test('la ventana da la vuelta al llegar al final, sin salirse ni repetir el arranque', () => {
  const items = buzon(30);
  const r = fleetSyncLote(items, 25, 30, 10);    // arranca en el 25 de 30
  const ids = r.elegidos.map(x => x.id);
  assert.equal(ids.length, 10);
  assert.deepEqual(ids, [26,27,28,29,30,1,2,3,4,5]);
});

test('more/pendientes dicen la verdad cuando el buzón cabe entero', () => {
  const r = fleetSyncLote(buzon(10), 0, 10, 25);
  assert.equal(r.elegidos.length, 10);
  assert.equal(r.pendientes, 0);
});

test('la marca de agua avanza solo hasta lo REALMENTE atendido', () => {
  const r = fleetSyncLote(buzon(80), 0, 0, 25);
  assert.equal(r.visto, 25, 'si saltara a 80, los no atendidos dejarían de ser nuevos sin procesarse');
});

test('un buzón vacío no revienta ni deja el cursor sucio', () => {
  const r = fleetSyncLote([], 7, 5, 25);
  assert.deepEqual(r.elegidos, []);
  assert.equal(r.cursor, 0);
  assert.equal(r.pendientes, 0);
});

test('entradas sin id se descartan sin contaminar el reparto', () => {
  const r = fleetSyncLote([{id: 1}, null, {}, {id: 2}], 0, 0, 25);
  assert.equal(r.elegidos.length, 2);
});

test('el presupuesto declarado cabe bajo el límite de subpeticiones del Worker', () => {
  const lote = /FLEET_SYNC_LOTE\s*=\s*(\d+)/.exec(source);
  assert.ok(lote, 'falta FLEET_SYNC_LOTE');
  const PEOR_CASO_CONSULTAS_POR_ENTRADA = 33;
  assert.ok(Number(lote[1]) * PEOR_CASO_CONSULTAS_POR_ENTRADA < 1000,
    `${lote[1]} × ${PEOR_CASO_CONSULTAS_POR_ENTRADA} debe quedar bajo las 1.000 subpeticiones`);
});
