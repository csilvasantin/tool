import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./yk-misiones.js', import.meta.url), 'utf8');
const board = await readFile(new URL('./misiones.html', import.meta.url), 'utf8');
const css = await readFile(new URL('./yk-misiones.css', import.meta.url), 'utf8');

function loadModule() {
  const windowObj = {};
  const documentObj = {addEventListener() {}, querySelector: () => null};
  const ctx = vm.createContext({
    window: windowObj, document: documentObj,
    localStorage: {getItem: () => null, setItem() {}, removeItem() {}},
    Date, Math, JSON, Promise, RegExp, Object, Array, String, Number, Boolean,
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; },
    setTimeout, clearTimeout, console
  });
  vm.runInContext(source, ctx);
  return windowObj.YkMisiones;
}

test('Misiones activa la columna fusionada Proyect ID sin cambiar las otras vistas', () => {
  assert.match(board, /projectIdLayout:true/);
  assert.match(board, /<span class="idlbl">Proyect ID/);
  assert.match(board, /col\("subject","Misión"\)/);
  assert.doesNotMatch(board, /col\("fecha","Fecha"\)/);
  assert.doesNotMatch(board, /<div class="lh-static">Proyecto<\/div>/);
  assert.match(css, /\.hd\.project-id-layout\{grid-template-columns:8px minmax\(280px,var\(--c-id,360px\)\) minmax\(260px,var\(--c-mis,1fr\)\)/);
});

test('Proyect ID conserva selector y previo; Misión recibe texto, origen y tiempos', () => {
  const Yk = loadModule();
  Yk.init({worker:'https://api.yokup.com', columnMode:'tasks', projectIdLayout:true});
  Yk.setProyectos([
    {id:'yokup', name:'Yokup', web:'https://www.yokup.com'},
    {id:'pixeria', name:'Pixeria', web:'https://www.pixeria.com'}
  ]);
  const html = Yk.rowHtml({
    id:'FLT-1156', project:'yokup', project_name:'Yokup', source:'fleet',
    subject:'Unificar ID y proyecto', screen:'MacBookPro14', assignee:'TrinityMBP14',
    machine:'MacBookProNegro14', status:'in_progress', created_at:Date.now(), priority:'alta'
  });
  assert.match(html, /class="hd project-id-layout"/);
  assert.match(html, /class="project-id-top"[\s\S]*class="tkid"[\s\S]*class="project-id-select"[\s\S]*class="cel shot"/);
  assert.match(html, /<option value="yokup" selected>Yokup · yokup<\/option>/);
  const projectCell=(html.match(/<div class="project-id-cell">[\s\S]*?<\/div><\/div>/)||[])[0]||'';
  assert.doesNotMatch(projectCell, /Unificar ID y proyecto/);
  assert.match(html, /class="mission-col"[\s\S]*Unificar ID y proyecto[\s\S]*Origen · 🎯 Misión[\s\S]*class="mission-time"[\s\S]*📅/);
  assert.doesNotMatch(html, /class="cel rtiempo"/);
});

test('el diseño compartido conserva el formato histórico si no se activa', () => {
  const Yk = loadModule();
  Yk.init({worker:'https://api.yokup.com', columnMode:'machine'});
  Yk.setProyectos([{id:'yokup', name:'Yokup', web:'https://www.yokup.com'}]);
  const html = Yk.rowHtml({id:'INC-1', source:'monitor', subject:'Pantalla', status:'open', created_at:Date.now(), priority:'media'});
  assert.doesNotMatch(html, /project-id-layout|project-id-select/);
  assert.match(html, /class="tkid"[\s\S]*Servicio/);
  assert.match(html, /class="cel shot"[\s\S]*class="subj"/);
});
