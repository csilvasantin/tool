import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const html = await readFile(new URL("./misiones.html", import.meta.url), "utf8");
const missions = await readFile(new URL("./yk-misiones.js", import.meta.url), "utf8");
const frame = await readFile(new URL("./yk-frame.js", import.meta.url), "utf8");

test("/misiones abre el mismo universo global que el tooltip", () => {
  assert.match(html, /CAB\.setDay\(""\)/, "sin fecha explícita se consulta todo el backlog");
  assert.doesNotMatch(html, /CAB\.setDay\(d\.getFullYear/, "no fuerza hoy al montar");
  assert.match(html, /if\(day\)path\+="&day="/, "la fecha sólo viaja cuando el usuario la elige");
  assert.match(html, /if\(projectId\)path\+="&project_id="/, "el proyecto comparte el mismo contrato servidor");
  assert.match(html, /d\.rows\|\|d\.tickets/, "consume rows y conserva compatibilidad legacy");
  assert.match(html, /d\.visible_counts\|\|visibleCountsFallback/, "los chips usan el universo visible del servidor");
});

test("el alcance visible es accesible y conserva acción táctil en móvil", () => {
  assert.match(html, /id="missionScopeSummary" role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /aria-label","Filtrar misiones por fecha; sin fecha se muestran todas"/);
  assert.match(html, /@media\(max-width:560px\)[^{]*\{[^}]*mission-scope-summary/s);
  assert.match(html, /scope-clear\{min-height:32px\}/);
});

test("tooltip MISIONES declara y desglosa todo el backlog", () => {
  assert.match(frame, /MISIONES"\?" · TODO EL BACKLOG"/);
  assert.match(frame, /\["no concluidas",mn,""\]/);
  assert.match(frame, /\["sin asignar",mu,""\]/);
  assert.match(frame, /Resumen global · todo el backlog · todas las fechas y proyectos\./);
});

test("visible_state prevalece sobre el status técnico", () => {
  const body = missions.match(/  function estadoDe\(t\) \{([\s\S]*?)\n  \}\n  \/\/ Un único criterio/);
  assert.ok(body, "se encontró estadoDe");
  const ctx = vm.createContext({});
  vm.runInContext(`function estadoDe(t){${body[1]}\n};globalThis.estadoDe=estadoDe`, ctx);
  assert.equal(ctx.estadoDe({status:"in_progress", visible_state:"unconcluded"}).l, "No concluida");
  assert.equal(ctx.estadoDe({status:"open", visible_state:"in_progress"}).l, "En curso");
  assert.equal(ctx.estadoDe({status:"in_progress", visible_state:"pending"}).l, "Pendiente");
});

test("la agrupación no oculta estados visibles distintos", () => {
  assert.match(html, /norm\(t\.assignee\)\+"\|\|"\+String\(t\.visible_state\|\|""\)/);
});

test("fetchMissionUniverse pagina hasta agotar el universo sin truncar a 300", async () => {
  const helpers = html.match(/const VISIBLE_KEYS=([\s\S]*?)\nasync function load\(\)/);
  assert.ok(helpers, "se encontraron helpers del universo");
  const calls = [];
  const pages = [
    {rows:[{id:"FLT-1",visible_state:"in_progress"}], visible_counts:{in_progress:1,total:1}, universe:{total:2,has_more:true}},
    {rows:[{id:"FLT-2",visible_state:"pending"}], visible_counts:{pending:1,total:1}, universe:{total:2,has_more:false}}
  ];
  const ctx = vm.createContext({encodeURIComponent, Set, Object, Array, String, Number,
    ykf: async path => {calls.push(path); const data=pages.shift(); return {ok:true,status:200,json:async()=>data};}});
  vm.runInContext(`const VISIBLE_KEYS=${helpers[1]}\nglobalThis.fetchMissionUniverse=fetchMissionUniverse`, ctx);
  const result = await ctx.fetchMissionUniverse("fleet", "", "");
  assert.deepEqual(Array.from(result.rows, row => row.id), ["FLT-1","FLT-2"]);
  assert.equal(result.visible_counts.in_progress, 1);
  assert.equal(result.visible_counts.pending, 1);
  assert.equal(result.visible_counts.total, 2);
  assert.match(calls[0], /limit=1000&offset=0$/);
  assert.match(calls[1], /limit=1000&offset=1$/);
  assert.ok(calls.every(url => !url.includes("&day=") && !url.includes("&project_id=")));
});
