import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { selectOnIdleProposals } from "./src/onidle-proposals.js";

const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
const script = await readFile(new URL("./tools/onidle-hora.sh", import.meta.url), "utf8");

const candidate = (id, title, overrides = {}) => ({
  title,
  target_mission_id:id,
  status:"open",
  priority:"normal",
  created_at:100,
  ...overrides,
});

test("la selección es estable ante cualquier orden de entrada y no muta el backlog", () => {
  const rows = [
    candidate("MIS-Z", "Normal antigua", { created_at:1 }),
    candidate("MIS-B", "Alta B", { priority:"high", created_at:2 }),
    candidate("MIS-A", "Alta A", { priority:"high", created_at:2 }),
    candidate("MIS-U", "Urgente", { priority:"urgent", created_at:9 }),
    candidate("MIS-L", "Baja", { priority:"low", created_at:0 }),
  ];
  const before = structuredClone(rows);
  const permutations = [rows, [...rows].reverse(), [rows[2], rows[4], rows[0], rows[3], rows[1]]];
  for (const input of permutations) {
    const result = selectOnIdleProposals(input);
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
    candidate("MIS-1", "Primera válida", { priority:"high", created_at:1 }),
    candidate("MIS-1", "Id repetido", { priority:"high", created_at:2 }),
    candidate("MIS-X", " PRIMERA VÁLIDA!!! ", { priority:"high", created_at:3 }),
    candidate("MIS-2", "Segunda válida", { created_at:4 }),
    candidate("MIS-3", "Tercera válida", { created_at:5 }),
  ];
  const result = selectOnIdleProposals(rows, {
    active_mission_ids:["MIS-BATCH"],
    used_target_ids:["MIS-USED"],
    used_titles:["Mision ya propuesta"],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.proposals.map((row) => row.target_mission_id), ["MIS-1", "MIS-2", "MIS-3"]);
});

test("target null nunca se inventa: sólo sobrevive la mejora nueva marcada explícitamente", () => {
  const result = selectOnIdleProposals([
    candidate(null, "Sin procedencia"),
    candidate("id con espacios", "Id inválido"),
    candidate(null, "Nueva canónica", { explicit_new:true, status:"new", priority:"high" }),
    candidate("MIS-2", "Segunda"),
    candidate("MIS-3", "Tercera"),
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.proposals, [
    { title:"Nueva canónica", target_mission_id:null, explicit_new:true },
    { title:"Segunda", target_mission_id:"MIS-2" },
    { title:"Tercera", target_mission_id:"MIS-3" },
  ]);
});

test("si los filtros dejan menos de tres falla sin publicar una lista parcial", () => {
  const result = selectOnIdleProposals([
    candidate("MIS-1", "Una"),
    candidate("MIS-2", "Dos"),
    candidate("MIS-3", "Tres", { status:"active" }),
  ]);
  assert.deepEqual(result, {
    ok:false,
    code:"onidle_proposals_insufficient",
    required:3,
    available:2,
    proposals:[],
  });
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
  assert.match(body, /const candidates = \(backlogResult\.results \|\| \[\]\)\.map/);
  assert.doesNotMatch(body, /const owns|sameAgentFamily\(row|memberRefMatches\("machine", row|\.filter\(owns\)/);
  assert.match(body, /used_target_ids:usedTargetIds, used_titles:usedTitles, active_mission_ids:activeMissionIds/);
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
  assert.match(script, /if not explicit: raise SystemExit/);
  assert.match(script, /OnIdle bloqueado: \$reason · cupo \$\{used\}\/8/);
});
