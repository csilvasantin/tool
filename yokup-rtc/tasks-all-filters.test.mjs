import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");

test("/tasks/all acepta filtros acotados y los aplica con parámetros enlazados", () => {
  assert.match(source, /function parseAllTasksFilters\(params\)/);
  assert.match(source, /created_from\/created_to deben ser epoch ms/);
  assert.match(source, /COALESCE\(NULLIF\(t\.project_id,''\),t\.project\)=\?/);
  assert.match(source, /clauses\.push\("m\.mission_id=\?"\)/);
  assert.match(source, /clauses\.push\("t\.created_at>=\?"\)/);
  assert.match(source, /clauses\.push\("t\.created_at<\?"\)/);
  assert.match(source, /prepared\.bind\(\.\.\.binds\)/);
});

test("la ruta conserva el contrato legacy y rechaza filtros inválidos", () => {
  const start = source.indexOf('if (url.pathname === "/tasks/all")');
  const end = source.indexOf('if (url.pathname === "/ticket")', start);
  const route = source.slice(start, end);
  assert.match(route, /parseAllTasksFilters\(url\.searchParams\)/);
  assert.match(route, /return json\(\{ error:filters\.error, applied:false \}, 400\)/);
  assert.match(route, /listAllMissionTasks\(env, scope, filters\)/);
});
