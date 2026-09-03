import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("./highscore.html", import.meta.url), "utf8");

// Carlos, 15-ago-2026: con veintitantos agentes, quien entraba se comía una
// tabla que no cabía en pantalla para enterarse de lo único que se mira de un
// vistazo — quién va delante. Arranca con cinco filas y RANKING despliega.
test("la tabla nace COMPLETA; el modo compacto de cinco filas es opcional y se recuerda", () => {
  assert.match(html, /var RANKING_COMPACTO_FILAS = 5;/);
  assert.match(html, /var rankingCompacto = leeRankingCompacto\(\)/, "completa POR DEFECTO (Carlos, 3-sep-2026); compacta sólo si el usuario lo eligió");
  assert.match(html, /localStorage\.getItem\(RANKING_COMPACTO_KEY\) === "1"/);
  assert.match(html, /rankingCompacto \? lista\.slice\(0, RANKING_COMPACTO_FILAS\) : lista/);
});

test("recorta al PINTAR, no escondiendo filas con CSS", () => {
  // Un display:none dejaría veinte filas construidas y ordenándose para no
  // verse: el coste completo sin el beneficio.
  const fn = html.slice(html.indexOf("function pintaTabla(listaEntera)"));
  const cuerpo = fn.slice(0, fn.indexOf("function iniciaProgresionToggle"));
  assert.match(cuerpo, /var lista = rankingRecorta\(rankingListaCache\)/);
  assert.doesNotMatch(html, /\.score-main[^{]*\{[^}]*display:none/,
    "las filas sobrantes no se ocultan por estilo");
});

test("desplegar no vuelve a pedir datos ni reordena", () => {
  // La lista completa queda guardada al pintar, así que alternar es repintar.
  assert.match(html, /rankingListaCache = Array\.isArray\(listaEntera\) \? listaEntera : \[\]/);
  const alterna = html.slice(html.indexOf("function alternaRanking()"));
  assert.match(alterna.slice(0, 160), /pintaTabla\(rankingListaCache\)/);
  assert.doesNotMatch(alterna.slice(0, 160), /fetch|carga|ordena/i);
});

test("con cinco agentes o menos el botón se apaga en vez de mentir", () => {
  const fn = html.slice(html.indexOf("function pintaRankingToggle"));
  const cuerpo = fn.slice(0, fn.indexOf("function alternaRanking"));
  assert.match(cuerpo, /var sobran = Math\.max\(0, total - RANKING_COMPACTO_FILAS\)/);
  assert.match(cuerpo, /boton\.disabled = !sobran/);
  assert.match(cuerpo, /"No hay más agentes que mostrar"/);
  // Y cuando sí hay, el rótulo dice CUÁNTOS, que es la pregunta real.
  assert.match(cuerpo, /"Ver los " \+ total \+ " agentes"/);
  assert.match(html, /\.ranking-toggle:disabled\{[^}]*cursor:default/);
});

test("cada botón de la banda hace UNA cosa", () => {
  // El defecto que esto viene a corregir: el rótulo decía HIGHSCORE y lo que
  // abría era el podio, y nada gobernaba la tabla.
  assert.match(html, /id="podiumToggle"[^>]*aria-controls="podio"/);
  assert.match(html, /id="rankingToggle"[^>]*aria-controls="rankingScroll"/);
  assert.match(html, /getElementById\("podiumToggle"\)\.addEventListener\("click", alternaPodio\)/);
  assert.match(html, /getElementById\("rankingToggle"\)\.addEventListener\("click", alternaRanking\)/);
  // El estado abierto/cerrado se anuncia, no solo se pinta.
  assert.match(html, /boton\.setAttribute\("aria-expanded", String\(!rankingCompacto\)\)/);
});
