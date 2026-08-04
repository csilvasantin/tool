import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const [identitySource, missionsSource, css, normativa] = await Promise.all([
  "yk-agent-identity.js", "yk-misiones.js", "yk-misiones.css", "normativa.html",
].map((name) => readFile(new URL(`./${name}`, import.meta.url), "utf8")));

function loadModule() {
  const windowObj = {};
  windowObj.window = windowObj;
  const documentObj = {addEventListener() {}, querySelector: () => null};
  const context = vm.createContext({
    window:windowObj, document:documentObj,
    localStorage:{getItem:() => null, setItem() {}, removeItem() {}},
    Date, Math, JSON, Promise, RegExp, Object, Array, String, Number, Boolean,
    CustomEvent:function CustomEvent(type, init) { this.type=type; this.detail=init && init.detail; },
    setTimeout, clearTimeout, console,
  });
  vm.runInContext(identitySource, context);
  vm.runInContext(missionsSource, context);
  return {Yk:windowObj.YkMisiones, identity:windowObj.ykAgentIdentity};
}

function agentCell(html) {
  const start = html.indexOf('<div class="cel agc">');
  const end = html.indexOf('<div class="cel est">', start);
  assert.ok(start >= 0 && end > start, "la fila conserva una celda Agente separada");
  return html.slice(start, end);
}

test("la normativa fija posición, responsabilidad, colores y ausencia sin proyecto", () => {
  assert.match(normativa, /proyecto asignado muestra su nombre <b>debajo del agente<\/b>/);
  assert.match(normativa, /primary_responsible[\s\S]*owner/);
  assert.match(normativa, /ykAgentIdentity\.same\(assignee, responsable\)/);
  assert.match(normativa, /Oraculo y OraculoMacMini son la misma familia/);
  assert.match(normativa, /misma familia[\s\S]*Verde/);
  assert.match(normativa, /no es su responsable[\s\S]*Amarillo/);
  assert.match(normativa, /no tiene proyecto asignado[\s\S]*No se muestra ningún rótulo/);
  assert.match(normativa, /no un control:[^<]*no se convierte en enlace, selector, campo ni botón/);
});

test("la identidad canónica reconoce Oraculo y OraculoMacMini como familia", () => {
  const {identity} = loadModule();
  assert.equal(identity.same("Oraculo", "OraculoMacMini"), true);
  assert.equal(identity.same("OraculoMacMini", "NeoMacMini"), false);
});

test("el helper pinta verde por primary_responsible y usa owner como respaldo", () => {
  const {Yk} = loadModule();
  assert.equal(typeof Yk.projectAgentLabelHtml, "function", "YkMisiones exporta el helper contractual");
  Yk.init({worker:"https://api.yokup.com", columnMode:"tasks", projectIdLayout:true});
  Yk.setProyectos([
    {id:"yokup", name:"Yokup", web:"https://www.yokup.com", primary_responsible:"OraculoMacMini", owner:"NeoMacMini"},
    {id:"pixeria", name:"Pixeria", web:"https://www.pixeria.com", owner:"NeoMacMini"},
  ]);

  const primary = Yk.projectAgentLabelHtml({project:"yokup", project_name:"Yokup", assignee:"Oraculo"});
  const fallback = Yk.projectAgentLabelHtml({project:"pixeria", project_name:"Pixeria", assignee:"NeoMacMini"});
  assert.match(primary, /class="mission-project-label project-responsible"[^>]*>Yokup<\/span>/);
  assert.match(fallback, /class="mission-project-label project-responsible"[^>]*>Pixeria<\/span>/);
});

test("agente no responsable pinta amarillo; sin proyecto no pinta nada", () => {
  const {Yk} = loadModule();
  Yk.init({worker:"https://api.yokup.com", columnMode:"tasks", projectIdLayout:true});
  Yk.setProyectos([{id:"yokup", name:"Yokup", web:"https://www.yokup.com", primary_responsible:"NeoMacMini"}]);
  const collaborator = Yk.projectAgentLabelHtml({project:"yokup", project_name:"Yokup", assignee:"OraculoMacMini"});
  assert.match(collaborator, /class="mission-project-label project-collaborator"[^>]*>Yokup<\/span>/);
  assert.equal(Yk.projectAgentLabelHtml({project:"", project_name:"Yokup", assignee:"NeoMacMini"}), "");
  assert.doesNotMatch(collaborator, /<(?:a|select|input|button)\b/i);
  assert.match(missionsSource, /identity\.same\(/, "la decisión de color usa el comparador canónico");
});

test("el rótulo y la columna apilada quedan limitados al layout de /misiones", () => {
  const {Yk} = loadModule();
  Yk.init({worker:"https://api.yokup.com", projectIdLayout:false});
  Yk.setProyectos([{id:"yokup", name:"Yokup", primary_responsible:"OraculoMacMini"}]);
  const row = Yk.rowHtml({
    id:"INC-CONTRACT", source:"manual", subject:"Vista histórica sin layout de misiones",
    project:"yokup", assignee:"OraculoMini", status:"pending", created_at:Date.now(),
  });
  assert.doesNotMatch(row, /mission-project-label/, "incidencias/tareas no heredan el rótulo");
  assert.match(css, /\.hd\.project-id-layout \.cel\.agc\s*\{/,
    "la pila vertical del agente sólo cambia en /misiones");
  assert.doesNotMatch(css, /(?:^|\n)\.cel\.agc\s*\{[^}]*flex-direction:column/,
    "no se altera globalmente la columna AGENTE compartida");
});

test("sin el módulo canónico no se usa igualdad literal para declarar responsable", () => {
  const {Yk} = loadModule();
  Yk.init({worker:"https://api.yokup.com", projectIdLayout:true});
  Yk.setProyectos([{id:"yokup", name:"Yokup", primary_responsible:"OraculoMacMini"}]);
  // La fuente no puede contener un segundo criterio que contradiga la normativa.
  assert.doesNotMatch(missionsSource, /assignee\.toLowerCase\(\)\s*===\s*primary\.toLowerCase\(\)/);
});

test("rowHtml coloca el rótulo después de la identidad y dentro de Agente", () => {
  const {Yk} = loadModule();
  Yk.init({worker:"https://api.yokup.com", columnMode:"tasks", projectIdLayout:true});
  Yk.setProyectos([{id:"yokup", name:"Yokup", web:"https://www.yokup.com", primary_responsible:"OraculoMacMini"}]);
  const cell = agentCell(Yk.rowHtml({
    id:"FLT-CONTRACT", source:"fleet", subject:"Contrato de proyecto bajo agente",
    project:"yokup", project_name:"Yokup", assignee:"Oraculo", machine:"MacMini",
    status:"in_progress", created_at:Date.now(), priority:"alta",
  }));
  assert.ok(cell.indexOf('class="who"') >= 0, "primero se muestra la identidad del agente");
  assert.ok(cell.indexOf('class="mission-project-label') > cell.indexOf('class="who"'), "el proyecto queda debajo/después del agente");
  assert.doesNotMatch(cell, /<(?:a|select|input|button)\b/i);
});

test("las clases semánticas fijan verde responsable y amarillo colaborador", () => {
  assert.match(css, /\.mission-project-label\.project-responsible\s*\{[^}]*color:var\(--good(?:,[^)]+)?\)/);
  assert.match(css, /\.mission-project-label\.project-collaborator\s*\{[^}]*color:var\(--accent(?:,[^)]+)?\)/);
});
