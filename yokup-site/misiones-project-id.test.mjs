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

test('PROJECT ID pone el selector sobre la miniatura y conserva referencia y tiempos', () => {
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
  const projectCell = between(html, '<div class="project-id-cell">', '<div class="mission-col">');
  assert.match(projectCell, /class="project-id-main"[\s\S]*class="project-id-meta"/);
  const shot = projectCell.indexOf('class="cel shot"');
  const id = projectCell.indexOf('class="tkid"');
  assert.ok(shot >= 0 && id > shot, 'la miniatura precede a la referencia y sus tiempos');
  assert.match(projectCell, /project-id-select-slot[\s\S]*class="cel shot"/);
  assert.doesNotMatch(projectCell, /project-select-wrap|<select/);
  assert.match(projectCell, /class="project-id-time"[\s\S]*📅[\s\S]*⏳[\s\S]*⏱/);
  assert.doesNotMatch(projectCell, /Unificar ID y proyecto/);
});

test('creación, evolución y finalización viven en PROJECT ID, no en Misión ni Agente', () => {
  const Yk = loadModule();
  Yk.init({worker:'https://api.yokup.com', columnMode:'tasks', projectIdLayout:true});
  Yk.setProyectos([{id:'yokup', name:'Yokup', web:'https://www.yokup.com'}]);
  const html = Yk.rowHtml({
    id:'FLT-1159', project:'yokup', project_name:'Yokup', source:'fleet',
    subject:'Reordenar Project ID', assignee:'OraculoMacMini', machine:'MacMini',
    status:'in_progress', created_at:Date.now(), priority:'alta'
  });
  const missionCell = between(html, '<div class="mission-col">', '<div class="cel ord ');
  // AGENTE va PRIMERO desde 2026-08-05: su celda acaba donde empieza PROJECT ID,
  // no donde empieza Estado (eso se tragaba la fila entera).
  const agentCell = between(html, '<div class="cel agc">', '<div class="project-id-cell">');
  const projectCell = between(html, '<div class="project-id-cell">', '<div class="mission-col">');
  assert.match(missionCell, /Reordenar Project ID/);
  assert.doesNotMatch(missionCell, /Origen ·|🎯 Misión/);
  assert.doesNotMatch(missionCell, /mission-time|title="creada:|📅|⏳|⏱/);
  assert.doesNotMatch(agentCell, /agent-created|title="creada:|📅|⏳|⏱/);
  assert.match(projectCell, /class="project-id-time"[\s\S]*title="creada:[\s\S]*📅[\s\S]*⏳[\s\S]*⏱/);
  assert.doesNotMatch(html, /class="cel rtiempo"/);
});

test('Misión encabeza con su proyecto y debajo la descripción, sin repetir el rótulo', () => {
  const Yk = loadModule();
  Yk.init({worker:'https://api.yokup.com', columnMode:'tasks', projectIdLayout:true});
  Yk.setProyectos([{id:'yokup', name:'Yokup', web:'https://www.yokup.com'}]);
  const html = Yk.rowHtml({
    id:'FLT-1190', project:'yokup', project_name:'Yokup', source:'fleet',
    subject:'MISIÓN Yokup · Reordenar la cuadrícula', assignee:'OraculoMacMini',
    agent_runtime:'Codex', agent_host:'app', machine:'MacMini', status:'in_progress',
    created_at:Date.now(), priority:'alta'
  });
  const missionCell = between(html, '<div class="mission-col">', '<div class="cel ord ');
  const agentCell = between(html, '<div class="cel agc">', '<div class="project-id-cell">');
  // Carlos, 2026-08-05: «en la misión empezamos por Proyecto xxx y debajo la
  // descripción». El rótulo redundante «MISIÓN …» del asunto se sigue podando.
  assert.match(missionCell, /class="subj-project"[\s\S]*Proyecto Yokup/);
  assert.match(missionCell, />Reordenar la cuadrícula</);
  assert.doesNotMatch(missionCell, /MISIÓN|Origen/);
  // el proyecto sale ANTES que la descripción, no debajo
  assert.ok(missionCell.indexOf('subj-project') < missionCell.indexOf('Reordenar la cuadrícula'));
  // Agente/Plataforma conserva el runtime, pero no duplica el proyecto que ya
  // encabeza la columna Misión.
  assert.match(agentCell, /Codex · Desktop App/);
  assert.doesNotMatch(agentCell, /mission-project-label|Yokup/);
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
  assert.match(styles, /\.project-id-main\{/);
  assert.match(styles, /\.project-id-meta\{/);
  assert.match(styles, /\.project-id-time\{/);
  assert.match(styles, /\.project-id-top\{[\s\S]*grid-template-columns:1fr/);
  assert.doesNotMatch(board, /\.project-id-main>\.project-select-wrap|agent-created/);
  assert.doesNotMatch(source, /project-select-wrap|project-save|projectOptionsHtml/);
  assert.doesNotMatch(css, /project-id-select|project-select-wrap|project-save/);
});
