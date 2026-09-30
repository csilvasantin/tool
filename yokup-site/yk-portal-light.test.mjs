import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

// FLT-101298 · Ficha y vistas claras: /ticket, /misiones y /tareas con el look &
// feel del Portal del comercio (misma familia que /incidencias).
const read = f => readFileSync(new URL("./" + f, import.meta.url), "utf8");
const shared = read("yk-portal-light.css");
const ticketCss = read("ticket-portal.css");
const pages = { "ticket.html": read("ticket.html"), "misiones.html": read("misiones.html"), "tareas.html": read("tareas.html") };
const ticket = pages["ticket.html"];
const render = ticket.slice(ticket.indexOf("async function render"), ticket.indexOf("// 📎 Adjuntos de la NOTA"));

function selectorsOf(css) {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@import[^;]+;/g, "");
  return [...body.matchAll(/([^{}@]+)\{[^{}]*\}/g)].map(m => m[1].trim())
    .filter(s => s && !/^(from|to|\d)/.test(s));
}

test("la hoja compartida se carga sólo en las tres vistas, versionada y tras el <style> base", () => {
  const link = '<link rel="stylesheet" href="/yk-portal-light.css?v=';
  for (const [name, html] of Object.entries(pages)) {
    assert.ok(html.includes(link), name);
    assert.ok(html.indexOf(link) > html.indexOf("</style>"), name + ": debe vencer al <style> base");
    assert.match(html, /<body class="yk-light[ "]/, name);
    assert.match(html, /<meta name="theme-color" content="#f6f8f3">/, name);
  }
  const all = readdirSync(new URL(".", import.meta.url)).filter(f => f.endsWith(".html"));
  const withShared = all.filter(f => read(f).includes("yk-portal-light.css")).sort();
  assert.deepEqual(withShared, ["misiones.html", "tareas.html", "ticket.html"]);
  const withTicket = all.filter(f => read(f).includes("ticket-portal.css"));
  assert.deepEqual(withTicket, ["ticket.html"]);
  assert.ok(ticket.indexOf("/ticket-portal.css?v=") > ticket.indexOf("/yk-portal-light.css?v="), "la hoja de la ficha va después de la compartida");
  assert.match(ticket, /<body class="yk-light yk-ticket"/);
  // /incidencias sigue con su propia piel (no se toca aquí)
  assert.ok(!read("incidencias.html").includes("yk-portal-light.css"));
});

test("todas las reglas cuelgan de su clase raíz (no contaminan yk-frame / yk-misiones / yk-cabezal)", () => {
  const sharedSel = selectorsOf(shared);
  assert.ok(sharedSel.length > 150);
  for (const sel of sharedSel) for (const part of sel.split(/,(?![^(]*\))/))
    assert.match(part.trim(), /^(body\.yk-light\b|html:has\(body\.yk-light\))/, "sin alcance: " + part.trim());
  const ticketSel = selectorsOf(ticketCss);
  assert.ok(ticketSel.length > 40);
  for (const sel of ticketSel) for (const part of sel.split(/,(?![^(]*\))/))
    assert.match(part.trim(), /^body\.yk-ticket\b/, "sin alcance: " + part.trim());
});

test("tokens del portal y barra yk-frame clara con activo subrayado verde", () => {
  for (const tok of ["--p-ink:#173632", "--p-muted:#667a75", "--p-paper:#f6f8f3", "--p-line:#dbe3d9", "--p-lime:#d8f36a", "--p-dark:#133d32", "--p-red:#ac3838", "--p-accent:#67935c", "--p-soft:#eaf0df"])
    assert.ok(shared.includes(tok), tok);
  assert.match(shared, /family=DM\+Sans[\s\S]*family=Manrope/);
  assert.match(shared, /--yk-bg:#fff;/);
  assert.match(shared, /body\.yk-light \.yk-bar\{background:#fff/);
  assert.match(shared, /body\.yk-light \.yk-nav a\.on\{[^}]*box-shadow:inset 0 -2px 0 var\(--p-live\)/);
  assert.match(shared, /body\.yk-light \.yk-rail\{background:#fff/);
});

test("componentes compartidos: cabecera, métricas, píldoras, botones, tarjetas, esqueleto y formularios", () => {
  assert.match(shared, /body\.yk-light \.ykl-heading h1 em\{font-style:normal;color:var\(--p-accent\)\}/);
  assert.match(shared, /body\.yk-light \.live-dot\{[^}]*background:var\(--p-live\)/);
  // KPIs del cabezal como tarjetas: etiqueta con punto arriba y cifra grande debajo
  assert.match(shared, /body\.yk-light \.kpi\{display:grid;[^}]*grid-template-areas:"dot label" "num num"[^}]*background:#fff/);
  assert.match(shared, /body\.yk-light \.kpi\.on\{border-color:var\(--p-dark\)/);
  for (const cls of ["b-open", "b-pend", "b-prog", "b-res", "b-sina", "b-cancel"]) assert.match(shared, new RegExp("body\\.yk-light \\." + cls + "\\{background:"), cls);
  assert.match(shared, /body\.yk-light \.ykl-sev\[data-sev="urgente"\]\{background:var\(--p-red\)/);
  assert.match(shared, /body\.yk-light \.primary\{background:var\(--p-dark\)/);
  // cada misión (suelta, madre, duplicados, o con su árbol en /tareas) es una tarjeta blanca
  assert.match(shared, /body\.yk-light :is\(\.list>\.tk,\.list>\.yk-grp,\.list>\.yk-dup,\.taskmission\)\{[^}]*background:#fff;border:1px solid var\(--p-line\);border-radius:14px/);
  assert.match(shared, /body\.yk-light \.tab\.on\{background:var\(--p-dark\)/);
  assert.match(shared, /body\.yk-light form\.alta\{[^}]*background:#fff[^}]*border-radius:16px/);
  assert.match(shared, /body\.yk-light \.ykl-skel i\{[^}]*linear-gradient/);
  // .alta del formulario no debe pisar la prioridad .pri.alta de las filas
  assert.doesNotMatch(shared, /body\.yk-light \.alta\{/);
});

test("misiones y tareas: cabecera del portal montada con nodos y textContent", () => {
  for (const name of ["misiones.html", "tareas.html"]) {
    const html = pages[name];
    assert.match(html, /<header class="ykl-heading" id="ykHeading" data-em="[^"]+" data-list="[^"]+" data-form="[^"]+">/, name);
    assert.match(html, /<p class="eyebrow"><span class="live-dot" aria-hidden="true"><\/span>YOKUP · [^<]+<\/p>/, name);
    assert.match(html, /<p class="lede" id="ykLede">/, name);
    const fn = html.slice(html.indexOf("(function ykLightHeading(){"), html.indexOf("})();", html.indexOf("(function ykLightHeading(){")));
    assert.ok(fn.length > 200, name);
    assert.match(fn, /em\.textContent=hd\.dataset\.em/);
    assert.match(fn, /h2\.textContent=text/);
    assert.match(fn, /slot\.replaceWith\(h1\)/);
    assert.doesNotMatch(fn, /innerHTML/, name + ": sin innerHTML");
    // el cabezal compartido sigue montándose igual (mismas funciones)
    assert.match(html, /YkCabezal\.mount\(\$\("cabezal"\)/, name);
  }
});

test("ficha /ticket: cabecera del portal, datos en tarjetas y timeline con hechos/pendiente", () => {
  assert.match(render, /<span class="live-dot" aria-hidden="true"><\/span><span class="tid" id="tkEyebrow"><\/span>/);
  assert.match(render, /\$\("tkEyebrow"\)\.textContent=\(esFlota\?"MISIÓN":"INCIDENCIA"\)\+" · "\+t\.id/);
  assert.match(render, /<h1 id="tkTitle"><span id="tkSubject"><\/span><br><em id="tkSubline"><\/em><\/h1>/);
  assert.match(render, /\$\("tkSubject"\)\.textContent=/);
  assert.match(render, /\$\("tkSubline"\)\.textContent=\[stt,establecimiento\|\|proyecto\]/);
  for (const label of ["Proyecto · establecimiento", "Origen", "Responsable", "Equipo", "Gravedad", "Fechas"])
    assert.ok(render.includes('dato(dl,"' + label + '"'), label);
  assert.match(ticket, /function dato\(dl,label,valor,\.\.\.subs\)/);
  assert.match(render, /<ol class="tl">\$\{hitos\}\$\{pendiente\}<\/ol>/);
  assert.match(render, /class="ev \$\{esc\(e\.kind\)\} done/);
  assert.match(render, /<li class="ev pending">/);
  assert.match(ticketCss, /body\.yk-ticket \.ev\.done::before\{background:var\(--p-live\)/);
  assert.match(ticketCss, /body\.yk-ticket \.ev\.pending::before\{background:#fff;border-color:#cbd7c4\}/);
  assert.match(ticketCss, /body\.yk-ticket \.tk-sheet\{display:grid;grid-template-columns:minmax\(0,1\.55fr\) minmax\(280px,1fr\)/);
  assert.match(ticketCss, /body\.yk-ticket \.btn\.res\{background:var\(--p-dark\)/);
  // la gravedad en inglés se muestra en castellano, como en /incidencias
  assert.match(ticket, /const SEV_ALIAS=\{urgent:"urgente",high:"alta"/);
});

test("ficha /ticket conserva ids, manejadores y funciones de siempre", () => {
  for (const id of ["backLink", "root", "composer", "note", "noteThumbs", "noteAdjBtn", "noteAdjFile", "sum", "sumtext", "rAgente", "rEquipo", "rProyecto", "rMsg"])
    assert.ok(ticket.includes('id="' + id + '"'), id);
  for (const call of ["setStatus('in_progress')", "setStatus('resolved')", "setStatus('open')", "summary()", "suggest()", "addNote()", "reasignar()"])
    assert.ok(render.includes(call), call);
  assert.match(render, /\/asistencia\?room=/);
  assert.match(render, /if\(esFlota\) llenaAsig\(\);\n  montaAdjuntos\(\);/);
  assert.match(ticket, /data-yk-fetch="\/ticket\?id=\{id\}"/);
  assert.match(ticket, /<div class="ykl-skel tk-skel" role="status"/);
});

test("375 px: una columna, sin anchos mínimos que fuercen scroll horizontal", () => {
  assert.match(shared, /@media\(max-width:520px\)\{[\s\S]*?body\.yk-light \.wrap\{padding:0 16px 40px\}/);
  assert.match(shared, /@media\(max-width:850px\)\{[\s\S]*?#cabezal \.kpis\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(ticketCss, /@media\(max-width:850px\)\{[\s\S]*?\.tk-sheet\{display:flex;flex-direction:column/);
  assert.match(ticketCss, /@media\(max-width:520px\)\{[\s\S]*?\.tk-data\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  for (const css of [shared, ticketCss]) {
    assert.doesNotMatch(css, /min-width:\s*[4-9]\d\dpx/);
    assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  }
});
