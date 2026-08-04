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

test("el dorsal queda sobre la línea, visible y siempre debajo del corredor", () => {
  const place = cssRule(".refresh-place"), runner = cssRule(".refresh-runner");
  const placeZ = Number(place.match(/z-index:([0-9.]+)/)?.[1]);
  const runnerZ = Number(runner.match(/z-index:([0-9.]+)/)?.[1]);
  assert.ok(placeZ > 0 && placeZ < runnerZ, `z-index dorsal ${placeZ}, corredor ${runnerZ}`);
  assert.match(place, /bottom:7px/, "el dorsal debe quedar por encima de la línea situada en bottom 3px");
  const opacity = Number(place.match(/opacity:([0-9.]+)/)?.[1]);
  assert.ok(opacity >= 0.7, `opacidad insuficiente: ${opacity}`);
  assert.match(place, /font-weight:(?:900|950)/);
});

test("el nombre vive tras la cinta sin empuje ni desvanecido heredado", () => {
  const agent = cssRule(".refresh-agent"), finish = cssRule(".refresh-finish");
  assert.match(finish, /right:var\(--finish-gutter\)/);
  assert.match(agent, /left:calc\(100% - var\(--finish-gutter\) \+ var\(--agent-gap\)\)[^}]*right:4px/,
    "el nombre debe ocupar de forma estática la zona posterior a la cinta");
  assert.doesNotMatch(html, /MARGEN_NOMBRE_META_PX|empujeAgente|cruceAgente/);
  assert.doesNotMatch(raceSource, /agente\.style\.(?:transform|opacity|left)/);
});

test("pista, cinta, cruce, parada y relleno comparten una geometría final", () => {
  const track = cssRule(".refresh-track::before"), finish = cssRule(".refresh-finish");
  assert.match(track, /left:var\(--track-start\)[^}]*right:calc\(var\(--finish-gutter\) \+ var\(--finish-width\)\)/);
  assert.match(finish, /right:var\(--finish-gutter\)[^}]*width:var\(--finish-width\)/);
  assert.match(raceSource, /inicioPista = relleno \? relleno\.offsetLeft : 0/);
  assert.match(raceSource, /metaLinea = cinta \? cinta\.offsetLeft : Math\.max\(inicioPista, carril\.clientWidth - 36\)/);
  assert.match(raceSource, /centroAtleta = SALIDA_CORREDOR_PX \+ \(metaLinea \+ META_CORREDOR_PX - SALIDA_CORREDOR_PX\) \* progresoAtleta/);
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
