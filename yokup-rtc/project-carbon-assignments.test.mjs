// DCL-58b9acb160f8d2b507f361e4 · historia de primera asignación Carbono.
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  PROJECT_CARBON_ASSIGNMENTS_TABLE_SQL,
  PROJECT_CARBON_ASSIGNMENT_UPSERT_IF_CURRENT_SQL,
  PROJECT_CARBON_ASSIGNMENT_UPSERT_SQL,
  projectCarbonKey
} from "./src/project-carbon-assignments.js";

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE projects(id TEXT PRIMARY KEY,carbon_responsible TEXT NOT NULL DEFAULT '')");
  db.exec(PROJECT_CARBON_ASSIGNMENTS_TABLE_SQL);
  db.prepare("INSERT INTO projects(id,carbon_responsible) VALUES(?,?)").run("xpaceos", "Carlos3.0");
  return db;
}

test("la clave Carbono es estable entre mayúsculas, espacios y acentos", () => {
  assert.equal(projectCarbonKey("  Cárlos3.0  "), "carlos3.0");
  assert.equal(projectCarbonKey("CARLOS3.0"), "carlos3.0");
});

test("reasignar conserva la primera fecha y sólo avanza la última", () => {
  const db = database(), sql = db.prepare(PROJECT_CARBON_ASSIGNMENT_UPSERT_SQL);
  sql.run("xpaceos", "carlos3.0", "Carlos3.0", 100, 100);
  sql.run("xpaceos", "carlos3.0", "Cárlos3.0", 200, 200);
  assert.deepEqual({ ...db.prepare("SELECT display_name,first_assigned_at,last_assigned_at FROM project_carbon_assignments").get() }, {
    display_name: "Cárlos3.0", first_assigned_at: 100, last_assigned_at: 200
  });
  db.close();
});

test("el registro condicionado no inventa historia si el CAS dejó otro responsable", () => {
  const db = database(), sql = db.prepare(PROJECT_CARBON_ASSIGNMENT_UPSERT_IF_CURRENT_SQL);
  sql.run("xpaceos", "mateo3.0", "Mateo3.0", 300, 300, "xpaceos", "Mateo3.0");
  assert.equal(db.prepare("SELECT COUNT(*) total FROM project_carbon_assignments").get().total, 0);
  sql.run("xpaceos", "carlos3.0", "Carlos3.0", 100, 100, "xpaceos", "Carlos3.0");
  assert.equal(db.prepare("SELECT first_assigned_at FROM project_carbon_assignments").get().first_assigned_at, 100);
  db.close();
});
