import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./highscore.html", import.meta.url), "utf8");

test("Cómo se puntúa está contraído por defecto", () => {
  assert.match(html, /<details class="nota score-formula" id="formula">/);
  assert.doesNotMatch(html, /<details[^>]+id="formula"[^>]*\sopen(?:\s|=|>)/);
  assert.match(html, /<summary><span class="score-formula-title">Cómo se puntúa<\/span>/);
  assert.match(html, /\.score-formula-toggle::before\{content:"Mostrar  ▸"\}/);
  assert.match(html, /\.score-formula\[open\] \.score-formula-toggle::before\{content:"Ocultar  ▾"\}/);
});

test("la explicación dinámica se pinta dentro del cuerpo sin destruir el control", () => {
  assert.match(html, /id="formulaBody"/);
  assert.match(html, /formula = document\.getElementById\("formula"\), n = document\.getElementById\("formulaBody"\)/);
  assert.match(html, /var html = '<ul>'/);
  assert.doesNotMatch(html, /n\.innerHTML = '<h2>Cómo se puntúa/);
});

test("el control usa details y summary nativos accesibles", () => {
  assert.match(html, /\.score-formula>summary\{[^}]*cursor:pointer[^}]*list-style:none/);
  assert.match(html, /\.score-formula>summary:hover,\.score-formula>summary:focus-visible/);
  assert.match(html, /<span class="score-formula-toggle" aria-hidden="true"><\/span>/);
});
