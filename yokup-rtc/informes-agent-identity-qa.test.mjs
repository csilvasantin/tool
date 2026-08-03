import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { reportAgentIdentity } from "./src/agent-identity.js";

const worker = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
const aggregateStart = worker.indexOf("async function listAllMissionTasks");
const aggregateEnd = worker.indexOf("async function saveMissionPlan", aggregateStart);
const aggregate = worker.slice(aggregateStart, aggregateEnd);

test("matriz histórica y nueva de identidades visibles en informes", () => {
  const cases = [
    ["Morfeo", "MacBook Pro 16", "MorfeoMBP16"],
    ["Morfeo16", "admira-macbookpro16", "MorfeoMBP16"],
    ["Oraculo", "admira-macmini", "OraculoMini"],
    ["OraculoMacMini", "Mac Mini", "OraculoMini"],
    ["SubTrinity16", "MacBookPro16", "SubTrinityMBP16"],
    ["InfraMorfeo", "MacBook Pro 16", "InfraMorfeoMBP16"],
    ["InfraOraculoMini", "MacMini", "InfraOraculoMini"],
    ["Neo", "MacBookAirAzul", "NeoMBAAzul"],
    ["NeoAzul", "MacBookAirAzul", "NeoMBAAzul"],
    ["Agente Smith Azul", "MacBook Air Azul", "SmithMBAAzul"],
  ];
  for (const [owner, machine, expected] of cases) {
    assert.equal(reportAgentIdentity(owner, machine), expected, `${owner} @ ${machine}`);
  }
});

test("el agregado consumido por /informes publica agent_identity usando tickets.loc", () => {
  assert.ok(aggregateStart >= 0 && aggregateEnd > aggregateStart,
    "no se encontró listAllMissionTasks");
  assert.match(aggregate, /agent_identity\s*:\s*reportAgentIdentity\([^,]+,\s*[^)]+\.loc\)/,
    "/informes usa /tasks/all: no basta con normalizar listMissionTasks");
});

test("la reasignación no puede derivar el encargo pelando FLT tras una colisión", async () => {
  for (const relative of ["../yokup-site/ticket.html", "../yokup-site/misiones.html"]) {
    const source = await readFile(new URL(relative, import.meta.url), "utf8");
    assert.doesNotMatch(source, /(?:const|let|var)\s+num\s*=\s*(?:String\()?id(?:\))?\.replace\(\/\^FLT-\//,
      `${relative} deriva #encargo desde FLT; #1110→FLT-1136 demuestra que no son equivalentes`);
  }
});
