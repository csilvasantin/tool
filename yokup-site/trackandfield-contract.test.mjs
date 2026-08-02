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
    "67594413686f7bdeeb4707ff4a4f65c87eddac188f990e0d5cc8b7d198a4b700"
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
  assert.doesNotMatch(html, /<title>Yokup · plataforma agéntica<\/title>/i);
});

test("Pages sirve /trackandfield como Clean URL, sin redirección circular", () => {
  assert.ok(html.length > 0, "trackandfield.html debe existir en la raíz publicada");
  assert.doesNotMatch(redirects, /^\/trackandfield(?:\s|$)/m);
  assert.match(redirects, /^\/\*\s+\/index\.html\s+200$/m);
});

test("el sellado del shell excluye la recuperación inmutable", () => {
  assert.match(deploy, /file\.pathname\.endsWith\("\/trackandfield\.html"\)\) continue/);
  assert.match(deploy, /\["--test", \.\.\.tests\][\s\S]*writeFile\(versionPath/,
    "las pruebas deben ejecutarse antes de generar sellos efímeros");
});
