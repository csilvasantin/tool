import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("./normativa.html", import.meta.url), "utf8");
const rule = html.match(/<section class="rule">\s*<div class="num">17<\/div>[\s\S]*?<\/section>/)?.[0] ?? "";

test("el espejo exige ganancia y total relevante al cerrar trabajo", () => {
  assert.match(rule, /misión, un objetivo o una tarea<\/b>/);
  assert.match(rule, /cuántos puntos ha ganado ese cierre/);
  assert.match(rule, /total relevante de cada agente/);
  assert.match(rule, /Highscore o en su API vigente/);
  assert.match(rule, /fuente y la hora/);
});

test("el espejo no puntúa una identidad discrepante", () => {
  assert.match(rule, /0 puntos atribuidos · pendiente de verificación/);
  assert.match(rule, /no se atribuyen puntos ni se sobrescribe esa declaración/);
  assert.match(rule, /captura actual/);
  assert.match(rule, /esquina inferior izquierda/);
});
