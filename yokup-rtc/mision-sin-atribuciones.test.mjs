// El título de una misión dice QUÉ hay que hacer, no quién lo pidió ni cuándo.
//
// Carlos, viendo una tarjeta suya: «hay que eliminar […] las referencias a mí o la
// fecha en la descripción de la misión». El autor y el sello de la ficha ya lo
// dicen, y en los 120 caracteres del título esa coletilla se come el sitio de lo
// único que importa. Al quitarla entra además más texto útil antes del corte.
//
// Lo que NO puede pasar: que se borre un «Carlos» que forma parte de la frase.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const src = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
const i = src.indexOf("function cleanMissionAttributions");
const j = src.indexOf("__name(cleanMissionAttributions", i);
const cleanMissionAttributions = eval("(" + src.slice(i, j).replace(/^function /, "function ") + ")");

test("quita la atribución con fecha en cualquier posición de la frase", () => {
  assert.equal(
    cleanMissionAttributions("Los informes que nacen de una idea llevan la captura del video. Carlos, 7-ago-2026: asi queda mejor documentado."),
    "Los informes que nacen de una idea llevan la captura del video. Asi queda mejor documentado.");
  assert.equal(cleanMissionAttributions("Carlos, 7-ago-2026: quitar el auto aleatorio."), "Quitar el auto aleatorio.");
  assert.equal(cleanMissionAttributions("Encargo de Carlos el 7-ago-2026: arreglar el importador."), "Arreglar el importador.");
});

test("un paréntesis que sólo lleva fecha es metadato y se va", () => {
  assert.equal(cleanMissionAttributions("Rehacer el 404: hoy son 1.140 bytes (medido 7-ago-2026)"),
    "Rehacer el 404: hoy son 1.140 bytes");
  assert.equal(cleanMissionAttributions("Arreglar el aviso (2026-08-07) y publicarlo."), "Arreglar el aviso y publicarlo.");
});

test("un «Carlos» que forma parte de la frase se respeta", () => {
  for (const frase of [
    "Hablar con Carlos, que tiene el contexto de la campana.",
    "Migrar la web de Carlos: el dominio caduca.",
  ]) assert.equal(cleanMissionAttributions(frase), frase);
});

test("no estropea la redacción del resto del texto", () => {
  // Recapitalizar todo el texto convertiría «yokup.com» en «Yokup.com»: sólo se
  // sube la inicial justo donde se ha cortado.
  assert.equal(cleanMissionAttributions("Publicar admiranext.com. yokup.com queda para manana."),
    "Publicar admiranext.com. yokup.com queda para manana.");
});

test("sigue quitando la firma del responsable", () => {
  assert.equal(cleanMissionAttributions("Responsable: MorfeoMacMini. Publicar el aviso."), "Publicar el aviso.");
});
