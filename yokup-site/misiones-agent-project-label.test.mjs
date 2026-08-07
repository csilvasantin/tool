import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const [identitySource, missionsSource, css, normativa, page] = await Promise.all([
  "yk-agent-identity.js", "yk-misiones.js", "yk-misiones.css", "normativa.html", "misiones.html",
].map((name) => readFile(new URL(`./${name}`, import.meta.url), "utf8")));

function loadModule() {
  const windowObj = {};
  windowObj.window = windowObj;
  const context = vm.createContext({
    window:windowObj,
    document:{addEventListener() {}, querySelector:() => null},
    localStorage:{getItem:() => null, setItem() {}, removeItem() {}},
    Date, Math, JSON, Promise, RegExp, Object, Array, String, Number, Boolean,
    CustomEvent:function CustomEvent(type, init) { this.type=type; this.detail=init && init.detail; },
    setTimeout, clearTimeout, console,
  });
  vm.runInContext(identitySource, context);
  vm.runInContext(missionsSource, context);
  return windowObj.YkMisiones;
}

function cell(html, marker) {
  const start = html.indexOf(marker);
  assert.ok(start >= 0, `la fila conserva ${marker}`);
  let depth = 0;
  for (let i = start; i < html.length; i += 1) {
    if (html.startsWith("<div", i)) depth += 1;
    else if (html.startsWith("</div>", i)) {
      depth -= 1;
      if (depth === 0) return html.slice(start, i + 6);
    }
  }
  throw new Error(`celda sin cerrar: ${marker}`);
}

function missionRow() {
  const Yk = loadModule();
  Yk.init({worker:"https://api.yokup.com", columnMode:"tasks", projectIdLayout:true});
  Yk.setProyectos([{id:"yokup", name:"Yokup", web:"https://www.yokup.com"}]);
  return {Yk, html:Yk.rowHtml({
    id:"FLT-CONTRACT", source:"fleet", subject:"MISIÓN Yokup · Ajustar la cuadrícula",
    project:"yokup", project_name:"Yokup", assignee:"OraculoMacMini", machine:"MacMini",
    agent_runtime:"Codex", agent_host:"app", status:"in_progress",
    created_at:Date.now(), priority:"alta",
  })};
}

test("Agente/Plataforma conserva identidad, avatar y runtime pero no repite el proyecto", () => {
  const {html} = missionRow();
  const agent = cell(html, '<div class="cel agc">');
  assert.match(agent, /class="who(?: who-av)?"/);
  assert.match(agent, /OraculoMacMini/);
  assert.match(agent, /class="agent-surface"[^>]*>Codex · Desktop App<\/small>/);
  assert.match(missionsSource, /class="agava"/, "el renderer conserva el avatar cuando está configurado");
  assert.match(css, /\.agava\s*\{/, "el avatar mantiene su layout visual");
  assert.doesNotMatch(agent, /mission-project-label|Yokup|project-responsible|project-collaborator|project-inherited/);
});

test("el proyecto sigue visible una sola vez en la columna Misión", () => {
  const {html} = missionRow();
  const mission = cell(html, '<div class="mission-col">');
  assert.match(mission, /class="subj-project"[^>]*>Proyecto Yokup<\/div>/);
  assert.match(mission, />Ajustar la cuadrícula<\/div>/);
  assert.equal((html.match(/Proyecto Yokup/g) || []).length, 1);
});

test("se elimina el contrato muerto del chip sin alterar el layout responsive del agente", () => {
  const {Yk} = missionRow();
  assert.equal(Yk.projectAgentLabelHtml, undefined);
  assert.doesNotMatch(missionsSource, /projectAgentLabelHtml|mission-project-label/);
  assert.doesNotMatch(css, /mission-project-label|project-responsible|project-collaborator|project-inherited/);
  assert.doesNotMatch(page, /mission-project-label/);
  assert.match(css, /\.hd\.project-id-layout \.cel\.agc\s*\{[^}]*flex-direction:column/);
  assert.match(css, /@media\(max-width:720px\)[\s\S]*\.hd\.project-id-layout/);
});

test("la normativa asigna el proyecto a Misión y reserva Agente/Plataforma a su identidad", () => {
  assert.match(normativa, /columna <b>Misión<\/b>[\s\S]*Proyecto/);
  assert.match(normativa, /Agente\/Plataforma[\s\S]*identidad, avatar y runtime\/plataforma/);
  assert.match(normativa, /no se repite[\s\S]*proyecto/);
  assert.doesNotMatch(normativa, /proyecto asignado muestra su nombre <b>debajo del agente<\/b>/);
});
