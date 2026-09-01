// DCL-58b9acb160f8d2b507f361e4 · contrato de retirada global Carbono.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
const start = source.indexOf('if (url.pathname === "/projects/agents/unassign"');
const end = source.indexOf('if (url.pathname === "/projects/principal"', start);
const endpoint = source.slice(start, end);

test("la retirada global está autenticada y requiere confirmación explícita", () => {
  assert.ok(start >= 0);
  assert.match(endpoint, /requireAuth\(env, req\)/);
  assert.match(endpoint, /b\.confirmed !== true/);
  assert.match(endpoint, /confirmación explícita requerida/);
});

test("la lista esperada protege frente a carreras y sólo vacía Carbono", () => {
  assert.match(endpoint, /expected_projects requerido/);
  assert.match(endpoint, /JSON\.stringify\(currentIds\) !== JSON\.stringify\(expected\)/);
  assert.match(endpoint, /UPDATE projects SET carbon_responsible='',updated_at=\?,updated_by=\?/);
  assert.match(endpoint, /SELECT COUNT\(\*\) FROM projects/);
  assert.match(endpoint, /Number\(changed\.meta\.changes\) !== currentRows\.length/);
  assert.doesNotMatch(endpoint, /DELETE FROM carbon_members|DELETE FROM projects/);
});

test("la respuesta enumera los proyectos huérfanos y devuelve censo reconciliado", () => {
  assert.match(endpoint, /orphaned_projects:/);
  assert.match(endpoint, /projects: await listProjects\(env\)/);
});
