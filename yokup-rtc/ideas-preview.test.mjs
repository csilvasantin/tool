// FLT-1017 — «✨ Idea nueva» pasa a ser un BORRADOR: POST /ideas/generate {preview:true}
// devuelve la idea SIN guardarla ni deliberarla. Quien la da de alta es el formulario
// de /objetivos (POST /ideas), tras el minuto de cortesía o a mano. Así una idea que
// nadie quiso no deja fila en `ideas`.
// Pruebas de FORMA sobre src/index.js, al estilo del resto de la carpeta.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const SRC = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');

// Recorta el cuerpo de generateCouncilIdea para razonar sobre el orden real.
function genBody() {
  const i = SRC.indexOf('async function generateCouncilIdea(');
  assert.ok(i > 0, 'existe generateCouncilIdea');
  const j = SRC.indexOf('__name(generateCouncilIdea', i);
  return SRC.slice(i, j);
}

test('la firma acepta persist y por defecto sigue guardando', () => {
  assert.ok(SRC.includes('async function generateCouncilIdea(env, seat, topic, projectHint, persist = true)'),
    'persist = true por defecto: el cron y todo lo demás no cambian');
});

test('con persist=false se sale ANTES del INSERT y de la deliberación', () => {
  const b = genBody();
  const salida = b.indexOf('if (!persist)');
  const insert = b.indexOf('INSERT INTO ideas');
  const delib  = b.indexOf('generateCouncilReview');
  assert.ok(salida > 0, 'hay salida temprana por borrador');
  assert.ok(salida < insert, 'el borrador NO llega al INSERT');
  assert.ok(salida < delib, 'el borrador NO gasta una deliberación');
});

test('el borrador sale sin id, para que nadie lo confunda con una fila viva', () => {
  const b = genBody();
  const trozo = b.slice(b.indexOf('if (!persist)'), b.indexOf('INSERT INTO ideas'));
  assert.match(trozo, /id:\s*""/, 'id vacío');
  assert.match(trozo, /preview:\s*true/, 'va marcado como preview');
  assert.match(trozo, /title,\s*body/, 'lleva título y detalle, que es lo que rellena el formulario');
});

test('la ruta lee {preview} (y admite dry_run) y lo traduce a persist', () => {
  const i = SRC.indexOf('url.pathname === "/ideas/generate"');
  const trozo = SRC.slice(i, i + 900);
  assert.match(trozo, /b\.preview \|\| b\.dry_run/, 'acepta preview o dry_run');
  assert.ok(trozo.includes('generateCouncilIdea(env, seat, topic, projectHint, !preview)'),
    'preview:true → persist:false');
});

test('sin la bandera, el comportamiento de siempre queda intacto', () => {
  assert.ok(SRC.includes('await generateCouncilIdea(env, seat);'),
    'la llamada de 2 args del cron sigue guardando como siempre');
});
