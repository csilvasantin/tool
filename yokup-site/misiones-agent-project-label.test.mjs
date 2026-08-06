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

// Recorta la celda AGENTE contando llaves de <div>, no asumiendo qué celda va
// detrás: desde que AGENTE/PLATAFORMA pasó a primera columna (Carlos,
// 2026-08-05) cortar «hasta .cel est» se tragaba la fila entera.
function agentCell(html) {
  const start = html.indexOf('<div class="cel agc">');
  assert.ok(start >= 0, "la fila conserva una celda Agente separada");
  let nivel = 0;
  for (let i = start; i < html.length; i += 1) {
    if (html.startsWith("<div", i)) nivel += 1;
    else if (html.startsWith("</div>", i)) {
      nivel -= 1;
      if (nivel === 0) return html.slice(start, i + 6);
    }
  }
  throw new Error("celda Agente sin cerrar");
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

test("un proyecto heredado se pinta con asterisco y color de aviso", () => {
  // Carlos, 6-ago-2026: heredar la última declaración del agente evita perder
  // encargos, pero «podría darnos información falsa». Así que el rótulo heredado
  // NO puede parecerse al confirmado: color propio, asterisco y un título que
  // diga de qué día viene y que hay que fijarlo.
  const {Yk} = loadModule();
  Yk.init({worker:"https://api.yokup.com", columnMode:"tasks", projectIdLayout:true});
  Yk.setProyectos([{id:"yokup", name:"Yokup", primary_responsible:"OraculoMacMini"}]);
  const heredado = Yk.projectAgentLabelHtml({
    project:"yokup", project_name:"Yokup", assignee:"OraculoMacMini",
    project_inherited:1, project_inherited_from:"2026-08-05",
  });
  assert.match(heredado, /class="mission-project-label project-inherited"/);
  assert.match(heredado, /<span class="project-inherited-mark" aria-hidden="true">\*<\/span>/);
  assert.match(heredado, /HEREDADO de la declaración del 2026-08-05/);
  assert.match(heredado, /podría no ser el correcto/);
  // Ni verde ni amarillo: un dato sin confirmar no puede leerse como comprobado.
  assert.doesNotMatch(heredado, /project-responsible|project-collaborator/);
  // Confirmado explícitamente => vuelve al rótulo normal, sin asterisco.
  const confirmado = Yk.projectAgentLabelHtml({project:"yokup", project_name:"Yokup", assignee:"OraculoMacMini"});
  assert.doesNotMatch(confirmado, /project-inherited/);
  assert.match(css, /\.mission-project-label\.project-inherited\{[^}]*border-style:dashed/);
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
