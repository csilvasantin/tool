import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("./trackandfield.html", import.meta.url), "utf8");
const redirects = await readFile(new URL("./_redirects", import.meta.url), "utf8");
const deploy = await readFile(new URL("./deploy.mjs", import.meta.url), "utf8");

test("/trackandfield conserva exactamente la recuperación inmutable", () => {
  assert.equal(
    createHash("sha256").update(html).digest("hex"),
    "a21b54c7af31921ea49d556aac3a307a9d78424ac2d48b11493d2d559b1cd206"
  );
  assert.match(html, /<title>100 m · Track &amp; Field · Yokup<\/title>/);
});

test("Track & Field es el juego funcional y no la landing fallback", () => {
  assert.match(html, /<canvas id="stage"[^>]*aria-label="Pista de 100 metros"/);
  assert.match(html, /id="btnStart"/);
  assert.match(html, /function startSequence\(\)/);
  assert.match(html, /requestAnimationFrame\(loop\)/);
  assert.match(html, /window\.addEventListener\("keydown"/);
  assert.match(html, /new Audio\("\/media\/track-and-field\.mp3/);
  assert.match(html, /Press Start 2P/);
  assert.match(html, /\/img\/trackandfield-scoreboard\.png\?v=nes1/);
  for (const state of ["idle", "countdown", "racing", "false", "done"]) {
    assert.match(html, new RegExp(`state (?:=|===) ["']${state}["']`), state);
  }
  assert.doesNotMatch(html, /<title>Yokup · plataforma agéntica<\/title>/i);
});

test("Pages sirve /trackandfield como Clean URL, sin redirección circular", () => {
  assert.ok(html.length > 0, "trackandfield.html debe existir en la raíz publicada");
  assert.doesNotMatch(redirects, /^\/trackandfield(?:\s|$)/m);
  assert.match(redirects, /^\/\*\s+\/index\.html\s+200$/m);
});

test("el sellado del shell excluye la recuperación inmutable", () => {
  assert.match(deploy, /file\.pathname\.endsWith\("\/trackandfield\.html"\)\) continue/);
  assert.match(deploy, /\["--test", \.\.\.tests\][\s\S]*writeFile\(join\(stagingPath,\s*"version\.json"\)/,
    "las pruebas deben ejecutarse antes de generar sellos efímeros");
});
