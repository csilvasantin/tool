import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./highscore.html", import.meta.url), "utf8");
function functionSource(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `falta ${name}`);
  const next = html.indexOf("\n  function ", start + 12);
  return html.slice(start, next < 0 ? html.length : next);
}

const renderSource = functionSource("actualizaCarreraPodio");
const paintSource = functionSource("pintaCarrera");

function cssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...html.matchAll(new RegExp("(?:^|\\n)" + escaped + "\\{([^}]*)\\}", "g"))];
  assert.ok(matches.length, `falta la regla ${selector}`);
  return matches.at(-1)[1];
}

test("la misión normal ocupa sólo la espalda del corredor y queda en una capa inferior", () => {
  assert.match(cssRule(".refresh-mission"), /z-index:1/);
  assert.match(cssRule(".refresh-runner"), /z-index:3/);
  assert.match(cssRule(".refresh-mission"), /transform:translateX\(calc\(-100% - 13px\)\)/,
    "el ancho recorrido debe proyectarse hacia atrás, no delante del atleta");
  assert.match(paintSource, /mision\.style\.left = posicionCorredor;[\s\S]*mision\.style\.width = espacioMision \+ "px"/,
    "la ventana del texto sigue anclada al corredor y limitada al espacio recorrido");
});

test("el fantasma assigned_stale restaura la geometría hacia atrás al empezar a correr", () => {
  assert.match(cssRule(".refresh-lane-idle .refresh-mission"), /transform:none/,
    "antes de correr, el rótulo parado puede permanecer anclado y legible");

  const movingGhost = cssRule(".refresh-lane-idle.race-started .refresh-mission");
  assert.match(movingGhost, /right:auto/,
    "el rótulo móvil deja de ocupar todo el carril");
  assert.match(movingGhost, /transform:translateX\(calc\(-100% - 13px\)\)/,
    "al correr, el fantasma debe llevar el texto a su espalda igual que un corredor normal");

  assert.match(paintSource, /carreraCosmetica = estadoTrabajo === "assigned_stale"/);
  assert.match(paintSource, /carril\.classList\.toggle\("race-started", progresoAtleta > 0\)/,
    "la clase que activa la excepción corresponde al progreso cosmético real");
});

test("la corrección geométrica conserva meta, controles y orden semántico del carril", () => {
  assert.match(html, /id="refreshRace" role="button" tabindex="0" aria-pressed="false"/);
  assert.match(renderSource,
    /class="refresh-agent-meta"[\s\S]*class="refresh-lane-center"[\s\S]*data-race-role="mission"[\s\S]*runner \+ '<span class="refresh-finish"[\s\S]*class="refresh-time"/,
    "agente, pista, meta y tiempos conservan su estructura y orden accesible");
  assert.match(renderSource, /data-race-role="runner" aria-hidden="true"/);
  assert.match(renderSource, /class="refresh-finish" aria-hidden="true"/);
  assert.match(renderSource, /data-work-state="' \+ esc\([\s\S]*class="refresh-work-state"[\s\S]*class="refresh-elapsed"/,
    "los metadatos factuales permanecen fuera del rótulo animado");
});
