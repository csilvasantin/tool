// Marca blanca en Yokup (FLT-101338): un solo enganche (yk-frame.js), nada de
// admiranext.com sin marca activa, catálogo comprobado antes de cargar nada, textos AA
// con cualquier marca, el verbo /marca (alias /brand) en la consola LOCAL de ⌘ Experto
// —que nunca llega al tmux de un agente— y la funcionalidad escrita en la ayuda y el MCP.
// Mismo diseño, textos y comportamiento que admira.app, Pixeria y XpaceOS.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const site = fileURLToPath(new URL("./", import.meta.url));
const read = (file) => readFileSync(join(site, file), "utf8");
const frame = read("yk-frame.js");
const marcaJs = read("yk-marca.js");
const marcaCss = read("yk-marca.css");
const STAMP = "?v=20261001-test";
const memory = (init = {}) => {
  const mem = new Map(Object.entries(init));
  return { mem, getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
};
const ticks = async (n = 20) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
const json = (status, body) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });

// La API pura de yk-marca.js (sin navegador).
const M = (() => {
  const context = vm.createContext({ module: { exports: {} }, URL, URLSearchParams, console });
  vm.runInContext(marcaJs, context);
  return context.module.exports;
})();

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, "falta " + name);
  const brace = source.indexOf("{", start);
  let depth = 0, quote = "", escaped = false, regex = false;
  for (let i = brace; i < source.length; i++) {
    const c = source[i];
    if (quote) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === quote) quote = ""; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth++; else if (c === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error("función incompleta: " + name);
}

// Un navegador mínimo que anota todo lo que yk-marca.js intenta cargar o pedir.
function bootMarca({ search = "", session = memory(), loadNodes = false, fetchImpl } = {}) {
  const created = [], fetched = [];
  const node = (tag) => ({ tagName: tag.toUpperCase(), attrs: {}, style: {}, dataset: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, remove() {} });
  const append = (n) => { created.push(n); if (loadNodes && n.onload) setImmediate(() => n.onload()); };
  const document = {
    readyState: "complete",
    currentScript: { src: "https://www.yokup.com/yk-marca.js" + STAMP, dataset: {} },
    documentElement: { lang: "es", style: { length: 0, setProperty() {}, removeProperty() {} }, getAttribute: () => null, setAttribute() {}, removeAttribute() {}, appendChild: append },
    head: { append, appendChild: append }, body: {},
    title: "Yokup · Portal del comercio",
    createElement: (tag) => node(tag),
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
    dispatchEvent() {}, addEventListener() {},
  };
  const window = { document, sessionStorage: session, localStorage: memory(), console,
    location: { search, href: "https://www.yokup.com/retailer" + search, pathname: "/retailer", origin: "https://www.yokup.com" },
    setTimeout: () => 0, clearTimeout() {}, history: { replaceState() {} },
    fetch: (url) => { fetched.push(url); return fetchImpl ? fetchImpl(url) : new Promise(() => {}); } };
  window.window = window;
  const context = vm.createContext(Object.assign(window, { URL, URLSearchParams, CustomEvent: class {}, MutationObserver: class { observe() {} disconnect() {} }, Promise, CSS: { escape: (s) => s } }));
  vm.runInContext(marcaJs, context);
  return { created, fetched, session, context };
}

// El enganche del marco: wantsBrand + cargarMarca, en el mismo navegador mínimo.
function bootHook({ search = "", session = memory() } = {}) {
  const created = [];
  const document = { head: { appendChild: (n) => created.push(n) }, documentElement: {}, createElement: (tag) => ({ tagName: tag.toUpperCase(), attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }) };
  const window = { AdmiraMarca: null, sessionStorage: session };
  const run = new Function("document", "window", "location", "FRAME_SRC", `
    var MB_SESSION_KEY = "mb:marca";
    ${functionSource(frame, "wantsBrand")}
    var _marcaPromise = null;
    ${functionSource(frame, "cargarMarca")}
    if (wantsBrand(location.search, window.sessionStorage)) cargarMarca();
    return { wantsBrand: wantsBrand, cargarMarca: cargarMarca };`);
  const api = run(document, window, { search, href: "https://www.yokup.com/retailer" + search }, "https://www.yokup.com/yk-frame.js" + STAMP);
  return { created, api };
}

const pages = (() => {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith(".") || name === "node_modules") continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full); else if (name.endsWith(".html")) out.push(relative(site, full));
    }
  };
  walk(site);
  return out;
})();

test("sin marca activa Yokup no carga nada nuevo ni habla con admiranext.com", () => {
  for (const [search, init] of [["", {}], ["?id=INC-1", {}], ["?lang=es", {}]]) {
    const r = bootHook({ search, session: memory(init) });
    assert.deepEqual(r.created, [], `${search}: el marco no inserta nada`);
  }
  for (const [search, init] of [["", {}], ["?marca=admira", { "mb:marca": "lumbre" }], ["?marca=off", { "mb:marca": "starbucks" }], ["?marca=", {}]]) {
    const r = bootMarca({ search, session: memory(init) });
    assert.deepEqual(r.created, [], `${search}: nada insertado`);
    assert.deepEqual(r.fetched, [], `${search}: ninguna petición`);
    assert.equal(r.session.getItem("mb:marca"), null, `${search}: ninguna marca recordada`);
    assert.equal(r.context.AdmiraMarca.actual(), null);
  }
  // Ninguna página lleva la marca a mano: sólo la carga el marco.
  for (const page of pages) {
    const html = read(page);
    assert.ok(!/admiranext\.com\/marcablanca\/marcablanca\.(?:css|js)/.test(html), `${page}: marcablanca estático`);
    assert.ok(!/yk-marca\.(?:css|js)/.test(html), `${page}: yk-marca.* sólo a través de yk-frame.js`);
  }
});

test("yk-frame.js es el único enganche: ?marca= o una marca recordada cargan yk-marca.js con su sello", () => {
  for (const [search, init] of [["?marca=lumbre", {}], ["", { "mb:marca": "starbucks" }], ["?marca=admira", { "mb:marca": "lumbre" }]]) {
    const r = bootHook({ search, session: memory(init) });
    assert.equal(r.created.length, 1, `${search}: un script`);
    assert.equal(r.created[0].src, "/yk-marca.js" + STAMP, "con el mismo sello que el marco");
    assert.equal(r.created[0].async, true);
    assert.equal(r.created[0].attrs["data-search"], search, "la URL pedida viaja con el script aunque la página la reescriba");
  }
  assert.match(frame, /\(function \(\) \{ var ss = null; try \{ ss = window\.sessionStorage; \} catch \(e\) \{\} if \(wantsBrand\(location\.search, ss\)\) cargarMarca\(\); \}\)\(\);/);
});

test("con marca se comprueba primero el catálogo; sólo después el cargador y las dos hojas", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const r = bootMarca({ search: "?marca=Starbucks", loadNodes: true, fetchImpl: () => gate.then(() => json(200, { id: "starbucks", nombre: "Starbucks" })) });
  assert.deepEqual(r.fetched, [M.BASE + "api/marcas/starbucks"], "primera y única petición: la ficha del catálogo");
  assert.deepEqual(r.created, [], "nada se carga antes de que el catálogo responda");
  release();
  await ticks();
  const script = r.created.find((n) => n.tagName === "SCRIPT");
  assert.ok(script && script.src === M.BASE + "marcablanca.js", "cargador común");
  assert.equal(script.attrs["data-mb-plataforma"], "yokup");
  assert.equal(script.attrs["data-mb-auto"], "false", "Yokup aplica la marca tras comprobar el catálogo");
  const links = r.created.filter((n) => n.tagName === "LINK").map((n) => n.href);
  assert.ok(links.includes(M.BASE + "marcablanca.css"), "hoja común");
  assert.ok(links.includes("https://www.yokup.com/yk-marca.css" + STAMP), "hoja local con el mismo sello");
  assert.equal(M.PLATAFORMA, "yokup");
  assert.match(marcaJs, /TIMEOUT = 8000/);
});

test("una marca desconocida o admiranext.com caído no aplican nada", async () => {
  const unknown = bootMarca({ session: memory({ "mb:marca": "noexiste" }), fetchImpl: () => json(404, {}) });
  await ticks();
  assert.deepEqual(unknown.created, []);
  assert.equal(unknown.session.getItem("mb:marca"), null, "el id desconocido se olvida");
  const down = bootMarca({ search: "?marca=lumbre", fetchImpl: () => Promise.reject(new Error("offline")) });
  await ticks();
  assert.deepEqual(down.created, []);
  assert.deepEqual(down.fetched, [M.BASE + "api/marcas/lumbre", M.BASE + "clientes/lumbre.json"], "API, respaldo estático y nada más");
  assert.equal(down.context.AdmiraMarca.actual(), null);
});

test("la decisión sigue al cargador común: ?marca= manda y se recuerda; admira/off la olvidan", () => {
  const plain = (o) => JSON.parse(JSON.stringify(o));
  assert.deepEqual(plain(M.decide("?marca=lumbre", memory())), { id: "lumbre", remember: true });
  assert.deepEqual(plain(M.decide("?marca=admira", memory({ "mb:marca": "lumbre" }))), { id: null, forget: true });
  assert.deepEqual(plain(M.decide("", memory({ "mb:marca": "brumelle" }))), { id: "brumelle" });
  assert.deepEqual(plain(M.decide("?marca=<script>", memory({ "mb:marca": "brumelle" }))), { id: "brumelle" });
  assert.equal(M.SESSION_KEY, "mb:marca");
  assert.equal(plain(M.parseArg("")).kind, "status");
  assert.equal(plain(M.parseArg("off")).kind, "off");
  assert.equal(plain(M.parseArg("starbucks.es")).kind, "web");
  assert.equal(plain(M.parseArg("Starbucks")).id, "starbucks");
});

test("textos AA: Starbucks conserva su verde y su gris; el dorado cede", () => {
  const t = M.shellTokens({ "--mb-fondo": "#FFFFFF", "--mb-superficie": "#FFFFFF", "--mb-superficie-alt": "#F2F0EB", "--mb-texto": "#1E3932", "--mb-texto-suave": "#576061",
    "--mb-primario": "#006241", "--mb-secundario": "#000000", "--mb-acento": "#C58800", "--mb-ok": "#00754A", "--mb-error": "#C82014", "--mb-primario-texto": "#FFFFFF" }, "claro");
  assert.equal(t["--mbx-brand"], "#006241");
  assert.equal(t["--mbx-mut"], "#576061");
  assert.notEqual(t["--mbx-accent"], "#C58800", "el dorado no llega a AA sobre blanco");
  for (const k of ["--mbx-ink", "--mbx-mut", "--mbx-brand", "--mbx-accent", "--mbx-ok", "--mbx-error"])
    for (const bg of ["#FFFFFF", "#F2F0EB"]) assert.ok(M.contrast(t[k], bg) >= 4.5, k + " sobre " + bg);
  assert.ok(M.contrast(t["--mbx-on-brand"], t["--mbx-brand"]) >= 4.5);
});

test("la hoja de Yokup va acotada a su plataforma y apunta a <body> (gana a body.yk-light/inc-portal/yk-claro)", () => {
  const body = marcaCss.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors = [...body.matchAll(/([^{}@]+)\{[^{}]*\}/g)].map((m) => m[1].trim()).filter((s) => s && !/^(from|to|\d)/.test(s));
  assert.ok(selectors.length > 30);
  const topLevel = (sel) => { const out = []; let depth = 0, cur = ""; for (const c of sel) { if (c === "(") depth++; if (c === ")") depth--; if (c === "," && !depth) { out.push(cur); cur = ""; } else cur += c; } return out.concat(cur); };
  for (const sel of selectors) for (const part of topLevel(sel))
    assert.match(part.trim(), /^html\[data-mb-marca\]\[data-mb-plataforma="yokup"\]/, "sin alcance: " + part.trim());
  assert.match(marcaCss, /html\[data-mb-marca\]\[data-mb-plataforma="yokup"\] body\{[^}]*--yk-bg:var\(--mb-superficie\)[^}]*--p-ink:var\(--mbx-ink\)[^}]*--bg:var\(--mb-fondo\)[^}]*--paper:var\(--mb-fondo\)/);
  // «logo del cliente │ powered by Yokup» y «Volver a Admira» sólo con marca.
  assert.match(marcaCss, /\.yk-bar \.yk-logo::before\{content:"powered by "/);
  assert.match(marcaCss, /\.yk-rail \.mb-volver\{/);
  assert.match(marcaJs, /slot\.title = current\.nombre \+ \(current\.propuesta\s*\? T\(' · propuesta generada automáticamente, no es la marca oficial'/);
  assert.match(marcaJs, /current\.ejemplo \? T\(' · marca ficticia de ejemplo'/);
  assert.match(marcaJs, /b\.textContent = T\('Volver a Admira', 'Back to Admira'\);/);
  assert.match(marcaJs, /doc\.querySelector\('#yk-frame \.yk-bar \.yk-logo'\)/);
  // Lo que no se recolorea.
  assert.match(marcaCss, /:is\(canvas,video,img:not\(\.mb-logo-img\),iframe,\.maplibregl-map\)\{filter:none;mix-blend-mode:normal\}/);
});

test("/marca y /brand: consola LOCAL con los textos del canon; nunca llegan al tmux del agente", () => {
  assert.match(frame, /var MARCA_VERB = \/\^\\\/\?\(\?:marca\|brand\|marcablanca\)\$\/i;/);
  assert.match(frame, /var LOCAL_VERBS = \["help", "ayuda", "limpiar", "clear", "marca", "brand"\];/);
  for (const texto of [
    "Sin marca blanca: ves el aspecto de Admira.",
    "Aplicando la marca ",
    ". Se mantiene al navegar en esta pestaña; /marca off vuelve a Admira.",
    " desactivada: vuelve Admira.",
    "No había ninguna marca blanca activa: ya ves Admira.",
    "» no está en el catálogo de admiranext.com. No se ha aplicado nada.",
    "Abriendo el analizador de marca blanca en otra pestaña: ",
    "No se pudo contactar con admiranext.com. No se ha aplicado nada; vuelve a intentarlo.",
    " · propuesta automática, no es la marca oficial",
  ]) assert.ok(frame.includes(texto), texto);
  // La caja del CLI remoto: /marca se resuelve aquí; el resto (incluido /help del CLI) se envía.
  assert.match(frame, /function submitCliEditor\(\)\{[^}]*if\(LOCAL_CLI\.isLocalOnly\(text\)\)\{FLEET\.cliInput\.value="";LOCAL_CLI\.run\(text\.trim\(\)\);return;\}terminalAction\("write",text\);\}/);
  const isLocalOnly = new Function("text", "return " + frame.match(/isLocalOnly: function \(text\) \{ return ([^}]+); \}/)[1] + ";");
  for (const t of ["/marca starbucks", " /brand off", "/marca"]) assert.equal(isLocalOnly(t), true, t);
  for (const t of ["/avatarDigital", "/digitalAvatar off", "/cli ayudante", "/cli helper on", "/avatarON", "/avatarOFF", "/avatar reset", "/avatar"]) assert.equal(isLocalOnly(t), true, t);
  for (const t of ["/avatar3d on", "/avatares"]) assert.equal(isLocalOnly(t), false, t);
  for (const t of ["/help", "marca", "hola /marca", "/marcas", "/cli", "/status"]) assert.equal(isLocalOnly(t), false, t);
  // Tab completa el verbo y, tras /marca, los ids conocidos y off.
  const complete = new Function(`var LOCAL_VERBS = ["help", "ayuda", "limpiar", "clear", "marca", "brand"]; ${functionSource(frame, "localComplete")}; return localComplete;`)();
  assert.equal(complete("/ma", []).value, "/marca ");
  assert.equal(complete("/marca st", ["admira", "starbucks"]).value, "/marca starbucks");
  assert.deepEqual(complete("/marca ", ["lumbre"]).options, ["lumbre", "off"]);
  // La consola local no envía nada: ni fetch ni WebSocket dentro de runLocal.
  const runLocal = functionSource(frame, "runLocal");
  assert.doesNotMatch(runLocal, /fetch\(|WebSocket|terminalAction/);
});

test("la ayuda y el MCP explican la marca blanca y /marca como funcionalidad del site", () => {
  const help = read("help/index.html");
  const mcp = read("mcp/index.html");
  const llms = read("mcp/llms.txt");
  const gateMd = readFileSync(new URL("../yokup-site-gate/MCP.md", import.meta.url), "utf8");
  for (const [name, text] of [["help", help], ["mcp", mcp], ["llms", llms], ["MCP.md", gateMd]]) {
    assert.match(text, /\/marca/, name + ": el verbo");
    assert.match(text, /\?marca=/, name + ": el parámetro");
    assert.match(text, /admiranext\.com\/marcablanca/, name + ": el catálogo");
  }
  assert.match(help, /Volver a Admira/);
  assert.match(llms, /No es una herramienta MCP/);
  assert.match(gateMd, /no hay herramienta nueva ni cambia\s+`MCP_VERSION`/);
});

// INTERCAMBIO DE DOMINIOS (Carlos, 4-oct-2026): la casa con marca Admira será admira.biz o
// admira.app según el host, pero la marca blanca va ENCIMA y no depende de la casa: ni
// yk-marca.js mira el dominio, ni yk-casa.js toca nada de la marca blanca.
test("la marca blanca no depende de la casa (admira.biz o admira.app)", () => {
  const codigo = marcaJs.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.doesNotMatch(codigo, /admira\.(?:biz|app)/, "yk-marca.js no fija ninguna casa");
  const casa = read("yk-casa.js");
  assert.doesNotMatch(casa, /mb:marca|marcablanca|YkMarca/, "yk-casa.js no toca la marca blanca");
  assert.match(casa, /admira\\\.\(\?:biz\|app\)/, "yk-casa.js reconoce las dos casas");
});
