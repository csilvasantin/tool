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

test("se compara lo publicado contra lo que corre, no contra sí mismo", () => {
  assert.match(frame, /String\(d\.version\)\.trim\(\) !== BUILD_VERSION/);
  assert.match(frame, /marcaPestanaCaduca/);
});

test("no avisa cuando no hay sello que comparar (local, preview)", () => {
  assert.match(frame, /BUILD_VERSION !== "versión pendiente"/,
    "sin sellado, avisar sería un falso positivo — justo lo que se quiere evitar");
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
