import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// El botón de /objetivos se llamaba «→ misión» y su confirmación decía «¿Convertir
// en misión?». NO es lo que hace: abre una ventana de decisión, tres consejeros
// miran el objetivo y de ahí salen 3 opciones; la misión llega después, con la
// opción elegida (Carlos, 2026-08-07: «no que vaya directamente a mision, es para
// trabajarla mas y que lo que se haga tenga mas sentido»).
//
// Un botón que anuncia el final del proceso invita a saltárselo. Por eso el
// nombre importa tanto como la máquina que hay detrás.
const source = await readFile(new URL("./objetivos.html", import.meta.url), "utf8");
const worker = await readFile(new URL("../yokup-rtc/src/index.js", import.meta.url), "utf8");

test("el botón nombra la ventana, no la misión", () => {
  assert.match(source, />→ ventana<\/button>/);
  assert.doesNotMatch(source, />→ misión<\/button>/, "el nombre viejo prometía saltarse el paso");
  assert.match(source, /title="Abrir ventana de decisión · 3 consejeros lo miran y salen 3 opciones \(3 min\)\. No pasa directo a misión"/);
});

test("la confirmación cuenta el proceso entero y no miente en el número de opciones", () => {
  const decide = source.slice(source.indexOf("async function decide(id){"),
    source.indexOf("toast(\"Abriendo ventana de decisión…\")"));
  const confirma = decide.match(/if\(!confirm\('([\s\S]*?)'\)\) return;/);
  assert.ok(confirma, "sigue habiendo confirmación antes de abrir la ventana");
  const texto = confirma[1];
  assert.match(texto, /¿Abrir ventana de decisión\?/);
  assert.match(texto, /Tres consejeros miran el objetivo y proponen 3 opciones/);
  assert.match(texto, /si no eliges, se toma la recomendada/);
  assert.match(texto, /La misión sale de esa opción, no de aquí/);
  assert.doesNotMatch(texto, /5 mejores opciones/, "el worker genera 3, no 5");
  assert.doesNotMatch(texto, /¿Convertir en misión\?/);
});

test("la etiqueta de orden y accesibilidad de la acción dice lo mismo que el botón", () => {
  assert.match(source, /"abrir ventana de decisión"/);
  assert.doesNotMatch(source, /"convertir en misión"/);
});

// Y la máquina tiene que sostener el nombre: si el objetivo nunca pasó por
// «estudio» no hay deliberación, y las 3 opciones salían a ciegas — un botón que
// promete tres consejeros y no los convoca.
test("el worker convoca al Consejo antes de generar las opciones", () => {
  const handler = worker.slice(worker.indexOf('url.pathname === "/ideas/decide"'),
    worker.indexOf("const options = await generateDecideOptions"));
  assert.match(handler, /if \(!idea\.review\) \{/);
  assert.match(handler, /generateCouncilReview\(env, idea\)/);
  assert.match(handler, /idea\.review = JSON\.stringify\(r\)/, "en el mismo formato que trae la fila");
  assert.match(handler, /catch \(e\) \{ \/\* la ventana no se cae por una deliberación \*\/ \}/,
    "best-effort: sin deliberación se decide peor, pero no decidir es peor");
  // y la deliberación sigue alimentando el prompt de las opciones
  assert.match(worker, /const delib = ideaDeliberationText\(idea\.review\);/);
});
