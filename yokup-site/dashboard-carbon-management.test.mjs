// DCL-58b9acb160f8d2b507f361e4 · eliminación segura, enlaces y fechas Carbono.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./dashboard.html", import.meta.url), "utf8");

test("cada agente Carbono ofrece una cruz accesible y nunca borra sin confirmación", () => {
  assert.match(source, /class="pa-carbon-delete" data-pa-carbon-delete=/);
  assert.match(source, /aria-label="Eliminar a /);
  assert.match(source, /if\(!confirm\(prompt\)\)return/);
  assert.match(source, /Quedarán sin Responsable Carbono/);
  assert.match(source, /expected_projects:expected,confirmed:true/);
  assert.match(source, /\/projects\/agents\/unassign/);
});

test("las etiquetas Carbono enlazan el site y muestran debajo la primera asignación", () => {
  assert.match(source, /function paCarbonSince\(ms\)/);
  assert.match(source, /return "desde "\+new Intl\.DateTimeFormat/);
  assert.match(source, /desde fecha no disponible/);
  assert.match(source, /<a class="pa-carbon-project" data-carbon-project=/);
  assert.match(source, /target="_blank" rel="noopener noreferrer"/);
  assert.match(source, /<small>'\+esc\(since\)\+'<\/small>/);
  assert.match(source, /firstAssignedAt:Number\(project\.carbon_first_assigned_at\)\|\|0/);
});

test("retirar una familia de Silicio también exige confirmación", () => {
  assert.match(source, /function paRemoveFamily[\s\S]*?if\(!confirm\("Quitar a "\+familyId/);
  assert.match(source, /El proyecto puede quedar sin Agente de Silicio asignado/);
});

test("un proyecto versionado usa captura o monograma, nunca carpeta", () => {
  assert.match(source, /function paProjectIconMarkup\(project\)/);
  assert.match(source, /versioned\?'<span class="pa-version-thumb"/);
  assert.match(source, /onerror="this\.remove\(\)"/);
  assert.match(source, /const fallback=versioned\?/);
});
