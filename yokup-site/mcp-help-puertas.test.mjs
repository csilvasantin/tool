import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Regla 24 (Carlos, 2026-08-09): «en cada proyecto tiene que estar el proyecto.com/help
// y el proyecto.com/mcp, uno para los de carbono/humanos y el otro para los de
// silicio/ordenadores». Yokup es la misión piloto de esa norma.
const mcp = await readFile(new URL("./mcp/index.html", import.meta.url), "utf8");
const help = await readFile(new URL("./help/index.html", import.meta.url), "utf8");
const llms = await readFile(new URL("./mcp/llms.txt", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("./mcp/manifest.json", import.meta.url), "utf8"));

test("las dos puertas existen y se enlazan la una a la otra", () => {
  // Que existan no basta: quien entra por la puerta equivocada tiene que poder cruzar.
  assert.match(mcp, /href="\/help"/, "el /mcp manda a las personas a /help");
  assert.match(help, /href="\/mcp\/"/, "el /help manda a las máquinas a /mcp");
  assert.match(mcp, /<title>Yokup · MCP/);
  assert.match(help, /<title>Yokup · Ayuda/);
});

test("ninguna de las dos vive detrás del perímetro", () => {
  // Una puerta que pide sesión de Google no es una puerta: el sentido de /mcp y /help
  // es que los lea alguien que TODAVÍA no está dentro de la casa.
  assert.doesNotMatch(mcp, /acceso\.js/);
  assert.doesNotMatch(help, /acceso\.js/);
});

test("el manifiesto sigue la convención de la flota y apunta al host bueno", () => {
  assert.equal(manifest.http_api.base_url, "https://api.yokup.com");
  assert.equal(manifest.hub, "https://www.yokup.com/mcp/");
  assert.equal(manifest.llms_txt, "https://www.yokup.com/mcp/llms.txt");
  assert.equal(manifest.help_humans, "https://www.yokup.com/help");
  assert.ok(manifest.http_api.read.length >= 8, "las lecturas del día a día");
  assert.ok(manifest.http_api.interact.length >= 6, "y lo que se escribe");
  for (const r of [...manifest.http_api.read, ...manifest.http_api.interact]) {
    assert.ok(r.method && r.path && r.auth && r.desc, "cada ruta dice método, puerta y para qué: " + r.path);
  }
  // Yokup no aparecía en la federación de nadie; al menos aquí se declara a los demás.
  assert.ok(manifest.federation.some((f) => f.name === "admira.live"));
});

test("lo que un agente se estrella si no sabe, está escrito en las tres piezas", () => {
  for (const [nombre, texto] of [["mcp", mcp], ["llms", llms]]) {
    assert.match(texto, /api\.yokup\.com/, nombre + ": el host bueno");
    assert.match(texto, /owner_mismatch/, nombre + ": la identidad con apellido de máquina");
    assert.match(texto, /medianoche/, nombre + ": el cierre diario cancela lo que la cruza");
    assert.match(texto, /hourly\.scores\[\]\.current/, nombre + ": cuál es el total bueno");
    assert.match(texto, /project_id/, nombre + ": el alta exige el slug del censo");
  }
  assert.ok(manifest.trampas.length >= 5, "y el manifiesto las lleva en un array legible");
});

test("el /help habla en persona, no en endpoints", () => {
  assert.doesNotMatch(help, /curl /, "una persona no necesita un curl para entender qué es esto");
  assert.match(help, /AgoraMatrix/, "a quién se avisa cuando algo se rompe");
  assert.match(help, /Highscore/);
  assert.match(help, /regla 24/i);
});
