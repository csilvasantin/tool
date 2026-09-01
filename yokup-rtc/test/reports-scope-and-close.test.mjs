import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { buildReportsPageFilter } from "../src/reports-pagination.js";

const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");

test("el filtro de proyecto usa project_id canónico con fallback histórico", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE tickets(id TEXT,project TEXT,project_id TEXT,source TEXT); CREATE TABLE mission_tasks(mission_id TEXT,report TEXT,updated_at INTEGER)");
  db.prepare("INSERT INTO tickets VALUES(?,?,?,?)").run("new","otro","admira-tv","fleet");
  db.prepare("INSERT INTO tickets VALUES(?,?,?,?)").run("legacy","admira-tv",null,"fleet");
  db.prepare("INSERT INTO tickets VALUES(?,?,?,?)").run("no","yokup","yokup","fleet");
  for (const id of ["new","legacy","no"]) db.prepare("INSERT INTO mission_tasks VALUES(?,?,?)").run(id,"parte",1);
  const filter = buildReportsPageFilter({updated_from:null,updated_to:null,project:"admira-tv",cursor:null},"t.source='fleet'");
  const rows = db.prepare(`SELECT t.id FROM mission_tasks m JOIN tickets t ON t.id=m.mission_id WHERE ${filter.count_sql} ORDER BY t.id`).all(...filter.count_binds);
  assert.deepEqual(rows.map((row) => row.id), ["legacy","new"]);
});

test("terminar una tarea sin informe se rechaza antes del UPDATE", () => {
  const start = source.indexOf("async function setTaskStatus(");
  const end = source.indexOf("__name(setTaskStatus", start);
  const block = source.slice(start, end);
  assert.match(block, /\(st === "done" \|\| st === TASK_NO_APLICA\) && !String\(rp \|\| ""\)\.trim\(\)/);
  assert.ok(block.indexOf('code:"report_required"') < block.indexOf("UPDATE mission_tasks"));
});

test("la misión sólo reconcilia con z1, informes completos y prueba", () => {
  const start = source.indexOf("async function fleetReconcileMission(");
  const end = source.indexOf("__name(fleetReconcileMission", start);
  const block = source.slice(start, end);
  assert.match(block, /allDone && proof && hasInforme && reportsComplete/);
  assert.match(block, /blocked:"tareas-sin-informe"/);
  assert.match(block, /blocked:"sin-informe"/);
});

test("/fleet/informe no salta tareas abiertas y el standalone comparte su parte", () => {
  const route = source.slice(source.indexOf('url.pathname === "/fleet/informe"'), source.indexOf('url.pathname === "/fleet/cancel"'));
  assert.match(route, /code:"mission_tasks_incomplete"/);
  assert.match(route, /task\.status === "done" && String\(task\.report \|\| ""\)\.trim\(\)/);
  assert.match(route, /children\.every\(\(child\) => child\.status === "done" && String\(child\.report \|\| ""\)\.trim\(\)\)/);
  assert.match(route, /report=COALESCE\(NULLIF\(TRIM\(report\),''\),\?\)/);
  assert.ok(route.indexOf('code:"mission_tasks_incomplete"') < route.indexOf("notifyFleetInformeClosure"));
});

test("la cobertura global estricta detecta z1 ausente, tareas mudas y árboles abiertos", () => {
  assert.match(source, /z\.code='z1' AND z\.status='done'/);
  assert.match(source, /m\.status='done' AND \(m\.report IS NULL OR TRIM\(m\.report\)=''\)/);
  assert.match(source, /p\.status NOT IN \('done','resolved','completed','cancelled'\)/);
  assert.match(source, /resolved_with_open_tasks/);
});

test("fleet sync no convierte el DONE del inbox en cierre sin informes", () => {
  assert.match(source,/async function hasCanonicalFleetClosure/);
  assert.match(source,/tasks\.some\(\(task\) => task\.code === "z1"/);
  assert.match(source,/canonicalCloseRequired && !\(prev && await hasCanonicalFleetClosure\(env, id\)\)/);
});
