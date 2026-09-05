// FLT-1494 · El bloque izquierdo del Running Man se lee como una frase:
// agente -> hora factual de inicio -> hora factual de fin.
//
// No basta con cambiar el orden visual por CSS. El DOM y el aria-label deben
// conservar el mismo orden para teclado y lector de pantalla, y los relojes
// deben tener marcadores semánticos estables para no confundir assignment_at
// con work_started_at en una regresión posterior.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {installRaceView} from "./highscore-race-test-support.mjs";

const html = fs.readFileSync(new URL("./highscore.html", import.meta.url), "utf8");
const stateCss = fs.readFileSync(new URL("./highscore-runner-state.css", import.meta.url), "utf8");
const identitySource = fs.readFileSync(new URL("./yk-agent-identity.js", import.meta.url), "utf8");
const identitySandbox = {};
vm.runInNewContext(identitySource, identitySandbox);
const raceHelperSource = fs.readFileSync(new URL("./highscore-race.js", import.meta.url), "utf8");
const raceHelperSandbox = { module:{ exports:{} }, exports:{} };
vm.runInNewContext(raceHelperSource, raceHelperSandbox);
const raceStart = html.indexOf("function claveAgenteCarrera(");
const raceEnd = html.indexOf("\n\n  function pintaFormula", raceStart);
const raceSource = html.slice(raceStart, raceEnd);

function renderRace(work) {
  const nodes = {
    refreshLanes: { innerHTML:"" },
    refreshRace: {
      attrs:{}, classes:{},
      setAttribute(name, value) { this.attrs[name] = String(value); },
      classList:{ toggle(name, active) { nodes.refreshRace.classes[name] = !!active; } },
    },
  };
  const context = vm.createContext({
    listaCache:[], listaCompletaCache:[],
    datos:{ trabajos:[work], trabajosAvailable:true, trabajosMode:work.state === "last_work" ? "recent" : "active",
      trabajosGeneratedAt:Number(work.work_started_at) + Number(work.elapsed_ms || 0), trabajosClientAt:0 },
    document:{ getElementById:(id) => nodes[id] },
    normaliza:(value) => String(value == null ? "" : value).trim(),
    esc:(value) => String(value == null ? "" : value)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;"),
    window:{ ykAgentIdentity:identitySandbox.ykAgentIdentity },
    YkHighscoreRace:raceHelperSandbox.module.exports,
    Number, String, Math, Date, Intl,
  });
  installRaceView(html, context);
  vm.runInContext(`${raceSource}\nactualizaCarreraPodio();`, context);
  return nodes.refreshLanes.innerHTML;
}

function fixture(state, endedAt) {
  const startedAt = Date.parse("2026-09-01T13:14:41.000Z");
  const assignmentAt = startedAt - 9 * 60_000;
  return {
    family_key:"niobemacmini", agent:"NiobeMacMini", executor:"SubNiobeMini",
    kind:"mission", title:"Última misión factual", state, reachable:true,
    assignment_at:assignmentAt, work_started_at:startedAt,
    work_progress_at:startedAt + 60_000, ended_at:endedAt || 0,
    elapsed_ms:endedAt ? endedAt - startedAt : 60_000,
    session_dedicated_ms:null, session_state:"unknown",
  };
}

function laneAria(rendered) {
  const open = rendered.match(/^<div class="refresh-lane [^>]+>/);
  assert.ok(open, "falta el carril generado");
  const aria = open[0].match(/aria-label="([^"]+)"/);
  assert.ok(aria, "el carril debe tener un nombre accesible");
  return aria[1];
}

function assertOrdered(haystack, needles, message) {
  let previous = -1;
  for (const needle of needles) {
    const current = haystack.indexOf(needle);
    assert.ok(current >= 0, `${message}: falta ${needle}`);
    assert.ok(current > previous, `${message}: ${needle} aparece fuera de orden`);
    previous = current;
  }
}

test("running genera DOM nombre -> pista -> bloque horario y lectura accesible factual", () => {
  const rendered = renderRace(fixture("running", 0));
  assertOrdered(rendered,
    ['data-race-role="agent"', 'class="refresh-lane-center"', 'class="refresh-timing"', 'data-race-time="start"', 'data-race-time="elapsed"'],
    "orden DOM de running");
  assertOrdered(laneAria(rendered),
    ["Responsable Niobe", "Hora de inicio", "Tiempo transcurrido"],
    "orden accesible de running");
  assert.match(rendered, /data-race-role="agent"[^>]*title="MacMini"[^>]*>NiobeMacMini<\/span>/,
    "el nombre canónico y la máquina permanecen identificables");
  assert.match(rendered, /data-race-time="start"[^>]*datetime="2026-09-01T13:14:41\.000Z"[^>]*>15:14:41<\/time>/,
    "inicio usa work_started_at y no assignment_at");
  assert.match(rendered, /data-race-time="elapsed"[^>]*data-work-state="running"[^>]*>00:01:00<\/strong>/,
    "un trabajo abierto usa ese hueco para su contador vivo");
  assert.doesNotMatch(rendered, /data-race-time="end"/,
    "un trabajo abierto no inventa hora de fin");
});

test("last_work conserva última misión y pone su fin después del inicio", () => {
  const endedAt = Date.parse("2026-09-01T13:42:09.000Z");
  const rendered = renderRace(fixture("last_work", endedAt));
  assertOrdered(rendered,
    ['data-race-role="agent"', 'class="refresh-lane-center"', 'class="refresh-timing"', 'data-race-time="start"', 'data-race-time="end"'],
    "orden DOM de last_work");
  assertOrdered(laneAria(rendered),
    ["Responsable Niobe", "Hora de inicio", "Hora de finalización"],
    "orden accesible de last_work");
  assert.match(rendered, /data-race-time="end"[^>]*datetime="2026-09-01T13:42:09\.000Z"[^>]*>15:42:09<\/time>/);
  assert.match(rendered, /class="refresh-mission-title">Última misión factual<\/span>/,
    "la última misión no desaparece al quedar gris");
});

test("last_work sin ended_at queda explícitamente desconocido y no fabrica epoch", () => {
  const rendered = renderRace(fixture("last_work", 0));
  assertOrdered(rendered,
    ['data-race-role="agent"', 'class="refresh-lane-center"', 'class="refresh-timing"', 'data-race-time="start"', 'data-race-time="end"'],
    "orden DOM sin ended_at");
  assert.match(rendered, /data-race-time="end"[^>]*>—<\/span>/);
  assert.doesNotMatch(rendered, /1970-01-01|datetime="[^"]+"[^>]*data-race-time="end"/,
    "sin ended_at no hay un instante factual que serializar");
});

test("el bloque ordenado se contrae sin desbordar en móvil", () => {
  const rules = (selector) => [...html.matchAll(new RegExp(
    selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{([^}]*)\\}", "g"
  ))].map((match) => match[1]).join(";");
  assert.match(rules(".refresh-lane"), /minmax\(0,1fr\)/,
    "la pista conserva una columna realmente contraíble");
  assert.match(rules(".refresh-agent-meta"), /min-width:0/,
    "el nombre puede encogerse dentro del grid");
  assert.match(rules(".refresh-timing"), /min-width:0[^}]*white-space:nowrap/,
    "el bloque horario se mantiene unido a la derecha");
  assert.match(rules(".refresh-agent"), /overflow:hidden[^}]*text-overflow:ellipsis/,
    "un nombre largo no ensancha la página");
  assert.match(html, /@media \(max-width:620px\)[\s\S]*?\.refresh-timing\{gap:2px/,
    "en móvil el bloque horario reduce su separación sin cambiar de lado");
});

test("último trabajo mantiene zancada gris estática", () => {
  assert.match(stateCss, /data-work-state="last_work"\] \.runner-standing[\s\S]*display:none!important/);
  assert.match(stateCss, /data-work-state="last_work"\] \.runner-run-a[\s\S]*display:block!important[\s\S]*animation:none!important/);
  assert.match(html, /data-work-state\]:not\(\[data-work-state="running"\]\) \.refresh-runner\{[\s\S]*--runner-skin:#b8c0c5/);
});
