import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {installRaceView, htmlFunction} from "./highscore-race-test-support.mjs";

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

function renderRace(fullRows, work, scopedRows = null, available = true, mode = "active") {
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
    datos: { trabajos: work || [], trabajosAvailable: available, trabajosMode: available ? mode : "unavailable" },
    document: { getElementById: (id) => nodes[id] },
    normaliza: (value) => String(value == null ? "" : value).trim(),
    esc: (value) => String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"),
    window: { ykAgentIdentity: identitySandbox.ykAgentIdentity },
    YkHighscoreRace: raceHelperSandbox.module.exports,
    Number, String, Math, Date, Intl,
  });
  installRaceView(html, context, scopedRows);
  vm.runInContext(`${raceSource}\nactualizaCarreraPodio();`, context);
  return {
    html: nodes.refreshLanes.innerHTML,
    lanes: Number(nodes.refreshRace.attrs["data-lanes"] || 0),
    participants: Number(nodes.refreshRace.attrs["data-participants"] || 0),
    empty: nodes.refreshRace.classes.empty === true,
  };
}

// active_at por defecto = AHORA. Antes era 1 (1-ene-1970), que servía mientras la
// marca sólo desempataba; desde que decide si el corredor corre, un 1 convierte a
// todos los fixtures en trabajo parado y las pruebas dejarían de comprobar lo suyo.
const work = (agent, executor=agent, kind="mission", title="Trabajo activo", active_at=Date.now(), state="running") => ({
  family_key:agent.toLowerCase(), agent, executor, kind, title, active_at,
  work_started_at:active_at-30*60*1000,work_progress_at:active_at,elapsed_ms:30*60*1000,state,
});

test("sin trabajo factual aparece una calle visual pero declara cero participantes", () => {
  const rows=[{agente:"OraculoMacMini",posicion:1,total:975,vivo:true}];
  const race=renderRace(rows,[]);
  assert.equal(race.lanes,1);
  assert.equal(race.participants,0);
  assert.equal(race.empty,true);
  assert.equal((race.html.match(/data-race-role="runner"/g)||[]).length,0);
  assert.match(race.html,/class="refresh-lane refresh-lane-empty"/);
  assert.match(race.html,/SIN TRABAJO VERIFICADO/);
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
  assert.doesNotMatch(race.html,/refresh-place|place-revealed/);
  assert.match(race.html,/SubOraculoMacMini/);
});

test("sin running muestra últimos trabajos B/N con hora de finalización y zancada quieta", () => {
  const ended=Date.now()-60_000;
  const recent=["OraculoMacMini","MorfeoMacMini","TrinityMBP16"].map((agent,index)=>({
    ...work(agent,agent,"mission",`Último ${index+1}`,ended-index*60_000,"last_work"),
    ended_at:ended-index*60_000,elapsed_ms:(index+1)*30*60_000,
  }));
  const race=renderRace([],recent,null,true,"recent");
  assert.equal(race.participants,3);
  assert.equal((race.html.match(/refresh-lane-last/g)||[]).length,3);
  assert.equal((race.html.match(/data-race-role="runner"/g)||[]).length,3);
  assert.equal((race.html.match(/class="runner-run-a"/g)||[]).length,3);
  assert.equal((race.html.match(/data-race-time="end"/g)||[]).length,3);
  assert.equal((race.html.match(/class="refresh-elapsed"/g)||[]).length,0);
  assert.doesNotMatch(race.html,/>FINALIZADO<|>EN CURSO</);
});

test("fallo del endpoint borra la lectura anterior y declara no disponible", () => {
  const race=renderRace([],[],[],false,"unavailable");
  assert.equal(race.participants,0); assert.match(race.html,/TRABAJO NO DISPONIBLE/);
  const state=vm.createContext({datos:{trabajos:[{agent:"Old"}],trabajosAvailable:true},performance:{now:()=>0},normaliza:v=>String(v||"")});
  vm.runInContext(htmlFunction(html,"hsApplyWorkSnapshot"),state);state.hsApplyWorkSnapshot(null);
  assert.equal(state.datos.trabajosAvailable,false);assert.equal(state.datos.trabajos.length,0);
  assert.match(html,/No se pudo consultar el trabajo registrado/);
  assert.doesNotMatch(html,/se conserva la última lectura/);
});

test("la carrera factual comparte el filtro del ranking", () => {
  // El segundo argumento es el sumador de la flota (15-ago-2026) y sale de la
  // MISMA listaCache: el podio y su total siguen colgando del ranking, no de
  // la carrera, que es lo que este test protege.
  assert.match(html,/listaCache = aplicaAgentScope\(listaCompletaCache \|\| \[\]\);\s*pintaRecordDiario\(\);\s*pintaPodio\(listaCache\.slice\(0, 3\), listaCache\); pintaTabla\(listaVisible\(listaCache\)\); actualizaCarreraPodio\(\)/);
  assert.match(html,/completas=listaVisible\(aplicaAgentScope\(listaCompletaCache\|\|\[\]\)\)/);
});

test("el scope manual muestra los mismos dos agentes en ranking y carrera", () => {
  const full=["MorfeoMacMini","NeoMBP14","OraculoMacMini","TrinityMBP14"].map((agente,i)=>({agente,posicion:i+1,total:100-i,vivo:true}));
  const jobs=full.map(row=>work(row.agente,`Sub${row.agente}`,"task","Trabajo"));
  const race=renderRace(full,jobs,full.slice(0,2));
  const keys=[...race.html.matchAll(/data-agent-key="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(race.participants,2);
  assert.deepEqual(keys,["morfeomacmini","neombp14"]);
  assert.equal(new Set(keys).size,2);
  assert.doesNotMatch(race.html,/data-agent-key="(?:oraculomacmini|trinitymbp14)"/);
  assert.equal(renderRace(full,jobs,[]).participants,0,"selección vacía no recupera corredores excluidos");
});

// CONTRATO CAMBIADO el 12-ago-2026 por orden de Carlos. Antes esta prueba exigía
// que un trabajo stale rescatado por snapshot se rotulara «proceso verificado»:
// cierto sobre el PROCESO y engañoso sobre el TRABAJO. Con ella en verde,
// NeoMBP14 salía corriendo con su tarea llevando 330 minutos sin tocarla y
// TrinityMBP14 499. «La información tiene que ser veraz: podrían llegar a
// aparecer, pero al correr no debería mostrar que están haciendo algo porque no
// lo están haciendo». Aparecer, sí; afirmar, no.
test("un participante con el proceso vivo pero el trabajo parado queda ámbar y no compite", () => {
  const item=work("NeoMBP14","SubNeoMBP14","task","Trabajo stale",Date.now()-330*60*1000,"assigned_stale");
  item.presence_at=Date.now();
  const race=renderRace([], [item]);
  assert.equal(race.participants,1);
  // Sigue apareciendo: no se le borra de la pista.
  assert.match(race.html,/NeoMBP14/);
  // Pero ni corre ni se ampara en el proceso verificado.
  assert.match(race.html,/data-race-idle="true"/);
  assert.match(race.html,/refresh-lane-idle/);
  assert.doesNotMatch(race.html,/class="refresh-work-state"|>SIN AVANCE</);
  assert.doesNotMatch(race.html,/data-heartbeat="proceso-verificado"/);
});

test("con el trabajo fresco sí se rotula el fundamento operativo y corre", () => {
  const item=work("NeoMBP14","SubNeoMBP14","task","Trabajo vivo",Date.now()-3*60*1000,"running");
  Object.assign(item,{presence_at:Date.now(),session_state:"open",session_surface:"app",dedicated_basis:"process_birth"});
  const race=renderRace([], [item]);
  assert.match(race.html,/data-work-state="running"/);
  assert.doesNotMatch(race.html,/data-race-idle="true"/);
  assert.doesNotMatch(race.html,/class="refresh-work-state"|>SIN AVANCE</);
});

test("ningún participante recupera un dorsal aunque haya más de tres", () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({
    agente: ["MorfeoMacMini","NeoMBP14","OraculoMacMini","TrinityMBP14","SmithMacMini"][i], posicion: i + 1, total: 20 - i, vivo: true,
  }));
  const race = renderRace(rows,rows.map(row=>work(row.agente)));
  assert.equal(race.participants,5);
  assert.equal((race.html.match(/data-place="/g)||[]).length,5,"data-place queda sólo como orden interno");
  assert.doesNotMatch(race.html, /refresh-place|place-revealed/);
});

test("READY SET GO no pertenece a ninguna pista generada", () => {
  const rows = Array.from({ length: 3 }, (_, i) => ({agente:["MorfeoMacMini","NeoMBP14","TrinityMBP14"][i],posicion:i+1,total:20-i,vivo:true}));
  const race = renderRace(rows, rows.map((row) => work(row.agente)));
  const lanes = race.html.split('<div class="refresh-lane ').slice(1);
  assert.equal((race.html.match(/class="race-call"/g)||[]).length, 0);
  assert.doesNotMatch(lanes[0], /class="race-call"/);
  assert.doesNotMatch(lanes[1], /class="race-call"/);
  assert.doesNotMatch(lanes[2], /class="race-call"/);
  const one = renderRace(rows.slice(0,1), [work("MorfeoMacMini")]);
  assert.equal((one.html.match(/class="race-call"/g)||[]).length, 0);
  assert.equal((html.match(/id="raceCall"/g)||[]).length, 1);
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
