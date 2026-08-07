// El trabajo no se reparte a suertes.
//
// Carlos: «hay que eliminar el auto aleatorio». El AUTO del alta sorteaba persona
// y máquina entre las que estuvieran online: con la flota desigual, el azar podía
// mandar el encargo a quien ya tenía cinco misiones abiertas y dejar parado al que
// no tenía ninguna, y dos altas del mismo encargo acababan en máquinas distintas
// sin motivo. El criterio bueno ya se calculaba al lado para otra cosa.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const cab = await readFile(new URL("./yk-cabezal.js", import.meta.url), "utf8");

test("no queda sorteo en la asignación del alta", () => {
  assert.doesNotMatch(cab, /function autoRandom/);
  assert.doesNotMatch(cab, /pares\[Math\.floor\(Math\.random\(\)/);
  // Ni siquiera en el respaldo de «nadie online»: el orden del censo es una
  // respuesta, el azar no.
  const i = cab.indexOf("function autoLibre"), j = cab.indexOf("// ── PARSEO DEL TEXTO", i);
  assert.doesNotMatch(cab.slice(i, j), /Math\.random/);
});

test("AUTO es el equipo con menos misiones abiertas", () => {
  assert.match(cab, /function autoLibre\(\)/);
  assert.match(cab, /const pick = ALTA_SEL\.auto \? autoLibre\(\) :/);
  assert.match(cab, /CARGA_PM\[p \+ "\|" \+ i\.norm\]/, "primero la carga en esa máquina");
  assert.match(cab, /CARGA_P\[p\]/, "luego la carga total del agente");
  assert.match(cab, /UNIV\.indexOf\(p\)/, "y el censo desempata, para que sea determinista");
});

test("el botón dice lo que hace", () => {
  assert.doesNotMatch(cab, /Auto · aleatorio/);
  assert.match(cab, /🎯 Auto · el más libre/);
  assert.match(cab, /"menos carga"/);
});
