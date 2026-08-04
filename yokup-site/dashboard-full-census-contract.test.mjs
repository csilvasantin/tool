import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source = await readFile(new URL("./dashboard.html", import.meta.url), "utf8");

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `falta ${name}`);
  const brace = source.indexOf("{", start);
  let depth = 0, quote = "", escaped = false;
  for (let index = brace; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`función ${name} incompleta`);
}

function contractApi() {
  const paTeamKey = (machine) => String(machine || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const launchHosts = ["pixeria.com", "xpaceos.com", "clearchannel.tv", "yokup.com", "admiranext.com"];
  return new Function("paTeamKey", "PROJECT_LAUNCH_HOSTS", [
    "paTeamHasProject", "paPhysicalTeamCensus", "paVisibleTeams", "paLaunchProjects",
  ].map(functionSource).join("\n") + "\nreturn {paPhysicalTeamCensus,paVisibleTeams,paLaunchProjects};")(paTeamKey, launchHosts);
}

test("el Dashboard carga el censo físico canónico, no sólo presencia y asignaciones", () => {
  assert.match(source, /const FLEET_CENSUS="\/api\/fleet-census"/);
  assert.match(source, /let PROJECT_TEAM_CENSUS=\[\]/);
  assert.match(source, /fetch\(FLEET_CENSUS,\{cache:"no-store"\}\)/);
  assert.match(source, /PROJECT_TEAM_CENSUS=paPhysicalTeamCensus\(/);
  assert.doesNotMatch(
    functionSource("paTeams"),
    /paAgentFamilies\(PROJECT_ROSTER\)/,
    "paTeams no puede volver a deducir qué equipos existen desde agentes vivos/asignados",
  );
});

test("el inventario conserva equipos sin latido y sin proyecto", () => {
  const {paPhysicalTeamCensus} = contractApi();
  const machines = [
    {name:"Mac Mini", online:true},
    {name:"MacBook Pro 14", online:false},
    {name:"DGX Spark", online:false},
  ];
  const agents = [
    {id:"OraculoMacMini", team:"macmini", teamMachine:"Mac Mini", online:true},
  ];
  const teams = paPhysicalTeamCensus(machines, agents);
  assert.deepEqual(teams.map((team) => team.machine), ["DGX Spark", "Mac Mini", "MacBook Pro 14"]);
  assert.equal(teams.find((team) => team.machine === "Mac Mini").agents.length, 1);
  assert.equal(teams.find((team) => team.machine === "MacBook Pro 14").agents.length, 0);
  assert.equal(teams.find((team) => team.machine === "DGX Spark").agents.length, 0);
});

test("el nombre humano del censo conserva host y clave física para las asociaciones", () => {
  const {paPhysicalTeamCensus} = contractApi();
  const teams = paPhysicalTeamCensus([
    {name:"Mac Mini (Carlos)", host:"MacMini", online:true, reachable:true},
  ], [
    {id:"OraculoMacMini", team:"macmini", teamMachine:"MacMini", online:true},
  ]);
  assert.equal(teams.length, 1);
  assert.deepEqual(
    {machine:teams[0].machine, host:teams[0].host, key:teams[0].key, agents:teams[0].agents.length},
    {machine:"Mac Mini (Carlos)", host:"MacMini", key:"macmini", agents:1},
  );
});

test("censo completo y subconjunto visible son estados distintos", () => {
  const {paPhysicalTeamCensus, paVisibleTeams} = contractApi();
  const census = paPhysicalTeamCensus([
    {name:"Mac Mini"}, {name:"MacBook Pro 14"}, {name:"DGX Spark"},
  ], []);
  const projects = [{id:"yokup", machines:["Mac Mini"]}];
  const selected = paVisibleTeams(census, new Set(["macmini"]), "all", projects);
  const unassigned = paVisibleTeams(census, null, "unassigned", projects);

  assert.equal(census.length, 3, "activar una selección no mutila el censo físico");
  assert.deepEqual(selected.map((team) => team.machine), ["Mac Mini"]);
  assert.deepEqual(unassigned.map((team) => team.machine), ["DGX Spark", "MacBook Pro 14"]);
  assert.match(source, /const teams=paPhysicalTeamCensus\(PROJECT_TEAM_CENSUS,PROJECT_ROSTER\)/);
  assert.match(source, /const visibleTeams=paVisibleTeams\(teams,TEAM_SCOPE,TEAM_FILTER,PROJECT_ROWS\)/);
  assert.match(source, /teamScopeItems=teams\.map\(/, "Avanzado siempre enumera el censo completo");
  assert.match(source, /visibleTeams\.length\+"\/"\+teams\.length/, "el contador distingue visibles de censados");
});

test("la existencia del equipo no depende de que esté asignado a un proyecto", () => {
  const censusSource = functionSource("paPhysicalTeamCensus");
  assert.doesNotMatch(censusSource, /PROJECT_ROWS|project|machines\s*\|\|/i);
  assert.match(source, /function paTeamHasProject\(team,projects\)/);
  assert.match(functionSource("paVisibleTeams"), /filter==="unassigned"/);
  assert.match(functionSource("paVisibleTeams"), /paTeamHasProject/);
});

test("la salida inicial fija exactamente los cinco proyectos acordados", () => {
  assert.match(
    source,
    /const PROJECT_LAUNCH_HOSTS=Object\.freeze\(\["pixeria\.com","xpaceos\.com","clearchannel\.tv","yokup\.com","admiranext\.com"\]\)/,
  );
  const {paLaunchProjects} = contractApi();
  const projects = [
    {id:"other", name:"Otro", web:"https://example.com"},
    {id:"next", name:"AdmiraNeXT", web:"https://www.admiranext.com"},
    {id:"clear", name:"Clear Channel", web:"https://clearchannel.tv"},
    {id:"pix", name:"Pixeria", web:"https://www.pixeria.com"},
    {id:"yokup", name:"Yokup", web:"https://yokup.com"},
    {id:"xpace", name:"XpaceOS", web:"https://www.xpaceos.com"},
  ];
  assert.deepEqual(
    paLaunchProjects(projects).map((project) => new URL(project.web).hostname.replace(/^www\./, "")),
    ["pixeria.com", "xpaceos.com", "clearchannel.tv", "yokup.com", "admiranext.com"],
  );
  assert.match(source, /PROJECT_ROWS=paLaunchProjects\(Array\.isArray\(projects\.projects\)\?projects\.projects:\[\]\)/);
});
