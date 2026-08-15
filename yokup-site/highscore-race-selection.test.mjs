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

test("corren todos los participantes factuales sin tope de tres", () => {
  const ranking = rows(["A", "B", "C", "D", "E"]);
  const active = ["a", "b", "c", "d", "e"];
  assert.deepEqual(names(race.raceRows(ranking, active)), ["A", "B", "C", "D", "E"]);
});

test("con uno o dos elegibles la carrera no inventa calles", () => {
  const ranking = rows(["A", "B", "C", "D"]);
  assert.deepEqual(names(race.raceRows(ranking, ["b"])), ["B"]);
  assert.deepEqual(names(race.raceRows(ranking, ["b", "d"])), ["B", "D"]);
});

test("las calles se deduplican por familia canónica", () => {
  const ranking = rows(["A", "B", "C", "D", "E"]);
  ranking.push({agente:"D",posicion:6,total:1,vivo:false});
  const active = ["a", "b", "c", "d", "e"];
  assert.deepEqual(names(race.raceRows(ranking, active)),
    ["A", "B", "C", "D", "E"]);
});

test("la ausencia de latido no excluye trabajo factual", () => {
  const ranking = rows(["A", "B", "C", "D", "E"]);
  ranking[3].vivo = false;
  assert.deepEqual(names(race.raceRows(ranking, ["a", "b", "c", "d"])),
    ["A", "B", "C", "D"]);
});

test("cada cambio de ranking recalcula todas las calles", () => {
  const active = ["a", "b", "c", "d", "e"];
  assert.deepEqual(names(race.raceRows(rows(["A", "B", "C", "D", "E"]), active)),
    ["A", "B", "C", "D", "E"]);
  assert.deepEqual(names(race.raceRows(rows(["E", "D", "C", "B", "A"]), active)),
    ["E", "D", "C", "B", "A"]);
});

test("la elegibilidad factual no usa vivo ni selector local", () => {
  const ranking = rows(["A", "B", "C", "D"]);
  ranking[2].vivo = ranking[3].vivo = false;
  assert.deepEqual(names(race.raceRows(ranking, ["a", "b", "c", "d"])), ["A", "B", "C", "D"]);
});

test("el corredor extra deja paso al interruptor real de DesktopAPP", () => {
  assert.doesNotMatch(html, /yokup\.highscore\.raceExtraAgents|RACE_EXTRAS|data-agent-running-plus/);
  assert.match(html, /highscore-desktop-app\.js/);
  assert.match(html, /data-agent-desktop-app="' \+ esc\(item\.key\)/);
  assert.match(html, /querySelectorAll\("\[data-agent-desktop-app\]"\)\.forEach/);
  assert.match(html, /role="switch"/);
  assert.match(html, /aria-checked="' \+ active/);
  assert.match(html, /<span aria-hidden="true">🏃<\/span>/);
  assert.match(html, /DesktopAPP ' \+ \(active \? 'encendida' : 'apagada'\)/);
  assert.match(html, /\.agent-scope-row\.agent\{[^}]*grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(html, /data-agent-desktop-feedback=/, "el estado ocupa la columna intermedia sin reemplazar el switch");
  assert.match(html, /\.agent-scope-primary\{[^}]*grid-template-columns:minmax\(0,1fr\) auto 28px[^}]*width:100%/);
  assert.match(html, /Siguiendo' : 'No siguiendo'/);
  assert.match(html, /@media \(max-width:620px\)[\s\S]*?agent-scope/);
});

test("equipo, presets y Clonar conservan el control de apps separado del filtro", () => {
  const teamStart = html.indexOf('querySelectorAll("[data-agent-scope-team]")');
  const appStart = html.indexOf('querySelectorAll("[data-agent-desktop-app]")', teamStart);
  assert.ok(teamStart >= 0 && appStart > teamStart, "faltan filtro principal e interruptor DesktopAPP separados");
  const primaryHandlers = html.slice(teamStart, appStart);
  assert.doesNotMatch(primaryHandlers, /hsToggleDesktopApp|DESKTOP_APP_PENDING/);
  assert.match(html, /hsCloneAgentScopeToDashboard\(hsEffectiveAgentScope\(\),/);
  assert.match(html, /hsActiveAgentKeys\(datos\.presencia, window\.ykAgentIdentity, datos\.presenceNow\)/);
});

test("Running Man usa el censo factual completo y no altera ranking ni podio", () => {
  assert.match(html, /filasElegibles = enlaces\.map\(function \(enlace\) \{ return enlace\.fila; \}\)/);
  assert.match(html, /YkHighscoreRace\.raceRows\(filasElegibles, clavesActivas\)/);
  assert.match(html, /: filasElegibles;/);
  assert.match(html, /completas = listaCompletaCache \|\| \[\]/);
  assert.doesNotMatch(html, /filasElegibles\.slice\(0, 3\)/);
  // El sumador de la flota que se añadió al podio recibe listaCache, NO
  // filasElegibles: el Running Man sigue sin tocar ni ranking ni podio.
  assert.match(html, /pintaPodio\(listaCache\.slice\(0, 3\), listaCache\); pintaTabla\(listaVisible\(listaCache\)\); actualizaCarreraPodio\(\)/);
});
