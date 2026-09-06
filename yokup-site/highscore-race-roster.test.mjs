import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("./highscore.html", import.meta.url), "utf8");

test("la parrilla de la carrera se fija en READY y no cambia hasta la META: nadie entra ni sale a mitad", () => {
  assert.match(html, /function fijaParrilla\(\)/);
  assert.match(html, /function liberaParrilla\(\) \{ rosterCarrera = null; \}/);
  assert.match(html, /carreraTiempoPausado = 0;\n\s*fijaParrilla\(\);/, "iniciaCarrera fija la parrilla");
  assert.match(html, /completaCicloStale\(\);\n\s*liberaParrilla\(\);\n\s*actualizaMarcador\(\)\.then\(iniciaCarrera\)/, "al acabar el ciclo se levanta el cerrojo antes de refrescar");
  assert.match(html, /completaCicloStale\(\); liberaParrilla\(\); actualizaMarcador\(\)\.then\(iniciaCarrera\)/, "también con reduced-motion");
  assert.match(html, /corredores = aplicaParrilla\(filasCarrera\.map/);
  assert.match(html, /Object\.assign\(\{\}, previo, \{ conservado:true \}\)/, "quien deja de verse se conserva con su última lectura");
  assert.match(html, /data-race-kept="true"/);
  assert.match(html, /conservado hasta el final de la carrera/);
  assert.match(html, /a la próxima carrera/, "quien llega espera y se dice cuántos");
});

test("la hora de inicio de la misión se ve a la izquierda del tiempo transcurrido", () => {
  assert.doesNotMatch(html, /\.refresh-timing \.refresh-started\{position:absolute;width:1px/, "ya no está oculta para la vista");
  assert.match(html, /\.refresh-timing \.refresh-started\{color:var\(--mut\);font-weight:700/);
  assert.match(html, /marcaInicio \+ marcaTemporal/, "inicio antes que duración");
});
