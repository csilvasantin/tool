import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const page=await readFile(new URL("./objetivos.html",import.meta.url),"utf8");
const form=page.slice(page.indexOf('<form class="add" id="addForm"'),page.indexOf('</form>')+7);
const submit=page.slice(page.indexOf('$("#addForm").addEventListener("submit"'),page.indexOf('$("#filters").addEventListener'));

test("Objetivos elimina por completo el autor manual",()=>{
  assert.doesNotMatch(form,/fAuthor|Tu nombre|name=["']author/i);
  assert.doesNotMatch(page,/\$\("#fAuthor"\)/);
  assert.match(form,/<div class="row">\s*<select id="fTag"[\s\S]*<select id="fSeat"[\s\S]*<select id="fProject"[\s\S]*<button type="submit" id="fBtn">/);
});

test("POST /ideas omite author y conserva validación/campos del objetivo",()=>{
  assert.match(submit,/const title=\$\("#fTitle"\)\.value\.trim\(\); if\(!title\)return/);
  assert.match(submit,/const body=\{title,body:\$\("#fBody"\)\.value\.trim\(\),tag,seat:\$\("#fSeat"\)\.value,project:\$\("#fProject"\)\.value,scheduled_for:/);
  assert.doesNotMatch(submit,/author|email|localStorage/i);
  assert.match(submit,/fetch\(WORKER\+"\/ideas",\{method:"POST"/);
});

test("fila sin autor sigue siendo responsive en móvil",()=>{
  assert.match(page,/\.add select\{flex:1 1 150px\}/);
  assert.match(page,/@media\(max-width:520px\)\{[\s\S]*?\.add \.row>select,\.add \.row>#fBtn\{flex:1 1 100%;width:100%;margin-left:0\}/);
});
