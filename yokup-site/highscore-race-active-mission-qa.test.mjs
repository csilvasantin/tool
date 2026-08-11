import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("./highscore.html", import.meta.url), "utf8");
const identitySource = fs.readFileSync(new URL("./yk-agent-identity.js", import.meta.url), "utf8");
const identitySandbox = {};
vm.runInNewContext(identitySource, identitySandbox);
const raceHelperSource = fs.readFileSync(new URL("./highscore-race.js", import.meta.url), "utf8");
const raceHelperSandbox = { module:{exports:{}}, exports:{} };
vm.runInNewContext(raceHelperSource, raceHelperSandbox);
const raceStart = html.indexOf("function claveAgenteCarrera(");
const raceEnd = html.indexOf("\n\n  function pintaFormula", raceStart);
const raceSource = html.slice(raceStart, raceEnd);
const cycleStart = html.indexOf("var REFRESCO_MS");
const cycleEnd = html.indexOf("\n  document.getElementById(\"btnSonido\")", cycleStart);
const cycleSource = html.slice(cycleStart, cycleEnd);

function renderRace(fullRows, work, scopedRows = fullRows, available = true) {
  const nodes = {
    refreshLanes: { innerHTML: "" },
    refreshRace: {
      attrs: {}, classes: {},
      setAttribute(name, value) { this.attrs[name] = String(value); },
      classList: { toggle(name, active) { nodes.refreshRace.classes[name] = !!active; } },
    },
  };
  const context = vm.createContext({
    listaCache: scopedRows,
    listaCompletaCache: fullRows,
    datos: { trabajos: work || [], trabajosAvailable: available },
    document: { getElementById: (id) => nodes[id] },
    normaliza: (value) => String(value == null ? "" : value).trim(),
    esc: (value) => String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"),
    window: { ykAgentIdentity: identitySandbox.ykAgentIdentity },
    YkHighscoreRace: raceHelperSandbox.module.exports,
    Number, String, Math, Date,
  });
  vm.runInContext(`${raceSource}\nactualizaCarreraPodio();`, context);
  return {
    html: nodes.refreshLanes.innerHTML,
    lanes: Number(nodes.refreshRace.attrs["data-lanes"] || 0),
    participants: Number(nodes.refreshRace.attrs["data-participants"] || 0),
    empty: nodes.refreshRace.classes.empty === true,
  };
}

const work = (agent, executor=agent, kind="mission", title="Trabajo activo", active_at=1) => ({
  family_key:agent.toLowerCase(), agent, executor, kind, title, active_at,
});

test("sin trabajo factual aparece una calle visual pero declara cero participantes", () => {
  const rows=[{agente:"OraculoMacMini",posicion:1,total:975,vivo:true}];
  const race=renderRace(rows,[]);
  assert.equal(race.lanes,1);
  assert.equal(race.participants,0);
  assert.equal(race.empty,true);
  assert.equal((race.html.match(/data-race-role="runner"/g)||[]).length,1);
  assert.match(race.html,/class="refresh-lane refresh-lane-empty"/);
  assert.match(race.html,/SIN TRABAJO ACTIVO/);
  assert.doesNotMatch(race.html,/OraculoMacMini|refresh-fill|refresh-place|refresh-finish/);
  assert.deepEqual(rows,[{agente:"OraculoMacMini",posicion:1,total:975,vivo:true}],
    "la carrera no puede retirar ni mutar la fila del ranking");
});

test("un participante factual crea una única calle", () => {
  const race=renderRace([{agente:"OraculoMacMini",posicion:1,total:975,vivo:true}],
    [work("OraculoMacMini","SubOraculoMacMini","task","Mejorar Highscore")]);
  assert.equal(race.lanes,1);
  assert.equal(race.participants,1);
  assert.equal(race.empty,false);
  assert.equal((race.html.match(/class="refresh-lane /g)||[]).length,1);
  assert.equal((race.html.match(/data-race-role="runner"/g)||[]).length,1);
  assert.match(race.html,/refresh-place-track[^>]*>1<\/span>/);
  assert.match(race.html,/SubOraculoMacMini/);
});

test("la carrera factual es independiente del filtro del ranking", () => {
  assert.match(html,/listaCache = aplicaAgentScope\(listaCompletaCache \|\| \[\]\);\s*pintaPodio\(listaCache\.slice\(0, 3\)\); pintaTabla\(listaVisible\(listaCache\)\); actualizaCarreraPodio\(\)/);
  assert.match(html,/trabajos = trabajosEnCurso\(\), completas = listaCompletaCache \|\| \[\]/);
});

test("cuatro trabajan aunque sólo dos estén seleccionados y con latido", () => {
  const full = [
    {agente:"MorfeoMacMini",posicion:1,total:100,vivo:true},
    {agente:"NeoMBP14",posicion:2,total:90,vivo:true},
  ];
  const jobs=["MorfeoMacMini","NeoMBP14","OraculoMacMini","TrinityMBP14"].map((name,i)=>work(name,`Sub${name}`,"task",`Trabajo ${i+1}`,i+1));
  const race = renderRace(full,jobs,[]);
  const keys = [...race.html.matchAll(/data-agent-key="([^"]+)"/g)].map((m) => m[1]);
  const lanes = [...race.html.matchAll(/data-place="(\d+)"/g)].map((m) => Number(m[1]));
  assert.equal(race.participants,4);
  assert.equal(keys.length,4);
  assert.equal(new Set(keys).size,4);
  assert.deepEqual(lanes,[1,2,3,4]);
  for(const name of ["MorfeoMacMini","NeoMBP14","OraculoMacMini","TrinityMBP14"]) assert.match(race.html,new RegExp(name));
  assert.equal((race.html.match(/without-heartbeat/g)||[]).length,2);
});

test("el dorsal se pinta una vez por cada participante sin tope", () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({
    agente: `Dorsal-${i + 1}`, posicion: i + 1, total: 20 - i, vivo: true,
  }));
  const race = renderRace(rows,rows.map(row=>work(row.agente)));
  const ground = [...race.html.matchAll(/refresh-place-track" aria-hidden="true">(\d+)<\/span>/g)].map((match) => Number(match[1]));
  assert.deepEqual(ground, [1, 2, 3, 4, 5]);
  assert.doesNotMatch(race.html, /refresh-place-(?:start|finish)/);
});

test("READY SET GO aparece sólo en la pista central", () => {
  const rows = Array.from({ length: 3 }, (_, i) => ({agente:`Centro-${i+1}`,posicion:i+1,total:20-i,vivo:true}));
  const race = renderRace(rows, rows.map((row) => work(row.agente)));
  const lanes = race.html.split('<div class="refresh-lane ').slice(1);
  assert.equal((race.html.match(/class="race-call"/g)||[]).length, 1);
  assert.doesNotMatch(lanes[0], /class="race-call"/);
  assert.match(lanes[1], /class="race-call"/);
  assert.doesNotMatch(lanes[2], /class="race-call"/);
  const one = renderRace(rows.slice(0,1), [work("Centro-1")]);
  assert.equal((one.html.match(/class="race-call"/g)||[]).length, 1);
});

test("hay corredores negro y blanco, ambos con bigote pixelado", () => {
  assert.match(html, /runner-(?:skin|variant)-(?:black|dark)/i);
  assert.match(html, /runner-(?:skin|variant)-(?:white|light)/i);
  assert.match(html, /runner-(?:mustache|moustache)|bigote/i);
  assert.match(raceSource, /(?:black|dark)/i);
  assert.match(raceSource, /(?:white|light)/i);
});

test("en meta sólo el ganador levanta el brazo y los demás se rascan la cabeza", () => {
  assert.match(html, /id="runnerWinner"/);
  assert.match(html, /id="runnerLoser"/);
  assert.match(raceSource, /runnerWinner/);
  assert.match(raceSource, /runnerLoser/);
  assert.match(cycleSource, /winner|ganador/i);
  assert.match(cycleSource, /loser|perdedor/i);
});

test("la carrera conserva accesibilidad y reduce movimiento de verdad", () => {
  assert.match(html, /prefers-reduced-motion:\s*reduce/);
  assert.match(cycleSource, /matchMedia\([^)]*prefers-reduced-motion:\s*reduce/);
  assert.match(html, /id="refreshLanes"[^>]*role="list"/);
  assert.match(raceSource, /role="listitem"/);
  assert.match(raceSource, /aria-label=/);
  assert.match(raceSource, /data-agent-key=/);
  assert.doesNotMatch(html, /aria-hidden="true"[^>]*data-race-role="agent"/);
  const resumeStart = cycleSource.indexOf("carreraPausada = false;");
  const resumeEnd = cycleSource.indexOf("function iniciaCarrera", resumeStart);
  const resumeBranch = cycleSource.slice(resumeStart, resumeEnd);
  assert.match(resumeBranch, /REDUCE_MOTION/,
    "reanudar tampoco puede reactivar el bucle RAF bajo reduced-motion");
});

test("la música concurrente no se reinicia ni se pausa durante la carrera", () => {
  assert.match(html, /bgm\.loop\s*=\s*true/);
  assert.match(html, /function fanfarriaPodio/);
  assert.doesNotMatch(cycleSource, /bgm\.(?:pause|load)|aseguraBgm\(|activarSonido\(|desactivarSonido\(/);
});
