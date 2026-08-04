import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("./highscore.html", import.meta.url), "utf8");
const raceSource = fs.readFileSync(new URL("./highscore-race.js", import.meta.url), "utf8");
const sandbox = { module:{ exports:{} }, exports:{} };
vm.runInNewContext(raceSource, sandbox);
const race = sandbox.module.exports;

function rows(names) {
  return names.map((agente, index) => ({ agente, posicion:index + 1, total:100 - index, vivo:true }));
}

function names(selected) {
  return selected.map((row) => row.agente);
}

test("sin preferencia o con lista vacía corren como máximo los tres primeros elegibles", () => {
  const ranking = rows(["A", "B", "C", "D", "E"]);
  const active = ["a", "b", "c", "d", "e"];
  assert.deepEqual(names(race.raceRows(ranking, active)), ["A", "B", "C"]);
  assert.deepEqual(names(race.raceRows(ranking, active, [])), ["A", "B", "C"]);
});

test("con uno o dos elegibles la carrera no inventa calles", () => {
  const ranking = rows(["A", "B", "C", "D"]);
  assert.deepEqual(names(race.raceRows(ranking, ["b"])), ["B"]);
  assert.deepEqual(names(race.raceRows(ranking, ["b", "d"])), ["B", "D"]);
});

test("los extras añaden calles 4+ sin duplicar el podio", () => {
  const ranking = rows(["A", "B", "C", "D", "E"]);
  const active = ["a", "b", "c", "d", "e"];
  assert.deepEqual(names(race.raceRows(ranking, active, ["c", "d", "e", "d"])),
    ["A", "B", "C", "D", "E"]);
});

test("un extra sin misión o sin vida no corre", () => {
  const ranking = rows(["A", "B", "C", "D", "E"]);
  ranking[3].vivo = false;
  assert.deepEqual(names(race.raceRows(ranking, ["a", "b", "c", "d"], ["d", "e"])),
    ["A", "B", "C"]);
});

test("cada cambio de ranking recalcula el podio y conserva la intención extra", () => {
  const active = ["a", "b", "c", "d", "e"];
  assert.deepEqual(names(race.raceRows(rows(["A", "B", "C", "D", "E"]), active, ["A"])),
    ["A", "B", "C"]);
  assert.deepEqual(names(race.raceRows(rows(["E", "D", "C", "B", "A"]), active, ["A"])),
    ["E", "D", "C", "A"]);
});

test("un extra oculto por el selector principal queda latente hasta volver al scope", () => {
  const active = ["a", "b", "c", "d", "e"];
  const full = rows(["A", "B", "C", "D", "E"]), scoped = full.slice(0, 4);
  assert.deepEqual(names(race.raceRows(scoped, active, ["e"])), ["A", "B", "C"]);
  assert.deepEqual(names(race.raceRows(full, active, ["e"])), ["A", "B", "C", "E"]);
});

test("la preferencia de carrera usa almacenamiento propio y sobrevive al repintado", () => {
  assert.match(html, /=\s*"yokup\.highscore\.raceExtraAgents\.v1"/);
  assert.match(html, /function hsReadRaceExtras\(/);
  assert.match(html, /function hsWriteRaceExtras\(/);
  assert.match(html, /function hsSetRaceExtra\(/);
  assert.match(html, /localStorage\.setItem\(RACE_EXTRA_SCOPE_KEY, JSON\.stringify\(/);
  assert.match(html, /hsWriteRaceExtras\(RACE_EXTRAS\)/);
  assert.match(html, /hsRenderAgentScope\(listaCompletaCache \|\| \[\]\)/,
    "el repintado es lo que sincroniza todas las copias multi-equipo");
});

test("cada agente ofrece a la derecha un corredor visual, accesible y sin texto auxiliar", () => {
  assert.match(html, /data-agent-running-plus value="' \+ esc\(item\.key\)/);
  assert.match(html, /querySelectorAll\("\[data-agent-running-plus\]"\)\.forEach/);
  assert.match(html, /aria-label="Seleccionar [^"]+ como corredor extra"/i);
  assert.match(html, /<span aria-hidden="true">🏃<\/span>/);
  assert.doesNotMatch(html, />Running \+<\/span>/);
  assert.match(html, /class="sr-only" type="checkbox" data-agent-running-plus/);
  assert.match(html, /\.agent-scope-row\.agent\{[^}]*grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(html, /\.agent-scope-primary\{[^}]*grid-template-columns:16px minmax\(0,1fr\)/);
  assert.match(html, /@media \(max-width:620px\)[\s\S]*?agent-scope/);
});

test("equipo, Todos, Clonar y reset principal no seleccionan ni borran extras", () => {
  const teamStart = html.indexOf('querySelectorAll("[data-agent-scope-team]")');
  const extraStart = html.indexOf('querySelectorAll("[data-agent-running-plus]")', teamStart);
  assert.ok(teamStart >= 0 && extraStart > teamStart, "faltan controles principal y extra separados");
  const primaryHandlers = html.slice(teamStart, extraStart);
  assert.doesNotMatch(primaryHandlers, /hsSetRaceExtra|hsWriteRaceExtras|RACE_EXTRAS/);
  assert.match(html, /hsCloneAgentScopeToDashboard\(AGENT_SCOPE,/);
  assert.match(html, /AGENT_SCOPE = null; hsWriteAgentScope\(AGENT_SCOPE\)/);
  assert.doesNotMatch(html, /AGENT_SCOPE = null;[^\n]*RACE_EXTRAS\s*=/);
});

test("Running Man consume la selección visible y no altera ranking ni podio", () => {
  assert.match(html, /filasElegibles = enlaces\.map\(function \(enlace\) \{ return enlace\.fila; \}\)/);
  assert.match(html, /YkHighscoreRace\.raceRows\(filasElegibles, clavesActivas, extras\)/);
  assert.match(html, /pintaPodio\(listaCache\.slice\(0, 3\)\); pintaTabla\(listaVisible\(listaCache\)\); actualizaCarreraPodio\(\)/);
});
