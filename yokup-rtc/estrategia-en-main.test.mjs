import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// El norte de cada equipo (/estrategia) vivía SOLO en la rama
// feat-estrategia-fase2 y se desplegó desde ahí el 2026-07-23. Al redesplegar el
// worker desde main el 2026-08-05 para publicar POST /declare, esas rutas
// desaparecieron de producción: GET /fleet/strategy pasó a devolver el catch-all
// y la página /estrategia se quedó en «solo local» sin que saltara ninguna
// alarma. Lo tumbé yo. Estas pruebas existen para que main sea desplegable sin
// perder trabajo que solo estaba en una rama.
const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");

test("la tabla strategy se crea en el esquema, no en una migración suelta", () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS strategy \(team TEXT PRIMARY KEY, text TEXT, updated_at INTEGER, updated_by TEXT\)/);
});

test("GET /fleet/strategy es PÚBLICO: los agentes leen su norte desde el CLI", () => {
  assert.match(source, /url\.pathname === "\/fleet\/strategy"/);
  const protegidas = source.slice(source.indexOf("var PROTECTED"), source.indexOf("\n", source.indexOf("var PROTECTED")));
  assert.doesNotMatch(protegidas, /"\/fleet\/strategy"/,
    "la lectura no puede exigir sesión: los agentes no tienen navegador");
  // devuelve SIEMPRE los dos equipos, aunque estén vacíos
  assert.match(source, /strategy: \{ atomos: by\.atomos \|\| blank, bits: by\.bits \|\| blank \}/);
});

test("POST /strategy sí está protegido y solo admite atomos|bits", () => {
  assert.match(source, /url\.pathname === "\/strategy" && req\.method === "POST"/);
  const protegidas = source.slice(source.indexOf("var PROTECTED"), source.indexOf("\n", source.indexOf("var PROTECTED")));
  assert.match(protegidas, /"\/strategy"/, "escribir el norte exige sesión del perímetro");
  assert.match(source, /team debe ser atomos\|bits/);
  assert.match(source, /ON CONFLICT\(team\) DO UPDATE SET text=excluded\.text/);
});

test("main es autosuficiente: no quedan rutas vivas solo en una rama", () => {
  // Si alguien vuelve a añadir una ruta fuera de main y la despliega desde su
  // rama, el siguiente deploy desde main la borra en silencio. La prueba no
  // puede leer otras ramas, pero sí fijar que estas tres piezas están aquí.
  for (const pieza of [
    /CREATE TABLE IF NOT EXISTS strategy/,
    /url\.pathname === "\/fleet\/strategy"/,
    /url\.pathname === "\/strategy" && req\.method === "POST"/,
  ]) assert.match(source, pieza);
});

// ── CONFIG DE FLOTA (Carlos, 2026-08-05) ──────────────────────────────────
// MODO_RAPIDO no es un secreto: esta publicado en la normativa. Guardarlo en la
// Cupula obligaba a mover VAULT_ADMIN —la clave que protege secretos de verdad—
// para escribir una bandera publica. Vive aqui: lectura abierta para que los
// agentes la lean al arrancar sin credencial, escritura tras el perimetro.

test("GET /fleet/config es publico: se lee desde el CLI sin secreto", () => {
  assert.match(source, /url\.pathname === "\/fleet\/config"/);
  const protegidas = source.slice(source.indexOf("var PROTECTED"), source.indexOf("\n", source.indexOf("var PROTECTED")));
  assert.doesNotMatch(protegidas, /"\/fleet\/config"/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS fleet_config \(name TEXT PRIMARY KEY, value TEXT, updated_at INTEGER, updated_by TEXT\)/);
});

test("POST /config esta protegido y acota el nombre de la bandera", () => {
  assert.match(source, /url\.pathname === "\/config" && req\.method === "POST"/);
  const protegidas = source.slice(source.indexOf("var PROTECTED"), source.indexOf("\n", source.indexOf("var PROTECTED")));
  assert.match(protegidas, /"\/config"/);
  // nombre acotado: que no acabe siendo un cajon donde se cuele un secreto
  assert.match(source, /\/\^\[A-Z\]\[A-Z0-9_\]\{2,39\}\$\//);
  assert.match(source, /ON CONFLICT\(name\) DO UPDATE SET value=excluded\.value/);
});

test("la config NO vive en la Cupula: ahi solo van secretos", () => {
  // Se comprueba el USO, no la mencion: el comentario que explica por que no
  // esta en la boveda nombra la clave a proposito.
  assert.doesNotMatch(source, /env\.VAULT_ADMIN/,
    "el worker de Yokup no debe leer la clave de administracion de la boveda");
  assert.doesNotMatch(source, /admin=\$\{|[?&]admin=/,
    "ni firmarla en una URL hacia admira-vault");
  assert.doesNotMatch(source, /admira-vault[^"']*\/secret/,
    "ni escribir secretos en la Cupula desde aqui");
});
