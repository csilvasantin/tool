import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { taskOperationalDetails } from "./src/mission-visible.js";

const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
const menu = source.slice(source.indexOf("async function menuCounters"), source.indexOf("__name(menuCounters"));
const allTasks = source.slice(source.indexOf("async function listAllMissionTasks"), source.indexOf("__name(listAllMissionTasks"));

test("el menú clasifica por ciclo de vida del padre sin escribir estados", () => {
  assert.match(menu, /FROM mission_tasks m LEFT JOIN tickets t ON t\.id=m\.mission_id/);
  assert.match(menu, /m\.status IN \('done','resolved','completed'\) THEN 'done'/);
  assert.match(menu, /m\.status='cancelled' THEN 'cancelled'/);
  assert.match(menu, /t\.id IS NULL THEN 'orphaned'/);
  assert.match(menu, /COALESCE\(t\.status,''\) NOT IN .*'invalid_parent'/);
  assert.match(menu, /t\.status IN \('resolved','cancelled'\).*THEN 'archived_incomplete'/);
  assert.match(menu, /m\.status='pending' AND t\.status IN \('open','in_progress'\) THEN 'pending'/);
  assert.doesNotMatch(menu, /t\.status IN \('open','in_progress','unconcluded'\)/,
    "un estado de padre no canónico nunca se vuelve accionable");
  assert.doesNotMatch(menu, /UPDATE mission_tasks|DELETE FROM mission_tasks/);
});

test("el corte de 60 minutos sólo convierte trabajo accionable en no concluido", () => {
  assert.match(menu, /COALESCE\(m\.started_at,m\.updated_at,m\.created_at\)/);
  assert.match(menu, /\)<=\? THEN 'unconcluded'/);
  assert.match(menu, /t\.status IN \('open','in_progress'\).*unconcluded/s);
});

test("la matriz padre/hija y los límites se ejecutan, no sólo se buscan en el fuente", () => {
  const now = 1_800_000_000_000;
  const row = (parent, child, age = 1) => taskOperationalDetails({
    parent_ticket_id: parent === "missing" ? null : "M1",
    mission_status: parent === "missing" ? null : parent,
    status: child,
    started_at: now - age
  }, now).operational_state;
  for (const parent of ["open","in_progress"]) {
    assert.equal(row(parent,"pending"), "pending");
    assert.equal(row(parent,"in_progress",3_599_999), "in_progress");
    assert.equal(row(parent,"in_progress",3_600_000), "unconcluded");
  }
  for (const parent of ["resolved","cancelled"]) {
    assert.equal(row(parent,"pending"), "archived_incomplete");
    assert.equal(row(parent,"in_progress"), "archived_incomplete");
    assert.equal(row(parent,"done"), "done");
    assert.equal(row(parent,"cancelled"), "cancelled");
  }
  for (const child of ["pending","in_progress"]) assert.equal(row("missing",child), "orphaned");
  for (const parent of ["", "unknown", "unconcluded"]) {
    assert.equal(row(parent,"pending"), "invalid_parent");
    assert.equal(row(parent,"in_progress"), "invalid_parent");
  }
  assert.equal(row("resolved","done"), "done", "standalone A cerrada conserva precedencia terminal");
});

test("el contrato conserva total histórico y separa deuda archivada", () => {
  for (const field of ["archivadas_incompletas","huerfanas","padre_invalido","total_historico","all_history","parent-aware-v1"]) {
    assert.match(menu, new RegExp(field));
  }
  assert.match(menu, /out\.tareas\.total_historico \+= r\.n/);
});

test("Todas conserva huérfanas y expone ciclo del padre sin falsear tareas done", () => {
  assert.match(allTasks, /FROM mission_tasks m LEFT JOIN tickets t ON t\.id = m\.mission_id/);
  assert.match(allTasks, /t\.id AS parent_ticket_id/);
  assert.match(allTasks, /taskOperationalDetails\(task, now\)/);
  assert.match(allTasks, /const visible = operational/);
  assert.match(allTasks, /operational_state:operational\.operational_state, parent_lifecycle:operational\.parent_lifecycle/);
});
