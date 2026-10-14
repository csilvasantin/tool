import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (name) => readFile(new URL(`./${name}`, import.meta.url), "utf8");

test("el tablero de la Insta360 está en /supervisor y no reescribe a .html", async () => {
  const [html, js, css, redirects] = await Promise.all([
    "supervisor.html", "yk-soluciones.js", "yk-supervisor.css", "_redirects"
  ].map(read));
  assert.match(html, /id="solGrid"/);
  assert.match(html, /id="solAbiertas"/);
  assert.match(html, /id="solCerradas"/);
  assert.match(html, /src="\/yk-soluciones\.js\?v=/);
  assert.match(html, /Insta360/);
  assert.match(js, /api\.yokup\.com\/supervisor\/soluciones\?id=macmini-insta360/);
  assert.match(js, /cache:\s*"no-store"/);
  assert.doesNotMatch(js, /\.innerHTML\s*=/);
  assert.match(css, /\.sol-grid\{display:grid/);
  assert.match(css, /@media\(max-width:700px\)\{\.sol-grid\{grid-template-columns:1fr\}/);
  assert.doesNotMatch(redirects, /^\/supervisor\s+\/supervisor\.html\s+200$/m);
});
