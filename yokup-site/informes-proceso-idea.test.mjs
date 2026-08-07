// Los informes que nacen de una idea enseñan el vídeo que la originó.
//
// Carlos, 7-ago-2026: «los informes que vengan de ideas, el proceso tiene que ser
// la captura del vídeo de la idea, así queda mucho mejor documentado y podemos
// comparar con lo que hemos hecho». Puestas una al lado de la otra, Proceso y
// Captura cuentan la historia entera: de dónde salió la misión y en qué quedó.
//
// Lo que NO puede pasar: que una misión que no viene de una idea pierda su captura
// de proceso, ni que el vídeo se presente como si fuera el CLI trabajando.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("./informes.html", import.meta.url), "utf8");
const objetivos = await readFile(new URL("./objetivos.html", import.meta.url), "utf8");

test("con idea, la columna Proceso enseña el vídeo que la originó", () => {
  assert.match(page, /const proc = t\.idea_image/);
  assert.match(page, /"Ampliar la idea que originó la misión"/);
  assert.match(page, /"La idea que lo originó"/);
});

test("sin idea, la captura de proceso sigue siendo exactamente la de siempre", () => {
  assert.match(page, /: shotHTML\(t\.process_image,\s*\n\s*t\.process_image \? "Ampliar el proceso — el CLI trabajando" : "sin captura de proceso",\s*\n\s*"Proceso del CLI", false\)/);
});

test("el vídeo no se disfraza de captura del CLI", () => {
  // Cada rama con su rótulo: el título del vídeo nunca dice «Proceso del CLI».
  const i = page.indexOf("const proc = t.idea_image");
  const rama = page.slice(i, page.indexOf("const capMission", i));
  assert.ok(rama.indexOf('"La idea que lo originó"') < rama.indexOf('"Proceso del CLI"'),
    "la rama de la idea lleva su propio rótulo");
});

test("el objetivo guarda de qué vídeo salió, y no lo hereda el siguiente", () => {
  assert.match(objetivos, /let FUENTE=\{img:"",url:""\};/);
  assert.match(objetivos, /source_image:FUENTE\.img,source_url:FUENTE\.url/);
  // Se limpia al guardar: una idea escrita a mano no puede heredar el vídeo anterior.
  assert.match(objetivos, /DRAFT=false; FUENTE=\{img:"",url:""\};/);
});
