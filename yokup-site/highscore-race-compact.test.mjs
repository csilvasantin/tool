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

test("cada pista reserva tres líneas legibles y una separación compacta", () => {
  const lanes = cssRule(".refresh-lanes");
  const lane = cssRule(".refresh-lane");
  const track = cssRule(".refresh-track");
  assert.ok(pixels(lane, "min-height") <= 62, "el carril debe ocupar como máximo 62px");
  assert.ok(pixels(track, "min-height") <= 42, "la pista física debe ocupar como máximo 42px");
  assert.ok(pixels(lanes, "gap") <= 5, "la separación vertical debe ser como máximo 5px");
  assert.match(track, /padding:[^;}]*px/, "la pista conserva márgenes internos explícitos");
});

test("READY SET GO vive una sola vez fuera de los carriles y centrado por geometría real", () => {
  const lanes = html.indexOf('id="refreshLanes"'), call = html.indexOf('id="raceCall"');
  const raceClose = html.indexOf('</div>\n  </header>', lanes);
  assert.ok(lanes >= 0 && call > lanes && call < raceClose, "la placa es hermana persistente de la lista");
  assert.doesNotMatch(raceSource, /class="race-call"|indiceLlamada/,
    "ningún modo de carril puede recrear o desaturar la placa");
  assert.match(html, /document\.getElementById\("raceCall"\)/);
  assert.match(html, /start = trackRect\.left - raceRect\.left \+ trackStart/);
  assert.match(html, /meta = trackRect\.right - raceRect\.left - finishWidth/);
  assert.match(html, /centro = \(start \+ meta\) \/ 2/);
  assert.match(html, /new ResizeObserver\(centraLlamadaCarrera\)/);
  assert.match(cssRule(".race-call"), /left:0[^}]*top:0[^}]*translate\(-50%,-50%\)/,
    "la posición final la fija la medición, no una variable CSS eliminada");
  assert.match(cssRule(".race-call"), /font-size:clamp\(18px,2vw,24px\)[^}]*text-shadow:[^}]*var\(--call\)/,
    "la salida es grande y luminosa");
  assert.match(html, /@keyframes race-call-(?:ready|set|go)/,
    "READY/SET/GO conserva un gesto visual propio");
  assert.match(html, /READY[\s\S]*SET[\s\S]*GO/);
});

test("HIGHSCORE vive en una banda propia sobre todos los carriles", () => {
  assert.match(cssRule(".score-divider"), /display:flex[^}]*align-items:center[^}]*width:100%[^}]*border-top:[^}]*border-bottom:/);
  assert.ok(html.indexOf('id="refreshRace"') < html.indexOf('id="scoreDivider"'));
  assert.match(cssRule(".sonido"), /width:15px[^}]*height:15px[^}]*margin:0/);
});

test("el dorsal nace oculto bajo la línea y el corredor pasa por encima", () => {
  assert.match(cssRule(".refresh-place"), /z-index:2[^}]*left:calc\(var\(--track-start\) \+ 8px\)[^}]*bottom:0[^}]*opacity:0[^}]*visibility:hidden/);
  assert.match(html, /\.refresh-lane\.place-revealed \.refresh-place\{opacity:\.88;visibility:visible\}/);
  assert.match(cssRule(".refresh-runner"), /z-index:3/,
    "el corredor pasa visualmente por encima del dorsal pintado");
});

test("la misión vive dentro de la pista y sigue por detrás del corredor", () => {
  assert.match(raceSource,/class="refresh-agent"[\s\S]*class="refresh-lane-center"[\s\S]*class="refresh-mission"[\s\S]*runner \+ '<span class="refresh-finish"/,
    "el DOM generado debe leerse agente, pista con misión y corredor por encima");
  assert.match(html,/\.refresh-mission\{position:absolute;z-index:1/);
  assert.match(cssRule(".refresh-runner"), /z-index:3/);
  assert.match(html, /mision\.style\.left = posicionCorredor/);
  assert.match(html, /mision\.style\.width = espacioMision \+ "px"/);
  assert.match(html,/\.refresh-mission-detail\{display:block\}\.refresh-mission-title\{overflow:hidden;text-overflow:ellipsis;text-align:right\}/,
    "el texto se recorta dentro del recorrido y no invade el tiempo");
});

test("el sprint termina pronto y deja una celebración larga", () => {
  assert.match(html, /REFRESCO_MS = 24 \* 1000[^;]*CELEBRACION_MS = 15 \* 1000/);
});

test("compactar conserva orden de lectura y semántica accesible", () => {
  assert.match(html, /id="refreshLanes" role="list" aria-label="[^"]+"/);
  assert.match(raceSource, /role="listitem"/);
  assert.match(raceSource, /aria-label="Puesto ' \+ puesto \+ ', familia ' \+ esc\(agente\)[\s\S]*Responsable ' \+ esc\(responsable\)/);
  assert.match(raceSource, /data-race-role="runner" aria-hidden="true"/);
  assert.match(html, /id="raceCall"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.doesNotMatch(raceSource, /aria-hidden="true"[^>]*data-race-role="agent"/);
});

test("la pista compacta sigue siendo legible en móvil y con movimiento reducido", () => {
  assert.match(html, /@media \(max-width:620px\)[\s\S]*?\.refresh-(?:lane|track|mission|agent)/);
  assert.match(html, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(html, /\.refresh-race\.paused \.refresh-runner svg\{animation-play-state:paused\}/);
});
