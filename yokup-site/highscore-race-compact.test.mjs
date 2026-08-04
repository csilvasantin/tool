import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./highscore.html", import.meta.url), "utf8");
const raceStart = html.indexOf("function actualizaCarreraPodio(");
const raceEnd = html.indexOf("\n\n  function pintaFormula", raceStart);
const raceSource = html.slice(raceStart, raceEnd);

function cssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp("(?:^|\\n)" + escaped + "\\{([^}]*)\\}"));
  assert.ok(match, `falta la regla ${selector}`);
  return match[1];
}

function pixels(rule, property) {
  const match = rule.match(new RegExp(`${property}\\s*:\\s*([0-9.]+)px`));
  assert.ok(match, `falta ${property} en ${rule}`);
  return Number(match[1]);
}

test("cada pista reduce drásticamente altura y separación", () => {
  const lanes = cssRule(".refresh-lanes");
  const lane = cssRule(".refresh-lane");
  const track = cssRule(".refresh-track");
  assert.ok(pixels(lane, "min-height") <= 48, "el carril debe ocupar como máximo 48px");
  assert.ok(pixels(track, "min-height") <= 48, "la pista debe ocupar como máximo 48px");
  assert.ok(pixels(lanes, "gap") <= 1, "la separación vertical debe ser como máximo 1px");
  assert.match(track, /padding:[^;}]*px/, "la pista conserva márgenes internos explícitos");
});

test("READY SET GO vive dentro de cada pista, no flotando sobre toda la carrera", () => {
  const trackOpen = raceSource.indexOf("'<div class=\"refresh-track\">'");
  const call = raceSource.indexOf('class="race-call"', trackOpen);
  const trackClose = raceSource.indexOf("</div></div>'", trackOpen);
  assert.ok(trackOpen >= 0 && call > trackOpen && call < trackClose,
    "cada track debe contener su llamada READY/SET/GO");
  assert.doesNotMatch(html, /<span class="race-call" id="raceCall"/,
    "la llamada no puede seguir como overlay global");
  assert.match(html, /querySelectorAll\([^)]*\.race-call[^)]*\)/,
    "el cambio de fase actualiza las llamadas de todos los carriles");
  assert.match(html, /READY[\s\S]*SET[\s\S]*GO/);
});

test("la misión queda por detrás de la espalda del corredor", () => {
  const mission = raceSource.indexOf('class="refresh-mission"');
  const runner = raceSource.indexOf('class="refresh-runner ');
  const agent = raceSource.indexOf('class="refresh-agent"');
  assert.ok(mission >= 0 && mission < runner && runner < agent,
    "el orden de lectura debe ser misión, corredor decorativo y agente");
  assert.match(cssRule(".refresh-mission"), /z-index:1/);
  assert.match(cssRule(".refresh-runner"), /z-index:3/);
  assert.match(cssRule(".refresh-mission"), /transform:translateX\(calc\(-100% - [^)]+\)\)/,
    "el texto termina justo antes de la espalda del corredor");
  assert.match(html, /mision\.style\.left = posicionCorredor/);
});

test("compactar conserva orden de lectura y semántica accesible", () => {
  assert.match(html, /id="refreshLanes" role="list" aria-label="[^"]+"/);
  assert.match(raceSource, /role="listitem"/);
  assert.match(raceSource, /aria-label="Puesto ' \+ puesto \+ ', ' \+ esc\(agente\) \+ '\. ' \+ esc\(resumen\.title\)/);
  assert.match(raceSource, /data-race-role="runner" aria-hidden="true"/);
  assert.match(raceSource, /class="race-call"[^>]*aria-hidden="true"/);
  assert.doesNotMatch(raceSource, /aria-hidden="true"[^>]*data-race-role="agent"/);
});

test("la pista compacta sigue siendo legible en móvil y con movimiento reducido", () => {
  assert.match(html, /@media \(max-width:620px\)[\s\S]*?\.refresh-(?:lane|track|mission|agent)/);
  assert.match(html, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(html, /\.refresh-race\.paused \.refresh-runner svg\{animation-play-state:paused\}/);
});
