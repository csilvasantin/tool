import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { selectOnIdleProposals } from "./src/onidle-proposals.js";

const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
const script = await readFile(new URL("./tools/onidle-hora.sh", import.meta.url), "utf8");
const NOW = Date.parse("2026-08-10T09:00:00Z");

const candidate = (id, title, overrides = {}) => ({
  title,
  target_mission_id:id,
  status:"open",
  priority:"normal",
  created_at:NOW - 3600000,
  evidence_at:NOW - 3600000,
  ...overrides,
});

test("la selección es estable ante cualquier orden de entrada y no muta el backlog", () => {
  const rows = [
    candidate("MIS-Z", "Reducir /z de 10 pasos a 5 y verificar 5"),
    candidate("MIS-B", "Corregir API /b: 2 errores y verificar 0", { priority:"high", created_at:NOW-20 }),
    candidate("MIS-A", "Completar sitemap: 7 rutas de 9 y verificar 9", { priority:"high", created_at:NOW-20 }),
    candidate("MIS-U", "Rehacer /404: 1140 bytes y verificar salida", { priority:"urgent", created_at:NOW-9 }),
    candidate("MIS-L", "Reducir /l de 12 pasos a 6 y verificar 6", { priority:"low", created_at:NOW-1 }),
  ];
  const before = structuredClone(rows);
  const permutations = [rows, [...rows].reverse(), [rows[2], rows[4], rows[0], rows[3], rows[1]]];
  for (const input of permutations) {
    const result = selectOnIdleProposals(input,{now:NOW});
    assert.equal(result.ok, true);
    assert.deepEqual(result.proposals.map((row) => row.target_mission_id), ["MIS-U", "MIS-A", "MIS-B"]);
  }
  assert.deepEqual(rows, before, "ordenar candidatos no puede reescribir la fuente canónica");
});

test("filtra en conjunto terminales, activas, usadas y duplicadas antes de completar tres", () => {
  const rows = [
    candidate("MIS-RES", "Resuelta", { status:"resolved", priority:"critical" }),
    candidate("MIS-CAN", "Cancelada", { status:"cancelled", priority:"critical" }),
    candidate("MIS-ACT", "Activa por estado", { status:"doing", priority:"critical" }),
    candidate("MIS-BATCH", "Activa por batch", { priority:"critical" }),
    candidate("MIS-USED", "Usada por id", { priority:"critical" }),
    candidate("MIS-TITLE", "Misión ya propuesta", { priority:"critical" }),
    candidate("MIS-1", "Reducir /uno de 10 pasos a 5 y verificar 5", { priority:"high", created_at:NOW-5 }),
    candidate("MIS-1", "Eliminar /duplicado: 2 envíos y verificar 1", { priority:"high", created_at:NOW-4 }),
    candidate("MIS-X", " REDUCIR /UNO DE 10 PASOS A 5 Y VERIFICAR 5!!! ", { priority:"high", created_at:NOW-3 }),
    candidate("MIS-2", "Corregir API /dos: 2 errores y verificar 0", { created_at:NOW-2 }),
    candidate("MIS-3", "Completar sitemap: 7 rutas de 9 y verificar 9", { created_at:NOW-1 }),
  ];
  const result = selectOnIdleProposals(rows, {
    active_mission_ids:["MIS-BATCH"],
    used_target_ids:["MIS-USED"],
    used_titles:["Mision ya propuesta"],
    now:NOW,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.proposals.map((row) => row.target_mission_id), ["MIS-1", "MIS-2", "MIS-3"]);
});

test("target null nunca se inventa, tampoco con la marca explicit_new histórica", () => {
  const result = selectOnIdleProposals([
    candidate(null, "Sin procedencia"),
    candidate("id con espacios", "Id inválido"),
    candidate(null, "Nueva canónica", { explicit_new:true, status:"new", priority:"high" }),
    candidate("MIS-2", "Reducir /dos de 10 pasos a 5 y verificar 5"),
    candidate("MIS-3", "Corregir API /tres: 3 errores y verificar 0"),
  ],{now:NOW});
  assert.equal(result.ok, false);
  assert.equal(result.available,2);
  assert.equal(result.rejected.generic,2);
});

test("si los filtros dejan menos de tres falla sin publicar una lista parcial", () => {
  const result = selectOnIdleProposals([
    candidate("MIS-1", "Reducir /uno de 10 pasos a 5 y verificar 5"),
    candidate("MIS-2", "Corregir API /dos: 2 errores y verificar 0"),
    candidate("MIS-3", "Completar sitemap: 7 rutas de 9 y verificar 9", { status:"active" }),
  ],{now:NOW});
  assert.deepEqual(result, {
    ok:false,
    code:"onidle_proposals_insufficient",
    required:3,
    available:2,
    rejected:{stale:0,generic:0},
    action:"investigate",
    proposals:[],
  });
});

test("una propuesta medible pero caducada no se recicla", () => {
  const stale=candidate("INC-REAL","Reducir /status de 216 KB a 80 KB y verificar peso",{
    evidence_at:NOW-65*3600000,created_at:NOW-65*3600000
  });
  const result=selectOnIdleProposals([stale],{now:NOW});
  assert.equal(result.ok,false);
  assert.equal(result.rejected.stale,1);
  assert.equal(result.action,"investigate");
});

test("el endpoint usa backlog, historial y actividad globales del proyecto exacto", () => {
  const body = source.slice(
    source.indexOf("async function canonicalOnIdleProposals"),
    source.indexOf("__name(canonicalOnIdleProposals"),
  );
  assert.match(body, /exactDecisionProjectAssignment\(env, identity\.agent, identity\.machine, requestedProjectId\)/);
  assert.match(body, /WHERE \(project_id=\? OR \(COALESCE\(project_id,''\)='' AND lower\(project\)=lower\(\?\)\)\)/);
  assert.match(body, /SELECT agent,machine,project,options,option_targets FROM decisions WHERE mission=\?/);
  assert.match(body, /\.filter\(\(row\) => String\(row\.project_id \|\| ""\) === projectId\)/);
  assert.match(body, /SELECT DISTINCT m\.mission_id FROM mission_tasks m JOIN tickets t/);
  assert.match(body, /const backlogCandidates = \(backlogResult\.results \|\| \[\]\)\.map/);
  assert.match(body, /evidence_at:row\.updated_at \|\| row\.created_at/);
  assert.doesNotMatch(body, /buildOnIdleExplicitNewCandidates|explicitNewCandidates|backlogCandidates\.concat\(/);
  assert.doesNotMatch(body, /const owns|sameAgentFamily\(row|memberRefMatches\("machine", row|\.filter\(owns\)/);
  assert.match(body, /used_target_ids:usedTargetIds, used_titles:usedTitles/);
  assert.doesNotMatch(body, /Math\.random|ORDER BY RANDOM|infer|guess/i);
});

test("el publicador conserva cuota y orden exacto 3 + back + custom", () => {
  const stateAt = script.indexOf("/fleet/onidle-state");
  const proposalsAt = script.indexOf("/fleet/onidle-proposals");
  const postAt = script.indexOf('-X POST "$API/decisions"');
  assert.ok(stateAt >= 0 && stateAt < proposalsAt && proposalsAt < postAt,
    "la cuota debe comprobarse antes de obtener propuestas y antes del POST");
  assert.match(script, /if len\(rows\)!=3: raise SystemExit/);
  assert.match(script, /ops \+= \["\u21a9 Volver atrás", "\u270d\ufe0f Custom · Escribe la mejora que quieras a mano"\]/);
  assert.match(script, /targets \+= \[None,None\]/);
  assert.match(script, /if not target or not re\.fullmatch/);
  assert.doesNotMatch(script, /explicit_new/);
  assert.match(script, /OnIdle bloqueado: \$reason · cupo \$\{used\}\/8/);
});
