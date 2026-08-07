import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("./objetivos.html", import.meta.url), "utf8");
const form = page.slice(page.indexOf('<form class="add" id="addForm"'), page.indexOf("</form>") + 7);

test("tipo, consejero y proyecto preceden al título y al detalle", () => {
  const ids = ["fTag", "fSeat", "fProject", "fTitle", "fBody", "fBtn"];
  const positions = ids.map(id => form.indexOf(`id="${id}"`));

  assert.ok(positions.every(position => position >= 0), "se conservan todos los controles e ids");
  assert.deepEqual(positions, positions.slice().sort((a, b) => a - b), "el orden semántico coincide con el visual");
  assert.match(form, /<div class="row objective-selectors">[\s\S]*?<select id="fTag"[\s\S]*?<select id="fSeat"[\s\S]*?<select id="fProject"[\s\S]*?<\/div>\s*<div class="hd">/);
  assert.match(form, /<textarea id="fBody"[\s\S]*?<div class="objective-actions">\s*<button type="submit" id="fBtn">Añadir idea<\/button>/);
});

test("la reorganización conserva botones, flujo y un responsive explícito", () => {
  assert.equal((form.match(/id="genBtn"/g) || []).length, 1);
  assert.equal((form.match(/id="fBtn"/g) || []).length, 1);
  assert.match(form, /id="genBtn"[^>]*>✨ Idea nueva<\/button>/);
  assert.match(form, /id="fBtn">Añadir idea<\/button>/);
  assert.match(page, /\.objective-actions\{flex:1 1 100%;display:flex;justify-content:flex-end\}/);
  assert.match(page, /@media\(max-width:520px\)\{[\s\S]*?\.add \.objective-selectors>select,\.add \.objective-actions>#fBtn\{flex:1 1 100%;width:100%;margin-left:0\}/);
});
