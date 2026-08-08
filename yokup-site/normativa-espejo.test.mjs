import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// yokup.com/normativa es ESPEJO de admiranext.com/normativa, no una normativa
// paralela. Llegaron a divergir: la canónica iba por 11 reglas y el espejo por
// 7, con dos reglas que sólo existían aquí (Carlos, 2026-08-05: «unifícalas y
// manda la que más reglas tiene»). Se unificaron en 13 —las dos del espejo se
// absorbieron como 12 y 13— y el espejo se regenera con
// `python3 scripts/unifica-normativa.py`.
//
// Esta prueba no puede leer el otro repo, así que vigila lo que sí puede: que
// el espejo esté completo, bien numerado y declarado como espejo. Si alguien
// añade una regla SÓLO aquí, o rompe la numeración, salta. Al sincronizar de
// verdad se actualiza REGLAS y se vuelve a pasar.
const source = await readFile(new URL("./normativa.html", import.meta.url), "utf8");

const REGLAS = [
  "Identidad = persona + equipo físico",
  "Diccionario único de sufijos",
  "Los nombres antiguos se leen; no se propagan",
  "Sin máquina no hay identidad completa",
  "Una referencia para todo el trabajo",
  "La doctrina que crece se renumera y se anuncia",
  "Una sola forma de decir la versión",
  "Todo cambio se firma por su responsable y su equipo",
  "Cada cambio publicado, una versión nueva",
  "OnIdle horario: tres acciones cuando el equipo está desatendido",
  "Modo rápido siempre puesto",
  "El proyecto acompaña al agente responsable",
  "Siempre la última versión — y su autor",
  "Lo que se decide y lo que se hace se da de alta, siempre",
  "Tu identidad se comprueba en tu sesión, no se copia del censo",
  "A un consejero se le enseña con guiones, no con vídeos",
  "Cada cierre declara sus puntos y el total verificado",
  "Introducirse: el día empieza dándose de alta",
  "Dos Xpacios, un origen y responsabilidades distintas",
  "App de escritorio solo donde hay un humano; el resto, CLI",
  "Tarea, mision u objetivo — y todo encargo declara lo que produjo",
  "El cierre son tres líneas, y son las mismas corras donde corras",
  "Cositas: delegar es obligatorio y el cierre declara el contexto gastado",
];

const bloque = source.slice(
  source.indexOf('<section class="rule">'),
  source.indexOf('<footer class="foot">'),
);
const secciones = [...bloque.matchAll(
  /<section class="rule">\s*<div class="num">(\d+)<\/div>\s*<div>\s*<h2>([\s\S]*?)<\/h2>/g,
)].map((m) => ({ num: m[1], titulo: m[2].replace(/<[^>]+>/g, "").trim() }));

test("el espejo lleva exactamente las reglas de la canónica, en orden", () => {
  assert.deepEqual(secciones.map((s) => s.titulo), REGLAS,
    "el espejo divergió de admiranext.com/normativa — regenera con scripts/unifica-normativa.py");
});

test("la numeración es contigua desde 01 y sin huecos", () => {
  assert.deepEqual(secciones.map((s) => s.num),
    REGLAS.map((_, i) => String(i + 1).padStart(2, "0")));
});

test("ninguna regla se repite", () => {
  assert.equal(new Set(REGLAS).size, REGLAS.length);
});

test("las dos reglas absorbidas del espejo siguen vivas, no se perdieron al unificar", () => {
  for (const t of ["El proyecto acompaña al agente responsable", "Siempre la última versión — y su autor"]) {
    assert.ok(secciones.some((s) => s.titulo === t), `se perdió la regla «${t}»`);
  }
  // su contenido propio, no sólo el titular
  assert.match(bloque, /primary_responsible/);
  assert.match(bloque, /ykAgentIdentity\.same/);
  assert.match(bloque, /puntos de retorno/);
});

test("el espejo publica la gobernanza común sin inventar responsables", () => {
  const gobierno = source.match(/<section class="rule">\s*<div class="num">19<\/div>[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(gobierno, /Xpacio de AdmiraNeXT/);
  assert.match(gobierno, /Xpacio de\s+Yokup\.com/);
  assert.match(gobierno, /Arquitecto\s+Carlos/);
  assert.match(gobierno, /importancia de ambos Xpacios\s+      y de sus proyectos es equivalente/);
  assert.match(gobierno, /Neo(?:\s|<[^>]+>)*es el máximo responsable de AdmiraNeXT/);
  assert.match(gobierno, /Morfeo(?:\s|<[^>]+>)*es el máximo\s+responsable de Yokup\.com/);
  assert.match(gobierno, /ambos están dirigidos por Carlos/);
});

test("el pie se declara espejo y cita el sello de la canónica", () => {
  const pie = source.slice(source.indexOf('<footer class="foot">'));
  assert.match(pie, /Espejo de <a href="https:\/\/www\.admiranext\.com\/normativa">/);
  assert.match(pie, /v\.\d{2}\.\d{2}\.\d{4}\.r\d+\.\d{2}:\d{2}/,
    "el pie debe citar la versión canónica que refleja");
});

test("los enlaces heredados de la canónica salen absolutos: aquí no hay /webmaster", () => {
  const relativos = [...bloque.matchAll(/href="(\/[^/][^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(relativos, [],
    `enlaces relativos dentro de las reglas: ${relativos.join(", ")} — romperían fuera de admiranext.com`);
  assert.match(bloque, /href="https:\/\/www\.admiranext\.com\/webmaster"/);
});
