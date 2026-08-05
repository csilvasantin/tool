import test from "node:test";
import assert from "node:assert/strict";
import { applySql, assignedBatches, buildBackfillAudit, canonicalProjectIds, madridDay, PROJECT_ID_MIGRATION_SQL } from "./tools/backfill-mission-projects.mjs";

const projects = [
  { id: "yokup", name: "Yokup" },
  { id: "xpaceos", name: "XPace OS" },
  { id: "admira-live", name: "Admira Live" },
  { id: "old", name: "Old Project", status: "archivado" }
];

test("resuelve sólo ids o nombres exactos del censo", () => {
  assert.deepEqual(canonicalProjectIds(projects, "Yokup"), ["yokup"]);
  assert.deepEqual(canonicalProjectIds(projects, "yokup.com"), []);
  assert.deepEqual(canonicalProjectIds(projects, "trabajo de yokup"), []);
  assert.deepEqual(canonicalProjectIds(projects, "old"), []);
});

test("calcula la fecha de creación con zona Europe/Madrid", () => {
  assert.equal(madridDay(Date.parse("2026-03-28T23:30:00Z")), "2026-03-29");
  assert.equal(madridDay(Date.parse("2026-10-24T22:30:00Z")), "2026-10-25");
});

test("audita decisión, padre, declaración exacta y vínculo explícito", () => {
  const created = Date.parse("2026-08-05T09:00:00Z");
  const data = {
    projects,
    tickets: [
      { id: "M-DEC", project: "", role: "mission", created_at: created },
      { id: "M-PARENT", project: "yokup", role: "mission", created_at: created },
      { id: "M-CHILD", project: "", role: "mission", parent_id: "M-PARENT", created_at: created },
      { id: "M-DECL", project: "", role: "mission", assignee: "OraculoMacMini", loc: "Mac Mini", created_at: created },
      { id: "M-LINK", project: "", role: "mission", created_at: created }
    ],
    batch_links: [{ mission_id: "M-DEC", batch_id: "B-1", decision_id: "D-1", decision_project: "XPace OS" }],
    declarations: [{ day: "2026-08-05", agent_key: "oraculomacmini", project_id: "admira-live" }],
    mission_ids: []
  };
  const audit = buildBackfillAudit(data, [{ mission_id: "M-LINK", project_id: "yokup", evidence: "ticket ADM-42" }]);
  assert.deepEqual(audit.assigned.map((row) => [row.mission_id, row.new_project]), [
    ["M-CHILD", "yokup"], ["M-DEC", "xpaceos"], ["M-DECL", "admira-live"], ["M-LINK", "yokup"], ["M-PARENT", "yokup"]
  ]);
  assert.deepEqual(audit.ambiguous, []);
  assert.deepEqual(audit.unresolved, []);
});

test("propaga un padre resuelto de forma trazable hasta su hija", () => {
  const data = {
    projects,
    tickets: [
      { id: "M-ROOT", project: "", role: "mission", created_at: 1 },
      { id: "M-CHILD", project: "", role: "mission", parent_id: "M-ROOT", created_at: 2 }
    ],
    batch_links: [{ mission_id: "M-ROOT", batch_id: "B", decision_id: "D", decision_project: "yokup" }],
    declarations: [], mission_ids: []
  };
  const audit = buildBackfillAudit(data);
  assert.deepEqual(audit.assigned.map((row) => [row.mission_id, row.new_project]), [["M-CHILD", "yokup"], ["M-ROOT", "yokup"]]);
});

test("conflictos quedan ambiguos y la falta de evidencia queda sin resolver", () => {
  const data = {
    projects,
    tickets: [
      { id: "M-A", project: "", role: "mission", created_at: Date.parse("2026-08-05T10:00:00Z"), assignee: "NeoMacMini", loc: "Mac Mini" },
      { id: "M-U", project: "", role: "mission", created_at: 1, subject: "Yokup urgente", loc: "xpaceos.com" }
    ],
    batch_links: [{ mission_id: "M-A", batch_id: "B", decision_id: "D", decision_project: "yokup" }],
    declarations: [{ day: "2026-08-05", agent_key: "neomacmini", project_id: "xpaceos" }],
    mission_ids: []
  };
  const audit = buildBackfillAudit(data);
  assert.equal(audit.assigned.length, 0);
  assert.deepEqual([...new Set(audit.ambiguous[0].provenance.map((row) => row.project_id))].sort(), ["xpaceos", "yokup"]);
  assert.equal(audit.ambiguous[0].action, "skipped_ambiguous");
  assert.equal(audit.unresolved[0].mission_id, "M-U");
  assert.equal(audit.unresolved[0].action, "skipped_unresolved");
});

test("el SQL de aplicación es idempotente y no pisa una asignación concurrente", () => {
  const sql = applySql([{ mission_id: "M'1", new_project: "yo'kup", new_project_id: "yo'kup" }]);
  assert.match(sql, /^UPDATE tickets SET project=CASE id/);
  assert.match(sql, /THEN 'yo''kup'/);
  assert.match(sql, /WHEN 'M''1'/);
  assert.match(sql, /,project_id=CASE id/);
  assert.match(sql, /COALESCE\(TRIM\(project\),''\)='' OR lower\(TRIM\(project\)\)=lower\('yo''kup'\)/);
  assert.match(sql, /COALESCE\(TRIM\(project_id\),''\)='' OR lower\(TRIM\(project_id\)\)=lower\('yo''kup'\)/);
  assert.match(sql, /RETURNING id,project,project_id;$/);
  assert.doesNotMatch(sql, /INSERT|DELETE|mission_tasks|events/i);
  assert.deepEqual(assignedBatches(Array.from({ length: 101 }, (_, i) => i), 50).map((rows) => rows.length), [50, 50, 1]);
  assert.equal(PROJECT_ID_MIGRATION_SQL, "ALTER TABLE tickets ADD COLUMN project_id TEXT");
});

test("segunda pasada y proyectos ya informados producen cero actualizaciones", () => {
  const data = {
    projects,
    tickets: [
      { id: "M-DONE", project: "yokup", project_id: "yokup", role: "mission", created_at: 1 },
      { id: "M-ARCHIVED", project: "", role: "mission", created_at: 1 }
    ],
    batch_links: [
      { mission_id: "M-DONE", batch_id: "B1", decision_id: "D1", decision_project: "xpaceos" },
      { mission_id: "M-ARCHIVED", batch_id: "B2", decision_id: "D2", decision_project: "old" }
    ],
    declarations: [], mission_ids: []
  };
  const audit = buildBackfillAudit(data);
  assert.equal(audit.assigned.length, 0);
  assert.equal(audit.ambiguous.length, 0);
  assert.equal(audit.unresolved.length, 1);
  assert.equal(audit.unresolved[0].mission_id, "M-ARCHIVED");
  assert.equal(audit.unresolved[0].rejected_sources[0].reason, "project_missing_or_inactive");
  assert.equal(applySql(audit.assigned), "");

  const firstData = {
    projects,
    tickets: [{ id: "M-FIRST", project: "", role: "mission", created_at: 1 }],
    batch_links: [{ mission_id: "M-FIRST", batch_id: "B3", decision_id: "D3", decision_project: "yokup" }],
    declarations: [], mission_ids: []
  };
  assert.equal(buildBackfillAudit(firstData).assigned.length, 1);
  firstData.tickets[0].project = "yokup";
  firstData.tickets[0].project_id = "yokup";
  const second = buildBackfillAudit(firstData);
  assert.equal(second.assigned.length, 0);
  assert.equal(applySql(second.assigned), "");
});

test("completa ambos campos sólo si el valor existente y la evidencia son compatibles", () => {
  const data = {
    projects,
    tickets: [
      { id: "M-ID", project: "", project_id: "yokup", role: "mission", created_at: 1 },
      { id: "M-CONFLICT", project: "", project_id: "yokup", role: "mission", created_at: 1 },
      { id: "M-NONEMPTY-CONFLICT", project: "xpaceos", project_id: "yokup", role: "mission", created_at: 1 },
      { id: "M-NORMALIZE", project: "XPace OS", project_id: "xpaceos", role: "mission", created_at: 1 }
    ],
    batch_links: [{ mission_id: "M-CONFLICT", batch_id: "B", decision_id: "D", decision_project: "xpaceos" }],
    declarations: [], mission_ids: []
  };
  const audit = buildBackfillAudit(data);
  assert.deepEqual(audit.assigned.map((row) => [row.mission_id, row.old_project, row.old_project_id, row.new_project, row.new_project_id]), [
    ["M-ID", "", "yokup", "yokup", "yokup"],
    ["M-NORMALIZE", "XPace OS", "xpaceos", "xpaceos", "xpaceos"]
  ]);
  assert.deepEqual(audit.ambiguous.map((row) => row.mission_id), ["M-CONFLICT", "M-NONEMPTY-CONFLICT"]);
  assert.ok(audit.ambiguous.every((row) => row.action === "skipped_ambiguous"));
});

test("agente y máquina asociados a varios proyectos nunca son fuente", () => {
  const data = {
    projects,
    tickets: [{ id: "M-MEMBER", project: "", role: "mission", assignee: "NeoMacMini", loc: "Mac Mini", created_at: 1 }],
    project_members: [
      { project_id: "yokup", kind: "agent", ref: "NeoMacMini" },
      { project_id: "xpaceos", kind: "machine", ref: "Mac Mini" }
    ],
    batch_links: [], declarations: [], mission_ids: []
  };
  const audit = buildBackfillAudit(data);
  assert.equal(audit.assigned.length, 0);
  assert.equal(audit.unresolved[0].mission_id, "M-MEMBER");
  assert.deepEqual(audit.unresolved[0].provenance, []);
});

test("una declaración creada o cambiada después de la misión no prueba su proyecto histórico", () => {
  const missionAt = Date.parse("2026-08-05T09:00:00Z");
  const data = {
    projects,
    tickets: [{ id: "M-LATE", project: "", role: "mission", assignee: "OraculoMacMini", loc: "Mac Mini", created_at: missionAt }],
    batch_links: [], mission_ids: [],
    declarations: [{ day: "2026-08-05", agent_key: "oraculomacmini", project_id: "yokup", created_at: missionAt - 1000, updated_at: missionAt + 1000 }]
  };
  const audit = buildBackfillAudit(data);
  assert.equal(audit.assigned.length, 0);
  assert.equal(audit.unresolved[0].rejected_sources[0].reason, "not_proven_at_mission_creation");
});
