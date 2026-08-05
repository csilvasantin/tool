import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const missionsSource = await readFile(new URL("./yk-misiones.js", import.meta.url), "utf8");
const headerSource = await readFile(new URL("./yk-cabezal.js", import.meta.url), "utf8");
const tasksPage = await readFile(new URL("./tareas.html", import.meta.url), "utf8");

function loadMissions() {
  const windowObj = {};
  const context = vm.createContext({
    window: windowObj,
    document: {addEventListener() {}, querySelector: () => null},
    localStorage: {getItem: () => null, setItem() {}, removeItem() {}},
    Date, Math, JSON, Promise, RegExp, Object, Array, String, Number, Boolean,
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; },
    setTimeout, clearTimeout, console
  });
  vm.runInContext(missionsSource, context);
  return windowObj.YkMisiones;
}

test("una misión pendiente no se anuncia ni cronometra como en curso", () => {
  const Yk = loadMissions();
  Yk.init({worker:"https://api.yokup.com", columnMode:"tasks", projectIdLayout:true});
  const tasks = [{code:"a",status:"pending",title:"Tarea pendiente"}];
  const html = Yk.rowHtml({
    id:"FLT-PENDING", source:"fleet", role:"standalone-task", subject:"Tarea pendiente", status:"open",
    assignee:"OraculoMBAPlata", machine:"MacBookAirPlata", created_at:Date.now()-60_000,
    priority:"normal", _tasks:tasks, _prog:Yk.tercios(tasks,true)
  });
  assert.match(html, />Pendiente<\/span>/);
  assert.match(html, />0\/1</);
  assert.doesNotMatch(html, />0\/3|>0\/9|Tarea B|Tarea C/);
  assert.doesNotMatch(html, /⏳ en curso|restantes|yk-deadline/);
});

test("una misión iniciada conserva reloj y estado en curso", () => {
  const Yk = loadMissions();
  Yk.init({worker:"https://api.yokup.com", columnMode:"tasks", projectIdLayout:true});
  const html = Yk.rowHtml({
    id:"FLT-RUNNING", source:"fleet", subject:"Tarea activa", status:"in_progress",
    assignee:"OraculoMBAPlata", machine:"MacBookAirPlata", created_at:Date.now()-60_000,
    priority:"normal", _tasks:[{code:"a",status:"in_progress"}]
  });
  assert.match(html, /⏳ en curso/);
  assert.match(html, /restantes/);
});

test("la página Tareas encarga tareas sueltas y no rotula crear misión", () => {
  assert.match(tasksPage, /createKind:"task"/);
  assert.match(tasksPage, /Nueva tarea suelta/);
  assert.match(headerSource, /\[TAREA SUELTA\]/);
  assert.match(headerSource, /taskMode \? "tarea" : "misión"/);
  assert.match(headerSource, /taskMode \? "yokup-tareas" : "yokup-misiones"/);
});
