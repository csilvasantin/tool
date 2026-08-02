import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const frame = await readFile(new URL("./yk-frame.js", import.meta.url), "utf8");
const css = await readFile(new URL("./yk-frame.css", import.meta.url), "utf8");
const sw = await readFile(new URL("./sw.js", import.meta.url), "utf8");

test("Avanzado ofrece Highscore en todas las vistas y no declara vacío falso", () => {
  assert.match(frame, /railR\.appendChild\(buildAdvancedNav\(\)\)/);
  assert.match(frame, /highscore\.href = "\/highscore"/);
  assert.match(frame, /aria-label", "Herramientas avanzadas de Yokup"/);
  assert.match(frame, /if \(name !== "right"\) slot\.appendChild/);
  assert.match(css, /\.yk-adv-nav/);
});

test("el sello del marco procede del deploy y se confirma con version.json", () => {
  assert.doesNotMatch(frame, /var VERSION = "v\.23\.07\.2026\.r10"/);
  assert.match(frame, /document\.currentScript/);
  assert.match(frame, /searchParams\.get\("v"\)/);
  assert.match(frame, /fetch\("\/version\.json\?frame=" \+ Date\.now\(\), \{ cache:"no-store" \}\)/);
  assert.match(frame, /data-yk-version/);
});

test("el service worker no cachea el shell ni explica el menú antiguo", () => {
  assert.doesNotMatch(sw, /caches\.open|respondWith/);
  assert.match(sw, /addEventListener\("push"/);
});
