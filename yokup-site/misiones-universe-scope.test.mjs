import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const html = await readFile(new URL("./misiones.html", import.meta.url), "utf8");
const missions = await readFile(new URL("./yk-misiones.js", import.meta.url), "utf8");
const frame = await readFile(new URL("./yk-frame.js", import.meta.url), "utf8");

test("/misiones abre por defecto el día actual de Madrid", () => {
  assert.match(html, /function madridDayKey\(value\)/);
  assert.match(html, /timeZone:"Europe\/Madrid"/);
  assert.match(html, /function madridToday\(\)\{return madridDayKey\(Date\.now\(\)\);\}/);
  assert.match(html, /CAB\.setDay\(madridToday\(\)\)/, "hoy Madrid es el alcance inicial");
  assert.match(html, /if\(day\)path\+="&day="/, "la fecha inicial viaja al servidor");
  assert.match(html, /if\(projectId\)path\+="&project_id="/, "el proyecto comparte el mismo contrato servidor");
  assert.match(html, /d\.rows\|\|d\.tickets/, "consume rows y conserva compatibilidad legacy");
  assert.match(html, /dayFilteredByServer&&d\.visible_counts\?d\.visible_counts:visibleCountsFallback\(rawTickets\)/,
    "los chips usan exactamente el mismo día incluso durante rollout legacy");
});

// La franja «Tablero · fecha · todos los proyectos · N misiones · M filas
// agrupadas» se RETIRÓ (Carlos, 2026-08-07: «no pinta nada»). Decía lo que ya
// dicen el selector de fecha del cabezal, los chips de estado y el propio
// tablero, y gastaba una línea entera en repetirlo. Lo que NO puede perderse con
// ella es la salida del filtro de día: sin ninguna forma de volver al histórico,
// el tablero se quedaría clavado en hoy.
test("la franja de alcance ya no existe, ni su marcado ni su renderer ni sus estilos", () => {
  assert.doesNotMatch(html, /missionScopeSummary/, "el elemento se fue");
  assert.doesNotMatch(html, /paintMissionScope/, "y su renderer, incluida la llamada en load()");
  assert.doesNotMatch(html, /mission-scope-summary|scope-clear|scope-global/, "y sus estilos, sin reglas huérfanas");
});

test("quitar la franja no encierra el tablero en el día de hoy", () => {
  // el filtro sigue siendo el date del cabezal, que ya anuncia que vaciarlo lo quita
  assert.match(html, /aria-label","Filtrar misiones por fecha; sin fecha se muestran todas"/);
  assert.match(html, /vac[ií]o = todas las fechas/, "el tooltip del selector explica la salida");
  // y el vacío no puede seguir mandando a un botón que ya no está
  assert.doesNotMatch(html, /pulsa «Ver todas las fechas»/, "no se manda a un control retirado");
  assert.match(html, /vac[ií]a la fecha de arriba para ver todas/, "el vacío dice dónde se quita el filtro");
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
  const result = await ctx.fetchMissionUniverse("fleet", "2026-08-07", "");
  assert.deepEqual(Array.from(result.rows, row => row.id), ["FLT-1","FLT-2"]);
  assert.equal(result.visible_counts.in_progress, 1);
  assert.equal(result.visible_counts.pending, 1);
  assert.equal(result.visible_counts.total, 2);
  assert.match(calls[0], /limit=1000&offset=0&day=2026-08-07$/);
  assert.match(calls[1], /limit=1000&offset=1&day=2026-08-07$/);
  assert.ok(calls.every(url => !url.includes("&project_id=")));
});

test("la clave diaria es Europe/Madrid en ambos cambios de horario", () => {
  const helper = html.match(/function madridDayKey\(value\)\{([\s\S]*?)\n\}/);
  assert.ok(helper, "se encontró madridDayKey");
  const ctx = vm.createContext({Intl, Date, Number, String, Object});
  vm.runInContext(`function madridDayKey(value){${helper[1]}\n};globalThis.madridDayKey=madridDayKey`, ctx);

  assert.equal(ctx.madridDayKey(Date.UTC(2026, 2, 28, 23, 30)), "2026-03-29", "CET antes del salto");
  assert.equal(ctx.madridDayKey(Date.UTC(2026, 6, 31, 22, 30)), "2026-08-01", "CEST en verano");
});
