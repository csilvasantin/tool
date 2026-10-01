// FLT-101298 · Incidencias unificadas: /incidencias marca lo que lleva el Portal del comercio y enlaza
// su ficha; la ficha del portal enseña el nº de ticket de Yokup.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (f) => readFileSync(new URL("./" + f, import.meta.url), "utf8");
const html = read("incidencias.html");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function pill(p) {
  const code = html.slice(html.indexOf("const PORTAL_FICHA="), html.indexOf("function incidenceRowHtml"));
  const context = vm.createContext({ esc, encodeURIComponent });
  vm.runInContext(code + "\nglobalThis.pill = portalPillHtml;", context);
  return context.pill(p);
}

test("marca «Portal del comercio · establecimiento» con enlace a la ficha del portal", () => {
  const out = pill({ incident_id: "retail-1&x", site_name: "Estanco <local>", url: "https://www.yokup.com/retailer/incidencia?id=retail-1", state: "assigned", technician_name: "Laura" });
  assert.match(out, /^<a class="inc-comercio" href="https:\/\/www\.yokup\.com\/retailer\/incidencia\?id=retail-1%26x" target="_blank" rel="noopener"/);
  assert.match(out, />Portal del comercio · Estanco &lt;local&gt; · técnico Laura ↗<\/a>$/);
  // El enlace se construye con el id, nunca con una URL que venga en los datos.
  assert.ok(!pill({ incident_id: "r", site_name: "S", url: "javascript:alert(1)" }).includes("javascript:"));
  assert.equal(pill({ incident_id: "desk:ab", url: null, state: "open" }), '<span class="inc-comercio" title="Incidencia desk:ab del Yokup Desk">Yokup Desk</span>');
  assert.equal(pill(null), "");
});

test("la fila la pinta junto a estado y gravedad; un 409 del portal lo explica en el botón", () => {
  const renderer = html.slice(html.indexOf("function incidenceRowHtml"), html.indexOf("async function askKb"));
  assert.match(renderer, /esc\(sevLabel\)\+'<\/span>'\+portalPillHtml\(t\.portal\)\+'<\/div>/);
  assert.match(html, /\{portal:!!out\.portal_assigned\}/);
  assert.match(html, /button\.textContent=e\.portal\?"Lo cierra el técnico":"Reintentar"/);
});

test("estilo con el alcance de la piel y versión subida", () => {
  assert.ok(html.includes('/incidencias-portal.css?v=3"'));
  const css = read("incidencias-portal.css");
  assert.match(css, /body\.inc-portal \.inc-comercio\{[^}]*background:var\(--p-dark\)/);
  assert.match(css, /body\.inc-portal a\.inc-comercio:hover,body\.inc-portal a\.inc-comercio:focus-visible\{/);
});

test("la ficha /ticket enlaza el portal y la del portal enseña el ticket de Yokup (texto, versión subida)", () => {
  const ticket = read("ticket.html");
  assert.match(ticket, /t\.portal&&t\.portal\.url\?'<a href="https:\/\/www\.yokup\.com\/retailer\/incidencia\?id='\+encodeURIComponent\(t\.portal\.incident_id\)\+'"/);
  assert.match(ticket, /esc\(t\.portal\.site_name\|\|t\.portal\.incident_id\)/);
  const js = read("retailer-incidencia.js");
  assert.match(js, /\$\('#f-ref'\)\.textContent='Referencia: '\+i\.id\+\(i\.yokup_ticket\?' · Ticket de Yokup: '\+i\.yokup_ticket:''\);/);
  assert.ok(read("retailer-incidencia.html").includes('/retailer-incidencia.js?v=2"'));
});
