import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// Carlos, 01-10-2026 · Duración de la incidencia + «Enviar informe» espectacular.
const require = createRequire(import.meta.url);
const D = require("./yk-duracion.js");
const read = f => readFileSync(new URL("./" + f, import.meta.url), "utf8");
const ticket = read("ticket.html"), informe = read("informe-incidencia.html"), inc = read("incidencias.html");
const ticketCss = read("ticket-portal.css");

test("duración: creación → cierre si está finalizada; transcurrido en vivo si sigue abierta", () => {
  const base = 1790850000000;
  const fin = { status:"resolved", created_at:base, resolved_at:base + 31000 };
  assert.equal(D.etiqueta(fin, base + 999999), "Duración 31 s");
  assert.deepEqual(D.duracion(fin, base + 999999), { ms:31000, viva:false, inicio:base, fin:base + 31000 });
  assert.equal(D.etiqueta({ status:"open", created_at:base }, base + 125000), "Abierta hace 2 min 5 s");
  assert.equal(D.etiqueta({ status:"in_progress", created_at:base }, base + 8040000), "Abierta hace 2 h 14 min");
  // eliminada: cierra con closed_at
  assert.equal(D.duracion({ status:"cancelled", created_at:base, closed_at:base + 60000 }).ms, 60000);
  assert.equal(D.etiqueta({ status:"open" }), "Sin fecha de creación");
});

test("duración: marcas en segundos o en ms (mismo umbral que fecha())", () => {
  assert.equal(D.toMs(1790850000), 1790850000000);
  assert.equal(D.toMs(1790850000000), 1790850000000);
  assert.equal(D.toMs(null), null);
  const s = { status:"resolved", created_at:1790850000, resolved_at:1790850000000 + 90000 };
  assert.equal(D.formato(D.duracion(s).ms), "1 min 30 s");
});

test("formato legible: s · min s · min · h min · d h", () => {
  assert.equal(D.formato(0), "0 s");
  assert.equal(D.formato(31000), "31 s");
  assert.equal(D.formato(252000), "4 min 12 s");
  assert.equal(D.formato(600000), "10 min");
  assert.equal(D.formato(8040000), "2 h 14 min");
  assert.equal(D.formato(3 * 3600000), "3 h");
  assert.equal(D.formato(190000000), "2 d 4 h");
  assert.equal(D.formato(null), "—");
});

test("SLA de 2 h y primera respuesta (started_at)", () => {
  const b = 1790850000000;
  assert.equal(D.sla({ status:"resolved", created_at:b, resolved_at:b + 3600000 }).ok, true);
  assert.equal(D.sla({ status:"resolved", created_at:b, resolved_at:b + 3 * 3600000 }).ok, false);
  assert.equal(D.atencion({ created_at:b, started_at:b + 120000 }), 120000);
  assert.equal(D.atencion({ created_at:b }), null);
});

test("ficha /ticket: Fechas muestra la duración (no «Abierta hace» en finalizadas) y píldora en cabecera", () => {
  assert.match(ticket, /<script src="\/yk-duracion\.js\?v=/);
  assert.match(ticket, /dato\(dl,"Fechas",duracionNodo\(t\),/);
  assert.doesNotMatch(ticket, /dato\(dl,"Fechas","Abierta hace "\+ago/);
  assert.match(ticket, /<span class="tk-dur-pill" id="tkDurPill" hidden><\/span>/);
  assert.match(ticket, /durTimer=setInterval/);
  assert.match(ticketCss, /body\.yk-ticket \.tk-dur\{/);
});

test("ficha /ticket: acción «Enviar informe» con hoja de envío que nunca envía sola", () => {
  assert.match(ticket, /<button class="btn report" onclick="informe\(\)">📄 Enviar informe<\/button>/);
  assert.match(ticket, /<dialog class="tk-inf" id="tkInforme"/);
  assert.match(ticket, /"\/informe-incidencia\?id="\+encodeURIComponent\(id\)/);
  assert.match(ticket, /"mailto:\?subject="/, "mailto sin destinatario: lo elige quien envía");
  assert.doesNotMatch(ticket, /mailto:[a-z0-9._%+-]+@/i);
  // el Resumen IA de la ficha queda disponible para el informe
  assert.match(ticket, /localStorage\.setItem\("ykInformeResumen:"\+id/);
  assert.match(ticket, /\/ticket-portal\.css\?v=2"/);
});

test("informe: protegido, con datos por textContent, Resumen IA reutilizado, imprimible y compartible", () => {
  assert.match(informe, /<script src="\/acceso\.js\?v=20260811-r4-/);
  assert.match(informe, /<script src="\/yk-duracion\.js\?v=/);
  assert.match(informe, /fetch\(WORKER\+"\/ticket\?id="\+encodeURIComponent\(id\)/);
  assert.match(informe, /fetch\(WORKER\+"\/ai-summary",\{method:"POST"/);
  assert.match(informe, /localStorage\.getItem\("ykInformeResumen:"\+id\)/);
  assert.match(informe, /@media print\{/);
  assert.match(informe, /@page\{size:A4/);
  assert.match(informe, /print-color-adjust:exact/);
  assert.match(informe, /\.rp-toolbar,\.no-print\{display:none!important\}/);
  assert.match(informe, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(informe, /"mailto:\?subject="/);
  assert.doesNotMatch(informe, /mailto:[a-z0-9._%+-]+@/i);
  assert.match(informe, /navigator\.clipboard\.writeText\(informeUrl\(\)\)/);
  assert.match(informe, /qs\.get\("print"\)==="1"/);
  for (const sec of ["Datos de la incidencia", "Resumen IA", "Línea de tiempo", "Resolución", "Responsable", "Fechas clave"])
    assert.ok(informe.includes(sec), sec);
  // el asunto, el responsable y el texto de los eventos nunca se interpretan como HTML
  assert.match(informe, /set\("rTitle",t\.subject\|\|"\(sin asunto\)"\)/);
  assert.match(informe, /'<div class="et">'\+esc\(t\)\+'<\/div>'/);
  assert.doesNotMatch(informe, /innerHTML=[^;]*t\.subject/);
});

test("bandeja /incidencias: duración en cada tarjeta y en el detalle", () => {
  assert.match(inc, /<script src="\/yk-duracion\.js\?v=/);
  assert.match(inc, /function durChipHtml\(t\)/);
  assert.match(inc, /'<\/span>'\+durChipHtml\(t\)\+'<\/div>'/);
  assert.match(inc, /durDetalleHtml\(t\)/);
  assert.match(read("incidencias-portal.css"), /body\.inc-portal \.inc-dur\{/);
});
