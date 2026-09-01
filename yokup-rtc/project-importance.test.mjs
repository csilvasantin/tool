// FLT-1504 · contrato persistente y autenticado de importancia 0..5.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
const migration = await readFile(new URL("./migrations/0008_project_importance.sql", import.meta.url), "utf8");
const start = source.indexOf('if (url.pathname === "/projects/importance"');
const end = source.indexOf('if (url.pathname === "/projects/principal"', start);
const endpoint = source.slice(start, end);

test("proyectos nuevos e históricos nacen con importancia 0 y límite D1 0..5", () => {
  assert.match(source, /importance INTEGER NOT NULL DEFAULT 0 CHECK \(importance BETWEEN 0 AND 5\)/);
  assert.match(source, /ALTER TABLE projects ADD COLUMN importance INTEGER NOT NULL DEFAULT 0 CHECK \(importance BETWEEN 0 AND 5\)/);
  assert.match(migration, /ADD COLUMN importance INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration, /CHECK \(importance BETWEEN 0 AND 5\)/);
});

test("GET /projects siempre devuelve una importancia canónica entre 0 y 5", () => {
  assert.match(source, /importance: Number\.isInteger\(Number\(p\.importance\)\)/);
  assert.match(source, /Math\.max\(0, Math\.min\(5, Number\(p\.importance\)\)\) : 0/);
});

test("la mutación tiene endpoint dedicado y no altera el orden manual", () => {
  assert.ok(start >= 0, "falta POST /projects/importance");
  assert.match(endpoint, /req\.method === "POST"/);
  assert.match(endpoint, /UPDATE projects SET importance=\?,updated_at=\?,updated_by=\?/);
  assert.doesNotMatch(endpoint, /sort_order|project_members|project_novelty/);
});

test("la escritura exige sesión y deriva updated_by del correo autenticado", () => {
  assert.match(endpoint, /const sess = await requireAuth\(env, req\)/);
  assert.match(endpoint, /if \(!sess\).*unauthorized.*401/);
  assert.match(endpoint, /String\(sess\.email \|\| sess\.user \|\| "web"\)/);
  assert.doesNotMatch(endpoint, /b\.by/);
});

test("importance y expected_importance sólo aceptan enteros JSON 0..5", () => {
  assert.match(endpoint, /Number\.isInteger\(b && b\.importance\)/);
  assert.match(endpoint, /b\.importance < 0 \|\| b\.importance > 5/);
  assert.match(endpoint, /Number\.isInteger\(b && b\.expected_importance\)/);
  assert.match(endpoint, /b\.expected_importance < 0 \|\| b\.expected_importance > 5/);
});

test("el id es exacto, y diferencia proyecto inexistente y archivado", () => {
  assert.match(endpoint, /SELECT id,status,importance,updated_at,updated_by FROM projects WHERE id=\?/);
  assert.doesNotMatch(endpoint, /projectSlug|projectIndex/);
  assert.match(endpoint, /project no existe en el censo.*404/);
  assert.match(endpoint, /project archivado.*409/);
});

test("la escritura usa compare-and-swap y responde al conflicto entre pestañas", () => {
  assert.match(endpoint, /COALESCE\(importance,0\)=\?/);
  assert.match(endpoint, /current !== b\.expected_importance/);
  assert.match(endpoint, /importance conflict.*current_importance/);
  assert.match(endpoint, /current_updated_at: Number\(previous\.updated_at\) \|\| 0/);
  assert.match(endpoint, /current_updated_by: previous\.updated_by \|\| ""/);
});

test("repetir el valor actual es idempotente", () => {
  assert.match(endpoint, /if \(current === b\.importance\)/);
  assert.match(endpoint, /changed: false/);
  assert.match(endpoint, /changed: true/);
});
