import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./highscore.html", import.meta.url), "utf8");
const raceStart = html.indexOf("function pintaCarrera(");
const raceEnd = html.indexOf("\n  function fijaFaseSalida", raceStart);
const raceSource = html.slice(raceStart, raceEnd);

function cssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp("(?:^|\\n)" + escaped + "\\{([^}]*)\\}"));
  assert.ok(match, `falta la regla ${selector}`);
  return match[1];
}

test("la misión permanece totalmente oculta en salida y progreso cero", () => {
  const mission = cssRule(".refresh-mission");
  assert.match(mission, /opacity:0/);
  assert.match(mission, /visibility:hidden/);
  assert.match(html, /\.refresh-race\.phase-ready \.refresh-mission,\.refresh-race\.phase-set \.refresh-mission,\.refresh-race\.phase-go \.refresh-mission\{[^}]*(?:opacity:0|visibility:hidden)/);
  assert.match(html, /carril\.classList\.toggle\("race-started", progresoAtleta > 0\)/);
  assert.match(html, /\.refresh-lane\.race-started \.refresh-mission\{[^}]*opacity:1[^}]*visibility:visible/);
});

test("no queda dorsal entre la línea y el corredor", () => {
  assert.doesNotMatch(html, /refresh-place|place-revealed|rectDorsal|\bdorsal\b/i);
  assert.match(cssRule(".refresh-runner"), /z-index:3/);
});

test("el nombre vive en su columna y la cinta termina en el borde de pista", () => {
  const finish = cssRule(".refresh-finish");
  assert.match(finish, /right:0/);
  assert.match(html, /\.refresh-agent\{position:static[^}]*text-overflow:ellipsis[^}]*white-space:nowrap/,
    "el nombre debe ocupar su columna estable, fuera de la geometría de la pista");
  assert.doesNotMatch(html, /MARGEN_NOMBRE_META_PX|empujeAgente|cruceAgente/);
  assert.doesNotMatch(raceSource, /agente\.style\.(?:transform|opacity|left)/);
});

test("pista, cinta, cruce, parada y relleno comparten una geometría final", () => {
  const track = cssRule(".refresh-track::before"), finish = cssRule(".refresh-finish");
  assert.match(track, /left:var\(--track-start\)[^}]*right:var\(--finish-width\)/);
  assert.match(finish, /right:0[^}]*width:var\(--finish-width\)/);
  assert.match(raceSource, /inicioPista = relleno \? relleno\.offsetLeft : 0/);
  assert.match(raceSource, /metaLinea = cinta \? cinta\.offsetLeft : Math\.max\(inicioPista, carril\.clientWidth - 36\)/);
  assert.match(raceSource, /salidaCorredor = inicioPista \+ SALIDA_CORREDOR_OFFSET_PX/);
  assert.match(raceSource, /centroAtleta = salidaCorredor \+ \(metaLinea \+ META_CORREDOR_PX - salidaCorredor\) \* progresoAtleta/);
  assert.match(raceSource, /avancePista = Math\.max\(0, Math\.min\(metaLinea - inicioPista, centroAtleta - inicioPista\)\)/);
  assert.match(raceSource, /relleno\.style\.width = avancePista \+ "px"/);
  assert.match(raceSource, /centroAtleta \+ RADIO_CORREDOR_PX >= metaLinea/);
});

test("READY SET GO usa una placa arcade grande, diferenciada y reducible", () => {
  const call = cssRule(".race-call");
  assert.doesNotMatch(call, /border-(?:top|bottom):/);
  assert.match(call, /border:[^;}]+/);
  assert.match(call, /background:[^;}]+/);
  assert.match(call, /padding:[^;}]+/);
  assert.match(call, /font-size:clamp\([^)]*\)/);
  assert.match(html, /\.refresh-race\.phase-ready \.race-call\{[^}]*(?:color|border-color|background):/);
  assert.match(html, /\.refresh-race\.phase-set \.race-call\{[^}]*(?:color|border-color|background):/);
  assert.match(html, /\.refresh-race\.phase-go \.race-call\{[^}]*(?:color|border-color|background):/);
  assert.match(html, /@media \(prefers-reduced-motion:reduce\)[\s\S]*?\.race-call[^}]*\{animation:none!important;transition:none!important/);
  assert.match(html, /var fases = \["ready", "set", "go"\], llamadas = \["READY", "SET", "GO"\]/);
});
