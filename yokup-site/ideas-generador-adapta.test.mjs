// FLT-1010 — el generador «✨ Idea nueva» sube al formulario y se ADAPTA a lo
// seleccionado, y los selects se renombran (silla→Consejero, etiqueta→idea).
// Pruebas de FORMA sobre objetivos.html e ideas.html (mismo estilo que la carpeta).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const OBJ = await readFile(new URL('./objetivos.html', import.meta.url), 'utf8');
const IDE = await readFile(new URL('./ideas.html', import.meta.url), 'utf8');

// Devuelve el trozo <form class="add" ...>…</form> y el de la barra de filtros.
function form(SRC){ const m = SRC.match(/<form class="add"[\s\S]*?<\/form>/); return m ? m[0] : ''; }
function bar(SRC){ const m = SRC.match(/<div class="bar" id="filters">[\s\S]*?<\/div>/); return m ? m[0] : ''; }

for (const [name, SRC] of [['objetivos.html', OBJ], ['ideas.html', IDE]]) {
  test(`${name}: el select de etiqueta muestra «— idea —» (no «— etiqueta —»)`, () => {
    assert.ok(SRC.includes('<option value="">— idea —</option>'), 'placeholder «— idea —»');
    assert.ok(!SRC.includes('— etiqueta —'), 'ya no queda «— etiqueta —»');
  });

  test(`${name}: «✨ Idea nueva» vive DENTRO del formulario, no en la barra de filtros`, () => {
    assert.match(form(SRC), /id="genBtn"[^>]*>✨ Idea nueva</, 'el ✨ está en el <form>');
    assert.ok(!bar(SRC).includes('genBtn'), 'el ✨ ya no está en la barra de filtros');
  });

  test(`${name}: «Añadir idea» (submit) precede al ✨ (jerarquía: primario, luego secundario)`, () => {
    const f = form(SRC);
    assert.ok(f.indexOf('id="fBtn"') < f.indexOf('id="genBtn"'), 'Añadir va antes que ✨');
    assert.ok(f.includes('class="gen" id="genBtn" type="button"'), '✨ es .gen type=button');
  });

  test(`${name}: hay estilo .add .gen (secundario en el formulario)`, () => {
    assert.ok(SRC.includes('.add .gen{'), 'CSS del ✨ dentro del formulario');
  });

  test(`${name}: generate() lee el proyecto del formulario y lo envía en el POST`, () => {
    assert.ok(SRC.includes('$("#fProject")'), 'lee #fProject en generate');
    assert.ok(SRC.includes('/ideas/generate'), 'llama a /ideas/generate');
    assert.ok(!/body:"{}"/.test(SRC), 'ya no manda cuerpo vacío fijo');
  });
}

// El selector de Consejero (fSeat) solo existe en objetivos.html.
test('objetivos.html: el select de silla se renombra a «— Consejero —» (forma + ficha)', () => {
  assert.ok(OBJ.includes('<option value="">— Consejero —</option>'), 'fSeat muestra «— Consejero —»');
  assert.ok(OBJ.includes(`function seatOpts(sel){ return '<option value="">— Consejero —</option>'`), 'seatOpts (ficha) también');
  assert.ok(!OBJ.includes('— silla —'), 'ya no queda «— silla —»');
});

test('objetivos.html: generate() adapta seat+project a lo elegido en el formulario', () => {
  assert.ok(OBJ.includes('$("#fSeat")') && OBJ.includes('$("#fProject")'), 'lee Consejero y proyecto');
  assert.ok(OBJ.includes('body:JSON.stringify({seat,project})'), 'envía {seat, project}');
});

test('ideas.html: generate() adapta project (no tiene selector de Consejero)', () => {
  assert.ok(!IDE.includes('id="fSeat"'), 'esta vista no tiene selector de Consejero');
  assert.ok(IDE.includes('body:JSON.stringify({project})'), 'envía {project}');
});
