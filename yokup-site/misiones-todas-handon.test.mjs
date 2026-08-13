import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const board=await readFile(new URL("./misiones.html",import.meta.url),"utf8");

test("Todas usa delegación estable después de que el marco mueva las pestañas",()=>{
  assert.match(board,/document\.addEventListener\("click",event=>\{/);
  assert.match(board,/closest\("#missionStateTabs \.tab\[data-f\]"\)/);
  assert.match(board,/userPicked=true;aplicaFiltro\(button\.dataset\.f\)/);
  assert.doesNotMatch(board,/STATE_TABS\.forEach\(b=>b\.onclick=/);
});

test("Activas conserva handON cli-declare resueltos recientes",()=>{
  assert.match(board,/\["fleet","decision-batch","cli-declare"\]\.includes\(t\.source\)/);
  assert.match(board,/missionSource\(t\).*Date\.now\(\)-_ms\(t\.resolved_at\|\|t\.updated_at\)/);
});
