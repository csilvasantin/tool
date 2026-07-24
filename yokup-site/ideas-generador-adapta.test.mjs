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

  test(`${name}: el ✨ es .gen type=button`, () => {
    assert.ok(form(SRC).includes('class="gen" id="genBtn" type="button"'), '✨ es .gen type=button');
  });

  test(`${name}: hay estilo .add .gen (el ✨ dentro del formulario)`, () => {
    assert.ok(SRC.includes('.add .gen{'), 'CSS del ✨ dentro del formulario');
  });

  test(`${name}: generate() llama a /ideas/generate sin cuerpo vacío fijo`, () => {
    assert.ok(SRC.includes('/ideas/generate'), 'llama a /ideas/generate');
    assert.ok(!/body:"{}"/.test(SRC), 'ya no manda cuerpo vacío fijo');
  });
}

// ideas.html conserva la regla FLT-1010: el ✨ es secundario y va DESPUÉS de «Añadir».
test('ideas.html: «Añadir idea» precede al ✨ (secundario)', () => {
  const f = form(IDE);
  assert.ok(f.indexOf('id="fBtn"') < f.indexOf('id="genBtn"'), 'Añadir va antes que ✨');
});

test('ideas.html: generate() lee el proyecto del formulario y lo envía', () => {
  assert.ok(IDE.includes('$("#fProject")'), 'lee #fProject en generate');
});

// El selector de Consejero (fSeat) solo existe en objetivos.html.
test('objetivos.html: el select de silla se renombra a «— Consejero —» (forma + ficha)', () => {
  assert.ok(OBJ.includes('<option value="">— Consejero —</option>'), 'fSeat muestra «— Consejero —»');
  assert.ok(OBJ.includes(`function seatOpts(sel){ return '<option value="">— Consejero —</option>'`), 'seatOpts (ficha) también');
  assert.ok(!OBJ.includes('— silla —'), 'ya no queda «— silla —»');
});

// ── FLT-1017 (Carlos, 24-jul-2026) — el ✨ manda: sube ARRIBA A LA DERECHA, redacta
//    un BORRADOR que rellena «La idea» y «Detalle», y si nadie los toca en un minuto
//    lo damos de alta nosotros. Punto de vista del Consejero elegido; proyecto AL AZAR
//    (no se manda ninguno: lo sortea el worker). Editar cualquiera de los dos = freno.
test('objetivos.html: el ✨ va ARRIBA A LA DERECHA, antes que «Añadir idea»', () => {
  const f = form(OBJ);
  assert.ok(f.indexOf('id="genBtn"') < f.indexOf('id="fBtn"'), '✨ va antes que Añadir');
  assert.ok(/<div class="hd">[\s\S]*id="fTitle"[\s\S]*id="genBtn"[\s\S]*<\/div>/.test(f),
    '✨ comparte la línea del titular «La idea»');
  assert.ok(OBJ.includes('.add .hd{'), 'hay CSS de la línea del titular');
});

test('objetivos.html: generate() pide BORRADOR (preview) con el Consejero elegido y sin proyecto', () => {
  assert.ok(OBJ.includes('$("#fSeat")'), 'lee el Consejero');
  assert.ok(OBJ.includes('body:JSON.stringify({seat,preview:true})'), 'envía {seat, preview}');
  assert.ok(OBJ.includes('$("#fSeat").value)||"ceo"'), 'sin elección, el Consejero por defecto es el CEO (lo aleatorio es el proyecto)');
  assert.ok(!/JSON\.stringify\(\{seat,project\}\)/.test(OBJ), 'ya NO manda proyecto: lo sortea el worker');
});

test('objetivos.html: el borrador rellena los dos campos y NO se guarda al generar', () => {
  assert.ok(OBJ.includes('$("#fTitle").value=it.title'), 'rellena «La idea»');
  assert.ok(OBJ.includes('$("#fBody").value=it.body'), 'rellena «Detalle»');
  assert.ok(!/IDEAS\.unshift\(d\.idea\)/.test(OBJ), 'ya no se pinta como idea viva al generar');
});

test('objetivos.html: minuto de cortesía — alta automática y freno al editar', () => {
  assert.ok(/const AUTO_MS=60000/.test(OBJ), 'la espera es de 60 s');
  assert.ok(OBJ.includes('$("#addForm").requestSubmit()'), 'al expirar la damos de alta nosotros');
  assert.ok(/\["#fTitle","#fBody"\][\s\S]*addEventListener\("input"/.test(OBJ),
    'editar cualquiera de los dos campos para el reloj');
  assert.ok(OBJ.includes('autoStop('), 'hay freno explícito');
});

test('objetivos.html: el borrador aceptado conserva la firma del Consejo', () => {
  assert.ok(OBJ.includes('DRAFT?"consejo":""'), 'el alta hereda tag=consejo si vino del ✨');
});

test('ideas.html: generate() adapta project (no tiene selector de Consejero)', () => {
  assert.ok(!IDE.includes('id="fSeat"'), 'esta vista no tiene selector de Consejero');
  assert.ok(IDE.includes('body:JSON.stringify({project})'), 'envía {project}');
});
