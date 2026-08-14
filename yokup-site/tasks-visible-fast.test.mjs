import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("./tareas.html", import.meta.url), "utf8");
const shared = await readFile(new URL("./yk-misiones.js", import.meta.url), "utf8");

test("Tareas envía proyecto, misión y fecha al endpoint antes de filtrar en cliente", () => {
  assert.match(page, /function taskServerFilters\(\)/);
  assert.match(page, /projectId:PROJECT_SCOPE\|\|"",mission:FOCUS\|\|""/);
  assert.match(page, /YkMisiones\.fetchAllTasks\("todas",taskServerFilters\(\)\)/);
  assert.match(shared, /params\.set\("project_id", filters\.projectId\)/);
  assert.match(shared, /params\.set\("created_from", String\(filters\.createdFrom\)\)/);
  assert.match(shared, /params\.set\("created_to", String\(filters\.createdTo\)\)/);
});

test("un fallo de API deja explicación y reintento en vez de Filtrando infinito", () => {
  assert.match(page, /No se pudieron cargar las tareas/);
  assert.match(page, /id="retryTasks"/);
  assert.match(page, /retry\.onclick=load/);
  assert.match(shared, /!result\.response\.ok \|\| !Array\.isArray\(result\.data\.tasks\)/);
});
