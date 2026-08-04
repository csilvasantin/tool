import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const frame = await readFile(new URL("./yk-frame.js", import.meta.url), "utf8");
const css = await readFile(new URL("./yk-frame.css", import.meta.url), "utf8");
const sw = await readFile(new URL("./sw.js", import.meta.url), "utf8");
const dashboard = await readFile(new URL("./dashboard.html", import.meta.url), "utf8");
const decisiones = await readFile(new URL("./decisiones.html", import.meta.url), "utf8");
const admiraLive = await readFile(new URL("./admira-live.html", import.meta.url), "utf8");
const misiones = await readFile(new URL("./misiones.html", import.meta.url), "utf8");

test("Avanzado ofrece Highscore fuera del propio Highscore y no declara vacío falso", () => {
  assert.match(frame, /railR\.appendChild\(buildAdvancedNav\(\)\)/);
  assert.match(frame, /highscore\.href = "\/highscore"/);
  assert.match(frame, /if \(!active\) \{[\s\S]*nav\.appendChild\(highscore\)/);
  assert.match(frame, /aria-label", "Herramientas avanzadas de Yokup"/);
  assert.match(frame, /if \(name !== "right"\) slot\.appendChild/);
  assert.match(css, /\.yk-adv-nav/);
});

test("Opciones y Avanzado se repliegan al seleccionar un enlace", () => {
  assert.match(frame, /closeRailOnNavigation\(railL, "left"\)/);
  assert.match(frame, /closeRailOnNavigation\(railR, "right"\)/);
  assert.match(frame, /function closeRailOnNavigation\(rail, panel\)/);
  assert.match(frame, /event\.target\.closest\("a\[href\]"\)/);
  assert.match(frame, /if \(link && rail\.contains\(link\)\) setOpen\(panel, false\)/);
});

test("el sello del marco procede del deploy y se confirma con version.json", () => {
  assert.doesNotMatch(frame, /var VERSION = "v\.23\.07\.2026\.r10"/);
  assert.match(frame, /document\.currentScript/);
  assert.match(frame, /searchParams\.get\("v"\)/);
  assert.match(frame, /fetch\("\/version\.json\?frame=" \+ Date\.now\(\), \{ cache:"no-store" \}\)/);
  assert.match(frame, /data-yk-version/);
  assert.match(frame, /querySelectorAll\("\[data-yk-deploy-version\]"\)/);
});

test("los pies que presentan versión actual derivan del sello del deploy", () => {
  for (const html of [dashboard, misiones, decisiones, admiraLive]) {
    assert.match(html, /data-yk-deploy-version/);
    assert.doesNotMatch(html, /(?:versión|sello)[^<]*(?:<[^>]+>)*v\.\d{2}\.\d{2}\.\d{4}\.r\d+/i);
  }
  assert.doesNotMatch(dashboard, /v\.13\.07\.2026\.r1/);
});

test("el service worker no cachea el shell ni explica el menú antiguo", () => {
  assert.doesNotMatch(sw, /caches\.open|respondWith/);
  assert.match(sw, /addEventListener\("push"/);
});
