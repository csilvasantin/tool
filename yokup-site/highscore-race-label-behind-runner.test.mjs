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

test("el histórico last_work queda en meta y conserva todo el rótulo detrás del corredor", () => {
  const finishedGhost = cssRule(".refresh-lane-last .refresh-mission");
  assert.match(finishedGhost, /right:auto/);
  assert.match(finishedGhost, /transform:translateX\(calc\(-100% - 13px\)\)/,
    "last_work necesita la misma proyección hacia atrás que el fantasma móvil");
  assert.match(paintSource, /trabajoFinalizado = estadoTrabajo === "last_work"/);
  assert.match(paintSource, /progresoAtleta = trabajoFinalizado \? 1 : noCorre \? 0/,
    "un trabajo finalizado se representa quieto en meta, no pegado a la salida");
  assert.match(paintSource,
    /if \(noCorre\) \{[\s\S]*if \(mision && trabajoFinalizado\) \{[\s\S]*mision\.style\.left = posicionCorredor;[\s\S]*mision\.style\.width = espacioFinalizado \+ "px"/,
    "la ventana finalizada debe anclarse al centro del runner y medir sólo lo ya recorrido");

  // Contrato geométrico: translateX(-100% - 13px) coloca el borde derecho del
  // texto 13px detrás del centro. El sprite mide 25px, por lo que ni siquiera
  // toca su borde izquierdo (12.5px): no basta con un z-index correcto.
  const runnerCenter = 900, runnerLeft = runnerCenter - 25 / 2;
  const labelWidth = 600, labelRight = runnerCenter - 13;
  assert.ok(labelRight < runnerLeft);
  assert.ok(labelRight - labelWidth < labelRight);
});

test("la corrección geométrica conserva meta, controles y orden semántico del carril", () => {
  assert.match(html, /id="refreshRace" role="button" tabindex="0" aria-pressed="false"/);
  assert.match(renderSource,
    /class="refresh-agent-meta"[\s\S]*marcaTemporal[\s\S]*class="refresh-lane-center"[\s\S]*data-race-role="mission"[\s\S]*runner \+ '<span class="refresh-finish"/,
    "agente con tiempo primario, pista y meta conservan su estructura y orden accesible");
  assert.match(renderSource, /data-race-role="runner" aria-hidden="true"/);
  assert.match(renderSource, /class="refresh-finish" aria-hidden="true"/);
  assert.match(renderSource, /data-race-time="elapsed" data-work-state="running"[\s\S]*data-work-start=/,
    "el contador factual permanece fuera del rótulo animado");
  assert.doesNotMatch(renderSource, /class="refresh-time"|class="refresh-work-state"/);
});
