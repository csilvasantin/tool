import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

// FLT-101292 · /incidencias con el look & feel del Portal del comercio.
const html = readFileSync(new URL("./incidencias.html", import.meta.url), "utf8");
const css = readFileSync(new URL("./incidencias-portal.css", import.meta.url), "utf8");
const renderer = html.slice(html.indexOf("function incidenceRowHtml"), html.indexOf("async function askKb"));

test("la piel se carga sólo en incidencias, versionada y tras el <style> base", () => {
  const link = '<link rel="stylesheet" href="/incidencias-portal.css?v=';
  assert.ok(html.includes(link));
  assert.ok(html.indexOf(link) > html.indexOf("</style>"), "debe vencer al <style> base");
  assert.match(html, /<body class="inc-portal"/);
  const others = readdirSync(new URL(".", import.meta.url)).filter(f => f.endsWith(".html") && f !== "incidencias.html")
    .filter(f => readFileSync(new URL("./" + f, import.meta.url), "utf8").includes("incidencias-portal.css"));
  assert.deepEqual(others, []);
});

test("todas las reglas cuelgan de body.inc-portal (no contamina yk-frame/yk-misiones)", () => {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@import[^;]+;/g, "");
  const selectors = [...body.matchAll(/([^{}@]+)\{[^{}]*\}/g)].map(m => m[1].trim()).filter(s => s && !/^(from|to|\d)/.test(s));
  assert.ok(selectors.length > 50);
  for (const sel of selectors) {
    for (const part of sel.split(/,(?![^(]*\))/)) {
      assert.match(part.trim(), /^(body\.inc-portal\b|html:has\(body\.inc-portal\))/, "sin alcance: " + part.trim());
    }
  }
});

test("tokens del portal y barra yk-frame clara con activo subrayado verde", () => {
  // FLT-101338 («todo claro»): paleta y barra clara en yk-frame.css, una sola vez.
  const frameCss = readFileSync(new URL("./yk-frame.css", import.meta.url), "utf8");
  for (const tok of ["--p-ink:#173632", "--p-muted:#667a75", "--p-paper:#f6f8f3", "--p-line:#dbe3d9", "--p-lime:#d8f36a", "--p-dark:#133d32", "--p-red:#ac3838", "--p-soft:#eaf0df"]) assert.ok(frameCss.includes(tok), tok);
  assert.match(frameCss, /family=DM\+Sans[\s\S]*family=Manrope/);
  assert.match(frameCss, /\.yk-bar\{[^}]*background: #fff;/);
  assert.match(frameCss, /\.yk-nav a\.on\{[^}]*box-shadow: inset 0 -2px 0 var\(--yk-live\)/);
  assert.match(frameCss, /--yk-bg: #fff;/);
  assert.match(frameCss, /:is\(body\.yk-claro, body\.yk-light, body\.inc-portal\)\{/);
  assert.doesNotMatch(css, /--p-ink:/);
  assert.doesNotMatch(css, /\.yk-(bar|nav|ico|rail|hd)\b/);
});

test("cabecera estilo portal, KPIs-filtro, alta en form-card y KB en tarjeta suave", () => {
  assert.match(html, /<p class="eyebrow"><span class="live-dot"[^>]*><\/span>SOPORTE · INCIDENCIAS<\/p>/);
  assert.match(html, /<h1>Incidencias\.<br><em>[^<]+<\/em><\/h1>/);
  assert.match(html, /<button class="kpi a" type="button" data-f="open"><span>Abiertas<\/span><b id="kOpen">/);
  assert.match(html, /<button class="kpi b" type="button" data-f="in_progress">/);
  assert.match(html, /<button class="kpi c" type="button" data-f="resolved">/);
  assert.match(css, /body\.inc-portal \.incident-create\{[^}]*background:#fff[^}]*border-radius:16px/);
  assert.match(html, /<aside class="inc-kb-card"[\s\S]*id="kbq"[\s\S]*id="kbans"/);
  assert.match(css, /body\.inc-portal \.inc-kb-card\{[^}]*background:var\(--p-soft\)/);
  assert.match(css, /body\.inc-portal \.closeAllBtn\{[^}]*color:var\(--p-red\)/);
});

test("cada incidencia es una tarjeta con píldoras de estado y gravedad", () => {
  assert.match(renderer, /data-state="'\+esc\(t\.status\|\|"open"\)\+'" data-sev="'\+esc\(sev\)\+'"/);
  assert.match(renderer, /<div class="inc-pills">[\s\S]*class="badge '\+state\.cls\+'"[\s\S]*class="inc-sev"/);
  assert.match(css, /body\.inc-portal \.inc-main\{[^}]*grid-template-areas:"copy copy state" "origin owner state"/);
  assert.match(css, /body\.inc-portal \.inc-head\{display:none\}/);
  assert.match(css, /\.b-open\{background:#fbe3dc;color:var\(--p-red\)/);
  assert.match(css, /\.b-prog\{background:#fff3cf/);
  assert.match(css, /\.b-res\{background:#e3efd2/);
  assert.match(css, /body\.inc-portal \.inc-action\.advance\{background:var\(--p-dark\)/);
});

test("375 px: una columna, sin anchos mínimos que fuercen scroll horizontal", () => {
  assert.match(css, /@media\(max-width:520px\)\{[\s\S]*?\.inc-main\{grid-template-columns:minmax\(0,1fr\);grid-template-areas:"copy" "origin" "owner" "state"/);
  assert.match(css, /@media\(max-width:520px\)\{[\s\S]*?\.incident-create\{grid-template-columns:1fr\}/);
  assert.match(css, /body\.inc-portal #busca\{[^}]*min-width:0/);
  assert.doesNotMatch(css, /min-width:\s*[4-9]\d\dpx/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});
