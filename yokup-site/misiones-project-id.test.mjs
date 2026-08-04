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

function between(html, start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from + start.length);
  assert.ok(from >= 0, `no se encontro el inicio ${start}`);
  assert.ok(to > from, `no se encontro el final ${end}`);
  return html.slice(from, to);
}

test('Misiones activa la columna fusionada PROJECT ID con el rotulo exacto', () => {
  assert.match(board, /projectIdLayout:true/);
  assert.match(board, /<span class="idlbl">PROJECT ID/);
  assert.doesNotMatch(board, /Proyect ID|ProjectD/i);
  assert.match(board, /col\("subject","Misión"\)/);
  assert.doesNotMatch(board, /col\("fecha","Fecha"\)/);
  assert.doesNotMatch(board, /<div class="lh-static">Proyecto<\/div>/);
  assert.match(css, /\.hd\.project-id-layout\{grid-template-columns:8px minmax\(/);
});

test('PROJECT ID pone miniatura antes del selector y deja id y datos debajo', () => {
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
  assert.match(html, /<option value="yokup" selected>Yokup · yokup<\/option>/);
  const projectCell = between(html, '<div class="project-id-cell">', '<div class="mission-col">');
  assert.match(projectCell, /class="project-id-main"[\s\S]*class="project-id-meta"/);
  const shot = projectCell.indexOf('class="cel shot"');
  const selector = projectCell.indexOf('class="project-id-select"');
  const id = projectCell.indexOf('class="tkid"');
  assert.ok(shot >= 0 && selector > shot, 'la miniatura precede al selector de proyecto');
  assert.ok(id > selector, 'el id y sus datos se colocan debajo del bloque miniatura/selector');
  assert.doesNotMatch(projectCell, /Unificar ID y proyecto/);
});

test('fecha y hora de creación viven bajo Agente/Plataforma, no en Misión', () => {
  const Yk = loadModule();
  Yk.init({worker:'https://api.yokup.com', columnMode:'tasks', projectIdLayout:true});
  Yk.setProyectos([{id:'yokup', name:'Yokup', web:'https://www.yokup.com'}]);
  const html = Yk.rowHtml({
    id:'FLT-1159', project:'yokup', project_name:'Yokup', source:'fleet',
    subject:'Reordenar Project ID', assignee:'OraculoMacMini', machine:'MacMini',
    status:'in_progress', created_at:Date.now(), priority:'alta'
  });
  const missionCell = between(html, '<div class="mission-col">', '<div class="cel ord ');
  const agentCell = between(html, '<div class="cel agc">', '<div class="cel est">');
  assert.match(missionCell, /Reordenar Project ID[\s\S]*Origen · 🎯 Misión/);
  assert.doesNotMatch(missionCell, /title="creada:|📅/);
  assert.match(agentCell, /OraculoMacMini[\s\S]*class="agent-created"[\s\S]*class="fch2"[\s\S]*📅/);
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
  assert.match(html, /class="cel rtiempo"[\s\S]*class="fch2"/);
});

test('PROJECT ID mantiene un apilado responsive sin anchos fijos de escritorio', () => {
  const styles = css + '\n' + board;
  const mobile = styles.slice(styles.indexOf('@media(max-width:720px)'));
  assert.match(mobile, /\.hd,.hd\.project-id-layout\{grid-template-columns:8px 1fr/);
  assert.match(mobile, /\.project-id-cell\{padding:0\}/);
  assert.match(mobile, /\.project-id-top\{grid-template-columns:/);
  assert.match(mobile, /\.mission-time\{flex-wrap:wrap\}/);
  assert.match(styles, /\.project-id-main\{/);
  assert.match(styles, /\.project-id-meta\{/);
  assert.match(styles, /\.project-id-layout \.cel\.agc \.agent-created\{/);
});
