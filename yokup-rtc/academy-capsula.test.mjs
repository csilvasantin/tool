import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// FLT-1333 (Carlos, 2026-08-08): «lanzar cada hora en punto una ventana de formación
// para que se active una cápsula de conocimiento en admira.academy».
const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");

function fuente(nombre){
  const i = source.indexOf("async function " + nombre + "(");
  assert.notEqual(i, -1, "falta " + nombre);
  const j = source.indexOf("\n}\n", i);
  return source.slice(i, j);
}

test("una hora, una cápsula: la clave primaria es la garantía, no un candado", () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS academy_capsulas \(hour_start INTEGER PRIMARY KEY/);
  const tick = fuente("runAcademyCapsuleTick");
  assert.match(tick, /Math\.floor\(ahora \/ ACADEMY_HORA_MS\) \* ACADEMY_HORA_MS/,
    "la hora se alinea en punto, no cuenta 3600 s desde la última");
  assert.match(tick, /SELECT \* FROM academy_capsulas WHERE hour_start=\?/);
  assert.match(tick, /if \(ya\) return \{ ok:true, nueva:false/, "reintentar la misma hora no crea otra");
  assert.match(tick, /INSERT OR IGNORE INTO academy_capsulas/);
  assert.match(source, /var ACADEMY_HORA_MS = 60 \* 60 \* 1000/);
});

test("la silla sale de la hora: rotación de las ocho, sin estado que llevar", () => {
  const tick = fuente("runAcademyCapsuleTick");
  assert.match(tick, /COUNCIL_ORDER\[Math\.floor\(hourStart \/ ACADEMY_HORA_MS\) % COUNCIL_ORDER\.length\]/);
  assert.match(source, /const COUNCIL_ORDER = \["ceo", "cto", "coo", "cfo", "cco", "cdo", "cxo", "cso"\]/);
});

test("la cápsula se ELIGE de lo que existe, y #formacion manda", () => {
  const tick = fuente("runAcademyCapsuleTick");
  assert.match(tick, /seatKnowledgeFrom\(await stockIndex\(\), seat, 0\)/, "reutiliza el conocimiento del Consejo");
  assert.match(tick, /piezas\.filter\(\(p\) => p\.origin === "formado"\)/);
  assert.match(tick, /const pool = formacion\.length \? formacion : piezas/,
    "lo que le trajeron para formarse va primero; si no hay, lo que tenga");
});

test("pixeria caída no deja la hora en blanco: cae a una lección de la Academia", () => {
  const tick = fuente("runAcademyCapsuleTick");
  assert.match(tick, /catch \(e\) \{ \/\* pixeria caida no deja la hora sin capsula/);
  assert.match(tick, /if \(!elegida\)/);
  assert.match(tick, /source:"academia\/leccion"/);
  assert.match(source, /var ACADEMY_LECCIONES = \[/);
  for (const id of ["identity","ecosystem","mission","closure"]) assert.match(source, new RegExp('id:"' + id + '"'));
});

test("la Academia puede leerla sin sesión, y preguntar abre la hora", () => {
  assert.match(source, /url\.pathname === "\/academy\/capsula" && req\.method === "GET"/);
  const i = source.indexOf('url.pathname === "/academy/capsula"');
  const bloque = source.slice(i, i + 700);
  assert.match(bloque, /const r = await runAcademyCapsuleTick\(env\)/,
    "si nadie pasó por el worker a las HH:00, la visita de la Academia abre la hora");
  assert.match(bloque, /historia/);
  // Pública: no puede estar en el set de rutas con sesión de Google.
  const protegidas = source.slice(source.indexOf("var PROTECTED"), source.indexOf("var PROTECTED") + 900);
  assert.doesNotMatch(protegidas, /academy/);
});

test("la rutina del reloj la incluye, con su propio latido", () => {
  assert.match(source, /await step\("academyCapsule", \(\) => runAcademyCapsuleTick\(env\)\)/);
});
