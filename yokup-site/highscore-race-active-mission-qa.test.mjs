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
const raceStart = html.indexOf("function agenteDeMision(");
const raceEnd = html.indexOf("\n\n  function pintaFormula", raceStart);
const raceSource = html.slice(raceStart, raceEnd);
const cycleStart = html.indexOf("var REFRESCO_MS");
const cycleEnd = html.indexOf("\n  document.getElementById(\"btnSonido\")", cycleStart);
const cycleSource = html.slice(cycleStart, cycleEnd);

function renderRace(rows, missions, extras = []) {
  const nodes = {
    refreshLanes: { innerHTML: "" },
    refreshRace: {
      attrs: {}, classes: {},
      setAttribute(name, value) { this.attrs[name] = String(value); },
      classList: { toggle(name, active) { nodes.refreshRace.classes[name] = !!active; } },
    },
  };
  const context = vm.createContext({
    listaCache: rows,
    RACE_EXTRAS: new Set(extras),
    datos: { misiones: missions || [], presencia: [] },
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
    empty: nodes.refreshRace.classes.empty === true,
  };
}

test("sin misión activa aparece un único corredor neutro, sin barra, dorsal ni agente", () => {
  const rows=[{agente:"OraculoMacMini",posicion:1,total:975,vivo:true}];
  const race=renderRace(rows,[]);
  assert.equal(race.lanes,1);
  assert.equal(race.empty,true);
  assert.equal((race.html.match(/data-race-role="runner"/g)||[]).length,1);
  assert.match(race.html,/class="refresh-lane refresh-lane-empty"/);
  assert.match(race.html,/SIN MISIONES ACTIVAS/);
  assert.doesNotMatch(race.html,/OraculoMacMini|refresh-fill|refresh-place|refresh-finish/);
  assert.deepEqual(rows,[{agente:"OraculoMacMini",posicion:1,total:975,vivo:true}],
    "la carrera no puede retirar ni mutar la fila del ranking");
});

test("el mismo agente crea una única calle cuando tiene misión activa propia", () => {
  const race=renderRace([{agente:"OraculoMacMini",posicion:1,total:975,vivo:true}],[{
    assignee:"OraculoMini",loc:"Mac Mini",status:"in_progress",subject:"Mejorar Highscore",
  }]);
  assert.equal(race.lanes,1);
  assert.equal(race.empty,false);
  assert.equal((race.html.match(/class="refresh-lane /g)||[]).length,1);
  assert.equal((race.html.match(/data-race-role="runner"/g)||[]).length,1);
  assert.match(race.html,/refresh-place-finish[^>]*>1<\/span>/);
});

test("una misión del mismo alias base pero de otro equipo no se cruza", () => {
  const rows=[
    {agente:"OraculoMacMini",posicion:1,total:975,vivo:true},
    {agente:"NeoMacMini",posicion:2,total:800,vivo:true},
  ];
  const missions=[
    {assignee:"OraculoMini",loc:"MacBook Pro 16",status:"in_progress",subject:"Misión ajena"},
    {assignee:"Neo",loc:"Mac Mini",status:"in_progress",subject:"Misión propia"},
  ];
  const race=renderRace(rows,missions);
  assert.equal(race.lanes,1);
  assert.match(race.html,/NeoMacMini/);
  assert.doesNotMatch(race.html,/OraculoMacMini|Misión ajena/);
});

test("un candidato sin resolución exacta cae en el corredor neutro, no en una calle huérfana", () => {
  // El helper compartido elimina diacríticos y deja pasar esta fila; la resolución
  // exacta posterior no encuentra su misión. El fallback debe seguir siendo neutro,
  // sin apropiarse del nombre, puesto ni progreso de ese agente.
  const race=renderRace([{agente:"OráculoMacMini",posicion:1,total:975,vivo:true}],[{
    assignee:"OraculoMini",loc:"Mac Mini",status:"in_progress",subject:"Misión activa",
  }]);
  assert.equal(race.lanes,1);
  assert.equal(race.empty,true);
  assert.equal((race.html.match(/data-race-role="runner"/g)||[]).length,1);
  assert.match(race.html,/refresh-lane-empty/);
  assert.match(race.html,/SIN MISIONES ACTIVAS/);
  assert.doesNotMatch(race.html,/OráculoMacMini|refresh-fill|refresh-place|refresh-finish/);
});

test("descartar una calle huérfana renumera desde uno a los corredores válidos", () => {
  const race=renderRace([
    {agente:"OráculoMacMini",posicion:1,total:975,vivo:true},
    {agente:"NeoMacMini",posicion:2,total:800,vivo:true},
  ],[
    {assignee:"OraculoMini",loc:"Mac Mini",status:"in_progress",subject:"No enlaza exacto"},
    {assignee:"Neo",loc:"Mac Mini",status:"in_progress",subject:"Sí enlaza"},
  ]);
  assert.equal(race.lanes,1);
  assert.match(race.html,/data-place="1"[^>]*data-agent-key="neomacmini"/);
  assert.doesNotMatch(race.html,/data-place="2"|OráculoMacMini|No enlaza exacto/);
});

test("la elegibilidad de carrera es aditiva y no filtra la tabla del ranking", () => {
  assert.match(html,/listaCache = aplicaAgentScope\(listaCompletaCache \|\| \[\]\);\s*pintaPodio\(listaCache\.slice\(0, 3\)\); pintaTabla\(listaVisible\(listaCache\)\); actualizaCarreraPodio\(\)/);
  assert.match(html,/var corredores = filasConMisionEnCurso\(listaCache \|\| \[\], activas\)\.map/);
});

test("sólo corren agentes con misión en curso y latido reciente", () => {
  const rows = Array.from({ length: 6 }, (_, i) => ({
    agente: `Agente-${i + 1}`, posicion: i + 1, total: 100 - i, vivo: i !== 4,
  }));
  const missions = [1, 3, 5].map((index) => ({assignee:`Agente-${index}`,status:"in_progress",subject:`Misión ${index}`}));
  const race = renderRace(rows, missions);
  assert.equal(race.lanes, 2);
  for (const index of [1, 3]) assert.match(race.html, new RegExp(`Agente-${index}`));
  for (const index of [2, 4, 5, 6]) assert.doesNotMatch(race.html, new RegExp(`Agente-${index}`));
  assert.doesNotMatch(raceSource, /slice\(0,\s*3\)/);
});

test("los corredores extra conservan una clave y carril inequívocos", () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({
    agente: `Persona-${i + 1}`, posicion: i + 1, total: 20 - i, vivo: true,
  }));
  const race = renderRace(rows, rows.map((row) => ({assignee:row.agente,status:"in_progress",subject:"Trabajo"})),
    ["persona4", "persona5"]);
  const keys = [...race.html.matchAll(/data-agent-key="([^"]+)"/g)].map((m) => m[1]);
  const lanes = [...race.html.matchAll(/data-place="(\d+)"/g)].map((m) => Number(m[1]));
  assert.equal(keys.length, 5);
  assert.equal(new Set(keys).size, 5);
  assert.deepEqual(lanes, [1, 2, 3, 4, 5]);
});

test("el dorsal se ve UNA vez, en la meta: en la salida no significa nada", () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({
    agente: `Dorsal-${i + 1}`, posicion: i + 1, total: 20 - i, vivo: true,
  }));
  const race = renderRace(rows, rows.map((row) => ({assignee:row.agente,status:"in_progress",subject:"Trabajo"})),
    ["dorsal4", "dorsal5"]);
  const finishes = [...race.html.matchAll(/refresh-place-finish" aria-hidden="true">(\d+)<\/span>/g)].map((match) => Number(match[1]));
  assert.deepEqual(finishes, [1, 2, 3, 4, 5]);
  // El número de salida se retiró (Carlos, 3-ago-2026): repetía en el arranque un
  // puesto que aún no se ha corrido, y competía visualmente con la misión.
  assert.doesNotMatch(race.html, /refresh-place-start/);
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
