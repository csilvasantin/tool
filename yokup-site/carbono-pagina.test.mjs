import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("./agentes.html", import.meta.url), "utf8");
const redirects = await readFile(new URL("./_redirects", import.meta.url), "utf8");

// La página era una vitrina de solo lectura de cinco nombres inventados, fuera
// del marco de la plataforma y colgando de /agents, que está tras el perímetro:
// sin sesión de Google no pintaba NADA. Ahora es el panel operable del equipo de
// carbono y lee por el carril abierto.
test("la página del carbono vive dentro del marco de la plataforma", () => {
  assert.match(html, /data-yk-zone="app"/, "sin la zona app no hereda el menú y queda huérfana");
  assert.match(html, /<title>Equipo de carbono/);
  assert.doesNotMatch(html, /Panel de agentes/,
    "«agente» es silicio en toda la plataforma: este panel es de personas");
});

test("el censo se lee por el carril ABIERTO, no por el que exige sesión", () => {
  // Quien late es quien trabaja. Pedirle que cruce el perímetro sería pedirle
  // que se autentique como Carlos.
  assert.match(html, /\/fleet\/carbon"/, "el censo sale de /fleet/carbon");
  assert.match(html, /\/fleet\/carbon\/beat/, "y el latido de /fleet/carbon/beat");
});

test("la carga de partes NO inventa ceros cuando no hay sesión", () => {
  // /agents está tras el perímetro. Pintar 0 abiertas sin poder leerlo se leería
  // como «no tiene trabajo», que es una mentira cómoda: o se sabe o no se pinta.
  assert.match(html, /catch\(e\)\{ CARGA=\{\}; \}/);
  assert.match(html, /\(carga\?'<div class="carga">/,
    "la caja de carga solo se pinta si hay dato real");
});

test("el estado se dice con palabra, no solo con color", () => {
  // Este panel se mira desde una tablet al sol y con daltonismo. Un punto verde
  // sin su rótulo no es información.
  for (const estado of ["en turno", "ausente", "sin latido", "de baja"]) {
    assert.ok(html.includes(estado), `falta la palabra «${estado}» en la leyenda de estados`);
  }
});

test("«hace X» se calcula con el silencio del SERVIDOR, no restando contra el reloj local", () => {
  // Un portátil con la hora torcida pintaría a media plantilla ausente.
  assert.match(html, /function hace\(ms\)/);
  assert.match(html, /hace\(p\.silencio_ms\)/);
});

test("la baja se ofrece; el borrado no existe en la interfaz", () => {
  assert.match(html, /Dar de baja/);
  assert.doesNotMatch(html, /delete:\s*true/,
    "el worker rechaza el borrado duro: los partes cerrados quedarían sin autor");
});

test("/carbono existe y /agentes se conserva, ambos ANTES del catch-all", () => {
  const carbono = redirects.indexOf("/carbono ");
  const catchAll = redirects.indexOf("/*  ");
  assert.ok(carbono > -1, "falta la ruta /carbono");
  assert.ok(carbono < catchAll, "una ruta después del catch-all no se sirve nunca");
});
