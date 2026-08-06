import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const frame=await readFile(new URL("./yk-frame.js",import.meta.url),"utf8");
const paint=frame.slice(frame.indexOf("function paintProject()"),frame.indexOf("function loadProjects()"));
const loadStart=frame.indexOf("function loadProjects()");
const load=frame.slice(loadStart,frame.indexOf('window.addEventListener("storage"',loadStart));

test("botón y primera opción comparten projectTotal para 0, 1 y n",()=>{
  const label=(prefix,total)=>prefix+" · "+total;
  for(const total of [0,1,37]){
    assert.equal(label("TODOS",total),`TODOS · ${total}`);
    assert.equal(label("Todos",total),`Todos · ${total}`);
  }
  assert.match(frame,/function projectTotalLabel\(prefix\)\{return prefix\+" · "\+projectTotal;\}/);
  assert.match(paint,/allButtonLabel=projectTotalLabel\("TODOS"\),allOptionLabel=projectTotalLabel\("Todos"\)/);
  assert.match(paint,/name = ap \? \(ap\.name \|\| ap\.id\) : allButtonLabel/);
  assert.match(paint,/p\.id \? \(p\.name \|\| p\.id\) : allOptionLabel/);
});

test("texto visible, datos y ARIA de Todos usan la misma instantánea",()=>{
  assert.equal((paint.match(/data-yk-project-total/g)||[]).length,2);
  assert.match(paint,/btn\.setAttribute\("data-yk-project-total",String\(projectTotal\)\)/);
  assert.match(paint,/option\.setAttribute\("aria-label",allOptionLabel\);option\.setAttribute\("data-yk-project-total",String\(projectTotal\)\)/);
  assert.match(paint,/data-yk-base-label", "Proyecto: " \+ full/);
});

test("projects-changed y refetch repintan ambos contadores sin aceptar respuestas stale",()=>{
  const setTotal=load.indexOf("projectTotal=metadata.total");
  const repaint=load.indexOf("paintProject()");
  assert.ok(setTotal>=0&&repaint>setTotal,"actualiza total antes de repintar botón y menú");
  assert.match(load,/if\(seq!==projectLoadSeq\)return false/);
  assert.match(frame,/window\.addEventListener\("yk:projects-changed",function\(\)\{loadProjects\(\);\}\)/);
  assert.match(load,/projectTotal=0;PROJECT_SCOPE=null;paintProject\(\)/);
});
