import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const page=await readFile(new URL("./objetivos.html",import.meta.url),"utf8");

test("Objetivos elimina el encabezado visual Ideas a desarrollar",()=>{
  assert.doesNotMatch(page,/Ideas a desarrollar/i);
  assert.doesNotMatch(page,/class="block-hd"/);
  assert.match(page,/<\/details>\s*<\/div>\s*<form class="add" id="addForm"/);
});

test("Objetivos conserva una jerarquía de títulos única y clara",()=>{
  assert.equal((page.match(/<h1\b/g)||[]).length,1);
  assert.match(page,/<h1>🎯 Objetivos<\/h1>/);
  assert.equal((page.match(/<h2\b/g)||[]).length,1);
  assert.match(page,/<h2>🏛️ El Consejo<\/h2>/);
});

test("el contador accesible vive junto al h1 sin cambiar el cálculo",()=>{
  assert.match(page,/<h1>🎯 Objetivos<\/h1>\s*<span class="objective-count" id="objectiveCount" role="status" aria-label="Número total de objetivos" aria-live="polite" aria-atomic="true">0 objetivos<\/span>/);
  assert.match(page,/\$\("#objectiveCount"\)\.textContent=objectiveCountLabel\(scoped\.length\)/);
  assert.doesNotMatch(page,/\$\("#count"\)/);
});

test("cabecera y contador se adaptan al móvil",()=>{
  assert.match(page,/\.page-intro>summary\{[^}]*flex-wrap:wrap/);
  assert.match(page,/@media\(max-width:520px\)\{[\s\S]*?\.objective-count\{font-size:10px\}/);
  assert.match(page,/\.objective-count\{[^}]*white-space:nowrap/);
});
