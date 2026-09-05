import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./highscore.html", import.meta.url), "utf8");

test("Cómo se puntúa explica los periodos y por qué semana y mes pueden coincidir", () => {
  assert.match(html, /<b>Periodos del podio:<\/b> Hora es la hora natural actual; Día va desde las 00:00; Semana va desde el lunes;/);
  assert.match(html, /Semana y Mes pueden dar la misma cifra/);
});

test("Cómo se puntúa enumera todos los estados visibles del Running Man", () => {
  assert.match(html, /<b>Running Man en color:<\/b>/);
  assert.match(html, /<b>Running Man ámbar · trabajo en curso sin actividad confirmada:<\/b>/);
  assert.match(html, /<b>Running Man gris quieto · trabajo finalizado:<\/b>/);
  assert.match(html, /<b>No aparece corredor:<\/b>/);
});

test("la explicación deriva y publica los umbrales reales de carrera", () => {
  assert.match(html, /window\.YkHighscoreRace\.IDLE_AFTER_MS/);
  assert.match(html, /window\.YkHighscoreRace\.STALE_RACE_MAX_CYCLES/);
  assert.match(html, /ciclosGrises \+ ' ciclos de ' \+ cicloSeg \+ ' segundos/);
  assert.match(html, /puede seguir visible hasta <b>24 horas desde el cierre<\/b>/);
  assert.match(html, /Tener el proceso o la máquina conectados no basta/);
});
