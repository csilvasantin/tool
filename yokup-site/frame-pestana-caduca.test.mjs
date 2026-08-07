import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Una pestaña abierta desde antes de un deploy sigue sondeando datos frescos
// pero ejecuta el JS de su carga: la pantalla enseña cifras de hoy pintadas con
// código de ayer. Así reapareció el «0 que late» de /highscore cuando el
// servidor ya lo servía corregido (Carlos, 2026-08-05: «no puede haber falsos
// positivos ni información errónea»).
const frame = await readFile(new URL("./yk-frame.js", import.meta.url), "utf8");
const css = await readFile(new URL("./yk-frame.css", import.meta.url), "utf8");

test("el sello de la compilación que corre se captura ANTES de que lo pisen", () => {
  assert.match(frame, /var BUILD_VERSION = VERSION;/);
  const build = frame.indexOf("var BUILD_VERSION = VERSION;");
  const pinta = frame.indexOf("function paintPublicVersion");
  assert.ok(build > pinta, "BUILD_VERSION debe declararse tras paintPublicVersion, no dentro de él");
  // paintPublicVersion sigue pisando VERSION a propósito (el pie enseña lo
  // publicado); lo que no puede es dejarnos sin saber qué corre de verdad.
  assert.match(frame, /VERSION = clean;/);
});

// CORREGIDO el 7-ago-2026 (Carlos: «cuando pulso versión nueva · recargar vuelve
// a salir» · incidencia SVC-5FSKZH). Este test fijaba `d.version !== BUILD_VERSION`,
// que era precisamente el fallo: enfrentaba el ?v= escrito a mano en cada HTML
// contra el sello de version.json. Dos fuentes distintas que sólo casan si todos
// los caminos de publicación las escriben a la vez, y yokup.com se publica por dos
// que no sellan — así que la condición era cierta SIEMPRE y recargar no la limpiaba.
// Un test puede fijar un error: lo que se protege ahora es la regla buena.
test("cada fuente se compara consigo misma a lo largo de la pestaña", () => {
  assert.match(frame, /if \(SELLO_AL_CARGAR === null\) \{ SELLO_AL_CARGAR = sello; return; \}/);
  assert.match(frame, /if \(sello !== SELLO_AL_CARGAR\) marcaPestanaCaduca\(sello\)/);
  assert.doesNotMatch(frame, /!==\s*BUILD_VERSION/, "el ?v= no se enfrenta nunca al sello publicado");
  assert.match(frame, /marcaPestanaCaduca/);
});

test("no avisa cuando no hay nada con que comparar (local, preview)", () => {
  // La referencia se toma en el primer sondeo y hasta entonces no se dice nada;
  // si no hay version.json ni ETag, no hay aviso. Sin sellado, cero falsos positivos.
  assert.match(frame, /var SELLO_AL_CARGAR = null;/);
  assert.match(frame, /var HUELLA_AL_CARGAR = null;/);
  assert.match(frame, /if \(HUELLA_AL_CARGAR === null\) \{ HUELLA_AL_CARGAR = h; return; \}/);
  assert.match(frame, /if \(!h\) return;/, "sin ETag ni Last-Modified no se compara nada");
});

test("avisa una sola vez y nunca recarga por su cuenta", () => {
  assert.match(frame, /if \(_stale\) return;/);
  const i = frame.indexOf("function marcaPestanaCaduca");
  const j = frame.indexOf("function refreshPublicVersion", i);
  const cuerpo = frame.slice(i, j);
  assert.match(cuerpo, /addEventListener\("click", function \(\) \{ location\.reload\(\); \}\)/,
    "la recarga es del usuario: puede haber un filtro puesto o un formulario a medias");
  assert.doesNotMatch(cuerpo, /setTimeout[^;]*location\.reload/);
});

test("se revisa periódicamente y al volver a la pestaña", () => {
  assert.match(frame, /setInterval\(refreshPublicVersion, 120000\)/);
  assert.match(frame, /visibilitychange/);
});

test("el aviso se ve, se puede pulsar y respeta reduced-motion", () => {
  assert.match(css, /\.yk-stale\{/);
  assert.match(css, /\.yk-stale:focus-visible\{/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{ \.yk-stale\{ animation:none \} \}/);
  // ámbar, no el rojo de «equipo parado»: son severidades distintas
  assert.match(css, /\.yk-stale\{[^}]*background:#ffb454/s);
});
