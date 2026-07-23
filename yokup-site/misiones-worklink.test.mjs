// La miniatura de una misión ENLAZA al trabajo realizado (Carlos, 2026-07-23,
// SubNeoMini). Cubre la función pura YkMisiones.workUrlOf(t) y su orden de
// resolución: campo explícito → URL de los informes (casa primero, sin prueba ni
// imágenes) → web del proyecto ASIGNADO del censo → "" (lightbox).
//
// FIXTURE REAL de FLT-1003 (Generador de Presites): sacado de la D1 de producción
// (mission_tasks). Sus informes NO contienen ninguna URL http(s) — la única fuente
// honesta del destino admiranext.com/presites es el censo de proyectos
// (generador-de-presites → www.admiranext.com/presites), por eso resuelve por el
// tramo 3. Verificado contra /fleet/missions y /projects el 2026-07-23.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./yk-misiones.js', import.meta.url), 'utf8');

// Contexto mínimo: el IIFE toca window/document/localStorage al cargar; stubs inertes.
function loadModule() {
  const windowObj = {};
  const documentObj = {addEventListener() {}, querySelector: () => null};
  const ctx = vm.createContext({
    window: windowObj, document: documentObj,
    localStorage: {getItem: () => null, setItem() {}, removeItem() {}},
    Date, Math, JSON, Promise, RegExp, Object, Array, String, Number, Boolean,
    setTimeout, clearTimeout, console
  });
  vm.runInContext(source, ctx);
  return windowObj.YkMisiones;
}

const Yk = loadModule();
// Censo de proyectos tal como llega de GET /projects (recortado a lo real usado).
Yk.setProyectos([
  {id: 'generador-de-presites', name: 'Generador de Presites', web: 'www.admiranext.com/presites'},
  {id: 'yokup', name: 'Yokup', web: 'https://www.yokup.com'}
]);

// ── FLT-1003 REAL: informes sin URL + proof /media/ + project asignado. ──
// (reports copiados de mission_tasks de producción; ninguno lleva http.)
const flt1003 = {
  id: 'FLT-1003',
  project: 'generador-de-presites',
  proof_image: 'https://yokup-rtc.csilvasantin.workers.dev/media/fleet/686c823d8abfd4e2.png',
  _tasks: [
    {code: 'a', status: 'done', report: 'Modelo, editor y storyboard de intro; storyboard v2 con escenas y transiciones.'},
    {code: 'b', status: 'done', report: 'Runtime audiovisual original terminado en 273d2a2: preview full-screen, Skip visible, Esc/Enter, pausa. 108/108 tests OK; push a codex/flt-999-generador-presites. Pendiente QA por InfraOraculoMini.'},
    {code: 'c', status: 'done', report: 'QA independiente 9/9: migración v1→v2, destino interno/HTTPS, Skip desde t=0. Commits 7abf0d5, f9002e3 y 1a76e7d; Cloudflare Pages desplegado. El smoke público confirma el gate 401 esperado.'},
    {code: 'z1', status: 'done', report: 'Cierre QA de Generador de Presites: intro audiovisual previa al destino. QA 9/9. Evidencia: render visual local de la misma función de producción; la URL pública permanece protegida por el gate correcto.'}
  ]
};

test('FLT-1003 (payload real) resuelve a la web del proyecto en admiranext (informes sin URL)', () => {
  assert.equal(Yk.workUrlOf(flt1003), 'https://www.admiranext.com/presites');
});

test('misión SIN URLs (ni informe, ni proyecto, ni campo) ⇒ "" (lightbox)', () => {
  const m = {
    id: 'FLT-X', project: null,
    _tasks: [
      {code: 'a', status: 'done', report: 'Hecho el diagnóstico y el cambio; sin publicar aún.'},
      {code: 'b', status: 'done', report: 'Verificado en local, reportado al grupo.'}
    ]
  };
  assert.equal(Yk.workUrlOf(m), '');
});

test('informe con SÓLO una prueba (/media/…) o imagen ⇒ "" (no se enlaza la prueba)', () => {
  const m = {
    id: 'FLT-Y', project: null,
    _tasks: [
      {code: 'a', status: 'done', report: 'Captura de prueba en https://yokup-rtc.csilvasantin.workers.dev/media/fleet/abc123.png y screenshot https://example.com/foto.jpg'}
    ]
  };
  assert.equal(Yk.workUrlOf(m), '');
});

test('campo explícito de trabajo (work_url) manda sobre informes y proyecto', () => {
  const m = {
    id: 'FLT-Z', project: 'yokup', work_url: 'https://www.yokup.com/entregado',
    _tasks: [{code: 'a', status: 'done', report: 'ver https://otra.com/algo'}]
  };
  assert.equal(Yk.workUrlOf(m), 'https://www.yokup.com/entregado');
});

test('informe: se PREFIERE el dominio de la casa aunque aparezca después de uno externo', () => {
  const m = {
    id: 'FLT-W', project: null,
    _tasks: [{code: 'a', status: 'done', report: 'Referencia externa https://stackoverflow.com/q/1 y el entregable https://www.yokup.com/pruebas/FLT-W.html'}]
  };
  assert.equal(Yk.workUrlOf(m), 'https://www.yokup.com/pruebas/FLT-W.html');
});

test('informe: se recorta la puntuación de prosa pegada al final de la URL', () => {
  const m = {
    id: 'FLT-V', project: null,
    _tasks: [{code: 'a', status: 'done', report: 'Desplegado en https://www.yokup.com/agentica.'}]
  };
  assert.equal(Yk.workUrlOf(m), 'https://www.yokup.com/agentica');
});

test('el informe (tramo 2) manda sobre la web del proyecto (tramo 3) cuando hay URL específica', () => {
  const m = {
    id: 'FLT-U', project: 'yokup',
    _tasks: [{code: 'a', status: 'done', report: 'Entregado en https://www.yokup.com/pruebas/FLT-U-c.html'}]
  };
  assert.equal(Yk.workUrlOf(m), 'https://www.yokup.com/pruebas/FLT-U-c.html');
});

test('sólo se usa el proyecto ASIGNADO, nunca el adivinado por palabras del asunto', () => {
  // Asunto menciona "pixeria" pero NO hay project asignado ni URL en informe →
  // workUrlOf NO inventa un destino (a diferencia de la miniatura /shot adivinada).
  const m = {id: 'FLT-T', project: null, subject: 'Mejorar la home de pixeria', _tasks: []};
  assert.equal(Yk.workUrlOf(m), '');
});

test('null-safe: sin ticket y sin plan no revienta', () => {
  assert.equal(Yk.workUrlOf(null), '');
  assert.equal(Yk.workUrlOf({id: 'FLT-S'}), '');
});

test('respaldo t.tasks (forma de /fleet/missions, sin report) no rompe y cae a proyecto', () => {
  const m = {
    id: 'FLT-R', project: 'yokup',
    tasks: [{code: 'a', status: 'done'}, {code: 'b', status: 'done'}]  // sin report
  };
  assert.equal(Yk.workUrlOf(m), 'https://www.yokup.com');
});
