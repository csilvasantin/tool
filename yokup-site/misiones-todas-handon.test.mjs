import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const board=await readFile(new URL("./misiones.html",import.meta.url),"utf8");
const missionUi=await readFile(new URL("./yk-misiones.js",import.meta.url),"utf8");

test("Todas conserva listener directo cuando el marco mueve el mismo nodo",()=>{
  assert.match(board,/STATE_TABS\.forEach\(button=>button\.addEventListener\("click",\(\)=>\{/);
  assert.match(board,/userPicked=true;aplicaFiltro\(button\.dataset\.f\)/);
  assert.match(board,/mover \(no clonar\): preserva los event listeners ya enlazados|MUEVE estos mismos nodos al raíl \(no los clona\)/);
  assert.doesNotMatch(board,/document\.addEventListener\("click",event=>/);
});

test("Activas conserva handON cli-declare resueltos recientes",()=>{
  assert.match(board,/\["fleet","decision-batch","cli-declare"\]\.includes\(t\.source\)/);
  assert.match(board,/missionSource\(t\).*Date\.now\(\)-_ms\(t\.resolved_at\|\|t\.updated_at\)/);
});

test("la interfaz distingue las tres fuentes canónicas de misión",()=>{
  assert.match(missionUi,/"decision-batch":\s*"🗳 Decisión"/);
  assert.match(missionUi,/"cli-declare":\s*"⌨️ Declarada"/);
});
