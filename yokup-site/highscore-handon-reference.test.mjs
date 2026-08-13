import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const html=await readFile(new URL("./highscore.html",import.meta.url),"utf8");

test("la carrera conserva y pinta la referencia inequívoca del handON",()=>{
  assert.match(html,/reference:item\.reference \|\| ""/);
  assert.match(html,/reference:trabajo\.reference \|\| ""/);
  assert.match(html,/resumen\.reference \? resumen\.reference \+ " · "/);
});
