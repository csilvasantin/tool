// «Incidencias» del menú del portal del comercio (6-oct-2026): lleva a las incidencias del PROPIO
// comercio (/retailer#incidencias), nunca a /incidencias (bandeja interna de la flota, con su verja).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (f) => readFileSync(new URL("./" + f, import.meta.url), "utf8");

test("el adaptador de inventario manda al comercio a su sección #incidencias", () => {
  const adapter = read("inventory-frame.mjs");
  assert.match(adapter, /page === 'retailer' \? '\/retailer#incidencias' : '\/incidencias'/);
  assert.match(adapter, /\['Incidencias', 'Incidents', incidents\]/);
  assert.doesNotMatch(adapter, /\['Incidencias', 'Incidents', '\/incidencias'\]/);
});

test("retailer.html tiene la sección #incidencias con «+ Comunicar incidencia»", () => {
  const html = read("retailer.html");
  assert.match(html, /<section id="incidencias"[^>]*>/);
  assert.match(html, /id="new-incident-list">\+ Comunicar incidencia</);
  assert.match(html, /data-inventory-page="retailer"/);
  const js = read("retailer-portal.js");
  assert.match(js, /'new-incident-list'/);
  assert.match(js, /\$\('#new-incident-list'\)\.onclick=\(\)=>newIncident\(\)/);
  assert.match(js, /addEventListener\('hashchange',jumpToHash\)/);
  assert.match(js, /En manos del técnico/);
});

test("los bloques del raíl izquierdo no encogen (los enlaces no quedan bajo el pie)", () => {
  const css = read("yk-frame.css");
  assert.match(css, /\.yk-rail-left > \.yk-pub-nav[^{]*\.yk-rail-left > \.yk-rail-foot\{ flex-shrink:0 \}/);
});
