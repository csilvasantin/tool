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
  assert.ok(pixels(lane, "min-height") <= 42, "el carril debe ocupar como máximo 42px");
  assert.ok(pixels(track, "min-height") <= 42, "la pista debe ocupar como máximo 42px");
  assert.ok(pixels(lanes, "gap") <= 1, "la separación vertical debe ser como máximo 1px");
  assert.match(track, /padding:[^;}]*px/, "la pista conserva márgenes internos explícitos");
});

test("READY SET GO vive una sola vez en la pista central", () => {
  const trackOpen = raceSource.indexOf("'<div class=\"refresh-track\">'");
  const call = raceSource.indexOf('class="race-call"', trackOpen);
  const trackClose = raceSource.indexOf("</div></div>'", trackOpen);
  assert.ok(trackOpen >= 0 && call > trackOpen && call < trackClose,
    "la pista elegida contiene la llamada READY/SET/GO");
  assert.doesNotMatch(html, /<span class="race-call" id="raceCall"/,
    "la llamada no puede seguir como overlay global");
  assert.match(raceSource, /indiceLlamada = Math\.floor\(Math\.max\(0, filasCarrera\.length - 1\) \/ 2\)/,
    "tres pistas eligen la segunda; una pista elige la primera");
  assert.match(html, /document\.querySelector\("\.race-call"\)/,
    "el cambio de fase actualiza el único aviso");
  assert.match(cssRule(".race-call"), /left:var\(--track-start\)[^}]*right:calc\(var\(--finish-gutter\) \+ var\(--finish-width\)\)[^}]*margin-inline:auto[^}]*translateY\(-50%\)/,
    "el aviso queda centrado entre el inicio de pista y la cinta");
  assert.match(cssRule(".race-call"), /font-size:clamp\(18px,2vw,24px\)[^}]*text-shadow:[^}]*var\(--call\)/,
    "la salida es grande y luminosa");
  assert.match(html, /@keyframes race-call-(?:ready|set|go)/,
    "READY/SET/GO conserva un gesto visual propio");
  assert.match(html, /READY[\s\S]*SET[\s\S]*GO/);
});

test("HIGHSCORE y el mute se alinean con el carril central", () => {
  assert.match(cssRule("header.cab>h1"), /align-items:center[^}]*align-self:center[^}]*gap:7px/);
  assert.match(cssRule(".sonido"), /width:15px[^}]*height:15px[^}]*margin:0/);
});

test("el dorsal nace oculto bajo la línea y el corredor pasa por encima", () => {
  assert.match(cssRule(".refresh-place"), /z-index:2[^}]*left:calc\(var\(--track-start\) \+ 8px\)[^}]*bottom:0[^}]*opacity:0[^}]*visibility:hidden/);
  assert.match(html, /\.refresh-lane\.place-revealed \.refresh-place\{opacity:\.88;visibility:visible\}/);
  assert.match(cssRule(".refresh-runner"), /z-index:3/,
    "el corredor pasa visualmente por encima del dorsal pintado");
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
  assert.match(cssRule(".refresh-mission-title"), /width:100%[^}]*text-align:center/,
    "el texto usa todo el tramo conquistado desde el borde de MISIÓN");
});

test("el sprint termina pronto y deja una celebración larga", () => {
  assert.match(html, /REFRESCO_MS = 24 \* 1000[^;]*CELEBRACION_MS = 15 \* 1000/);
});

test("compactar conserva orden de lectura y semántica accesible", () => {
  assert.match(html, /id="refreshLanes" role="list" aria-label="[^"]+"/);
  assert.match(raceSource, /role="listitem"/);
  assert.match(raceSource, /aria-label="Puesto ' \+ puesto \+ ', familia ' \+ esc\(agente\)[\s\S]*Responsable ' \+ esc\(executor\)/);
  assert.match(raceSource, /data-race-role="runner" aria-hidden="true"/);
  assert.match(raceSource, /class="race-call"[^>]*aria-hidden="true"/);
  assert.doesNotMatch(raceSource, /aria-hidden="true"[^>]*data-race-role="agent"/);
});

test("la pista compacta sigue siendo legible en móvil y con movimiento reducido", () => {
  assert.match(html, /@media \(max-width:620px\)[\s\S]*?\.refresh-(?:lane|track|mission|agent)/);
  assert.match(html, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(html, /\.refresh-race\.paused \.refresh-runner svg\{animation-play-state:paused\}/);
});
