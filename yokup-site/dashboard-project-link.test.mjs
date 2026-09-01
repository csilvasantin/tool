import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./dashboard.html", import.meta.url), "utf8");
const webSource = source.match(/function paWeb\(value\)\{[\s\S]*?\n\}/)?.[0] || "";
const paWeb = new Function(`${webSource}\nreturn paWeb;`)();

test("paWeb acepta http(s) y dominios históricos, pero rechaza destinos peligrosos", () => {
  assert.equal(paWeb("pixeria.com"),"https://pixeria.com");
  assert.equal(paWeb("https://playertaza.csilvasantin.workers.dev/"),"https://playertaza.csilvasantin.workers.dev");
  assert.equal(paWeb("javascript:alert(1)"),"");
  assert.equal(paWeb("https://u:p@example.com"),"");
});

test("el icono enlaza la web canónica sin convertir la captura en destino", () => {
  assert.match(source,/class="pa-folder pa-project-web"[^>]*data-pa-project-web/);
  assert.match(source,/href="'\+esc\(web\)\+'" target="_blank" rel="noopener noreferrer"/);
  assert.match(source,/aria-label="Abrir '\+esc\(projectName\)\+' en '\+esc\(webHost\)\+' · nueva pestaña"/);
  assert.match(source,/<img loading="lazy" alt="" src="'\+esc\(shot\)\+'" draggable="false"/);
  assert.match(source,/:'<div class="pa-folder" aria-hidden="true">/);
  assert.doesNotMatch(source,/href="'\+esc\(shot\)/);
});

test("el enlace no alterna details ni inicia drag, y conserva navegación nativa", () => {
  assert.match(source,/link\.onclick=event=>event\.stopPropagation\(\)/);
  assert.match(source,/link\.onpointerdown=event=>event\.stopPropagation\(\)/);
  assert.match(source,/link\.onkeydown=event=>event\.stopPropagation\(\)/);
  assert.match(source,/link\.ondragstart=event=>event\.preventDefault\(\)/);
  assert.doesNotMatch(source,/link\.onclick=event=>\{event\.preventDefault/);
});

test("el foco y el tamaño del icono siguen visibles en desktop y responsive", () => {
  assert.match(source,/\.pa-project-web:focus-visible\{outline:2px solid var\(--accent\)/);
  assert.match(source,/\.pa-folder\{position:relative;width:46px;height:30px/);
  assert.doesNotMatch(source,/@media\(max-width:(?:900|620)px\)\{[^}]*\.pa-project-web\{display:none/);
});
