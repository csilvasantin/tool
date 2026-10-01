// Guardián del marco cuadrático de Yokup (FLT-101338, canon de la Galaxia).
//
// Toda página .html que www.yokup.com sirve carga el marco común (/yk-frame.css en el
// <head> y /yk-frame.js) o figura en SHELL_EXCEPTIONS con su motivo. Las 16 páginas
// que el guardián redirige con 301 a www.admira.live (MUDADAS_A_ADMIRA_LIVE en
// yokup-site-gate/src/index.js) no se ven en yokup.com y quedan fuera: se leen del
// propio guardián, no de una lista copiada aquí.
//
// También vigila lo que el marco promete: los glifos ☰ ▤ ⌘ en su orden, el logo
// yokup●, el tema claro del Portal del comercio, que la consola de CLIs de la flota
// nunca se monta sin sesión de flota y que la sala de /llamadas va sin barra.
// Ver docs/shell-cuadratico-yokup.md.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const site = fileURLToPath(new URL("./", import.meta.url));
const read = (path) => readFileSync(join(site, path), "utf8");
const frameJs = read("yk-frame.js");
const frameCss = read("yk-frame.css");
const gate = readFileSync(new URL("../yokup-site-gate/src/index.js", import.meta.url), "utf8");

// Páginas sin el marco, cada una con su motivo (revisadas una a una, 1-oct-2026).
export const SHELL_EXCEPTIONS = {
  "trackandfield.html": "Juego a pantalla completa; excluido también del sellado del deploy por contrato.",
  "alta-punto.html": "Inalcanzable: el guardián sirve /retailer.html en /alta-punto (alta antigua del punto).",
  "alta-instalador.html": "Inalcanzable: el guardián sirve /instalador.html en /alta-instalador.",
  "entrar.html": "Huérfana: selector de rol antiguo y oscuro que nada enlaza; candidata a retirarse.",
};
// Directorios de evidencias y artefactos que no son páginas del producto.
export const SHELL_EXCEPTION_PREFIXES = {
  "pruebas/": "Evidencias congeladas de misiones antiguas (capturas de comportamiento); no son páginas del producto.",
};
export const SHELL_EXCEPTION_PATTERNS = [
  [/^highscore-[0-9a-f]{6,}\.html$/, "Artefacto del Highscore ligado a un commit; lo redirige el guardián."],
];

function htmlFiles(dir = site, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) htmlFiles(full, out);
    else if (name.endsWith(".html")) out.push(relative(site, full).split("\\").join("/"));
  }
  return out.sort();
}

// Las rutas que el guardián manda a admira.live, convertidas en el fichero que las sirve.
function mudadas() {
  const block = gate.match(/const MUDADAS_A_ADMIRA_LIVE = \{([\s\S]*?)\n\};/);
  assert.ok(block, "el guardián declara MUDADAS_A_ADMIRA_LIVE");
  const map = Object.fromEntries([...block[1].matchAll(/"(\/[^"]*)":"(\/[^"]*)"/g)].map((m) => [m[1], m[2]]));
  const files = new Set();
  for (const route of Object.keys(map)) {
    const clean = route.replace(/\/$/, "");
    for (const f of [clean.slice(1) + ".html", clean.slice(1) + "/index.html", clean.slice(1)]) {
      if (f && f.endsWith(".html") && existsSync(join(site, f))) files.add(f);
    }
  }
  return { map, files };
}

function exceptionReason(file) {
  if (SHELL_EXCEPTIONS[file]) return SHELL_EXCEPTIONS[file];
  for (const [prefix, why] of Object.entries(SHELL_EXCEPTION_PREFIXES)) if (file.startsWith(prefix)) return why;
  for (const [re, why] of SHELL_EXCEPTION_PATTERNS) if (re.test(file)) return why;
  return "";
}

// Qué le falta a una página para llevar el marco. Pura: se prueba también con HTML inventado.
export function shellProblems(html) {
  const problems = [];
  const head = html.slice(0, html.search(/<\/head>/i) + 1 || html.length);
  if (!/<link[^>]+href="\/yk-frame\.css\?v=[A-Za-z0-9._%+-]+"/.test(head)) problems.push("no carga /yk-frame.css?v=… en el <head>");
  const js = html.match(/<script[^>]+src="\/yk-frame\.js\?v=[A-Za-z0-9._%+-]+"[^>]*><\/script>/g) || [];
  if (js.length !== 1) problems.push("debe cargar /yk-frame.js?v=… exactamente una vez");
  if (/<meta name="theme-color" content="#02080d">/.test(html)) problems.push("theme-color oscuro: Yokup es claro");
  // Una página con la paleta oscura de siempre en :root necesita la piel clara del marco.
  if (/--bg:\s*#02080d/.test(html) && !/<body[^>]*class="[^"]*\b(yk-claro|yk-light|inc-portal)\b/.test(html)) problems.push("tokens oscuros sin body.yk-claro");
  if (/100vh\s*-\s*\d+px/.test(html)) problems.push("altura 100vh - Npx: usa var(--yk-bar-h)");
  // Un solo marco: nada de shells paralelos (el del inventario se integró en yk-frame).
  if (/(inventory-shell|xpace-shell|galaxy-shell)\.(js|css)/.test(html)) problems.push("carga un shell paralelo: intégralo en yk-frame");
  return problems;
}

const { map: MUDADAS, files: REDIRIGIDAS } = mudadas();
const ALL = htmlFiles();
const SERVED = ALL.filter((f) => !REDIRIGIDAS.has(f));

test("las páginas redirigidas a admira.live se leen del guardián y no cuentan aquí", () => {
  assert.equal(REDIRIGIDAS.size, 16, "16 páginas mudadas: " + [...REDIRIGIDAS].join(", "));
  for (const f of ["dashboard.html", "misiones.html", "tareas.html", "highscore.html", "asignaciones/index.html", "status.html"]) assert.ok(REDIRIGIDAS.has(f), f);
  for (const f of ["incidencias.html", "ticket.html", "retailer.html", "index.html"]) assert.ok(!REDIRIGIDAS.has(f), f + " se sirve en yokup.com");
});

test("toda página servida carga el marco o es una excepción con motivo", () => {
  const sin = [];
  for (const file of SERVED) {
    const why = exceptionReason(file);
    if (why) { assert.ok(why.length > 20, file + ": el motivo se explica"); continue; }
    const problems = shellProblems(read(file));
    if (problems.length) sin.push(file + " → " + problems.join("; "));
  }
  assert.deepEqual(sin, [], "páginas servidas sin el marco común:\n" + sin.join("\n"));
  assert.ok(SERVED.filter((f) => !exceptionReason(f)).length >= 27, "el marco cubre el sitio");
});

test("una página nueva sin marco hace fallar al guardián", () => {
  const nueva = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Nueva</title><style>:root{--bg:#02080d}</style></head><body><main>Hola</main></body></html>';
  const problems = shellProblems(nueva);
  assert.ok(problems.some((p) => /yk-frame\.css/.test(p)));
  assert.ok(problems.some((p) => /yk-frame\.js/.test(p)));
  assert.ok(problems.some((p) => /yk-claro/.test(p)));
  const bien = '<!doctype html><html><head><link rel="stylesheet" href="/yk-frame.css?v=r1"></head><body class="yk-claro"><script src="/yk-frame.js?v=r1"></script></body></html>';
  assert.deepEqual(shellProblems(bien), []);
});

test("las excepciones existen y no cargan el marco (una excepción vieja se retira)", () => {
  for (const file of Object.keys(SHELL_EXCEPTIONS)) {
    assert.ok(ALL.includes(file), file + " ya no existe: retírala de SHELL_EXCEPTIONS");
    assert.doesNotMatch(read(file), /\/yk-frame\.js/, file + " ya carga el marco: no es una excepción");
  }
});

test("barra canónica: ☰ Opciones · yokup● · sección · ▤ Avanzado · ⌘ Experto", () => {
  assert.match(frameJs, /icon\("yk-ico yk-ico-left", "left", "☰", "Opciones"\)/);
  assert.match(frameJs, /icon\("yk-ico yk-ico-adv", "right", "▤", "Avanzado"\)/);
  assert.match(frameJs, /icon\("yk-ico yk-ico-exp", "bottom", "⌘", "Modo experto"\)/);
  assert.doesNotMatch(frameJs, /"◨"|"▦"/, "los glifos viejos no vuelven");
  const build = frameJs.slice(frameJs.indexOf("  function build() {"), frameJs.indexOf("  function buildPublicNav("));
  const order = ["bar.appendChild(icoL)", "bar.appendChild(logo)", "bar.appendChild(page)", "bar.appendChild(icoR)", "bar.appendChild(icoB)"].map((s) => build.indexOf(s));
  assert.ok(order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1])), "orden de la barra: " + order);
  assert.match(build, /'<span class="yk-logo-word">yokup<\/span><span class="yk-logo-dot" aria-hidden="true">●<\/span>'/);
  // Esc del canon: cierra el panel que tiene el foco y devuelve el foco a su icono.
  assert.match(build, /e\.key !== "Escape" \|\| e\.defaultPrevented/);
  assert.match(build, /icons\[panel\]\.focus\(\)/);
});

test("sin sesión de flota no se monta la consola de CLIs ni se habla con el API", () => {
  assert.match(frameJs, /function fleetMode\(\) \{[\s\S]*?data-yk-public[\s\S]*?window\.YkAccess && window\.YkAccess\.ready/);
  const build = frameJs.slice(frameJs.indexOf("  function build() {"), frameJs.indexOf("  function buildPublicNav("));
  assert.match(build, /var FLEET_MODE = fleetMode\(\);/);
  assert.match(build, /if \(FLEET_MODE\) slotB\.appendChild\(buildCliConsole\(\)\);/);
  assert.match(build, /slotB\.appendChild\(buildLocalCli\(FLEET_MODE\)\);/);
  assert.match(build, /if \(!FLEET_MODE\) return;\n\s*\/\/ --- contadores/);
  assert.ok(build.indexOf("if (!FLEET_MODE) return;") < build.indexOf("loadFleet();"), "loadFleet sólo con flota");
  // El selector de proyecto y el menú de la flota tampoco: piden datos al API.
  assert.match(build, /if \(FLEET_MODE\) \{\n\s*\/\/ menú de la barra/);
  // Las páginas públicas no cargan la verja de la flota (acceso.js).
  for (const file of ["index.html", "retailer.html", "instalador.html", "contactanos.html", "help/index.html", "mcp/index.html"]) {
    assert.doesNotMatch(read(file), /acceso\.js/, file);
  }
});

test("www.yokup.com: el menú enseña lo que se sirve y lleva lo mudado a admira.live", () => {
  const copy = frameJs.match(/var MUDADAS_A_LIVE = \{([\s\S]*?)\};/);
  assert.ok(copy, "el marco declara MUDADAS_A_LIVE");
  const local = Object.fromEntries([...copy[1].matchAll(/"(\/[^"]*)":"(\/[^"]*)"/g)].map((m) => [m[1], m[2]]));
  for (const [route, dest] of Object.entries(local)) assert.equal(MUDADAS[route], dest, route + " coincide con el guardián");
  const appNav = [...frameJs.slice(frameJs.indexOf("var APP_NAV = ["), frameJs.indexOf("var COUNTER_KEY")).matchAll(/\["[A-Z]+",\s+"(\/[^"]+)"\]/g)].map((m) => m[1]);
  for (const href of appNav) if (MUDADAS[href]) assert.ok(local[href], href + " está en APP_NAV y el guardián lo redirige: el marco debe saberlo");
  assert.match(frameJs, /if \(yokupHost && liveTarget\(r\[1\]\)\) item\.live = liveTarget\(r\[1\]\);/);
});

test("tema claro del Portal del comercio en todo el marco", () => {
  assert.match(frameCss, /--p-paper:#f6f8f3/);
  assert.match(frameCss, /--yk-bg: #fff;/);
  assert.match(frameCss, /--yk-ink: var\(--p-ink\);/);
  // Ningún cian del tema terminal sobrevive en el marco.
  assert.doesNotMatch(frameCss, /rgba\(120,\s*243,\s*255/);
  assert.doesNotMatch(frameCss, /#78f3ff|#02080d|#88ffaa/i);
  assert.match(frameCss, /\.yk-ico\[aria-pressed="true"\]\{[^}]*background: var\(--yk-dark\)/);
  // El xterm conserva su fondo de terminal (decisión documentada).
  assert.match(frameCss, /--yk-term-bg: #0f201b;/);
  // Al imprimir, el marco no existe.
  assert.match(frameCss, /@media print\{[\s\S]*?\.yk-frame[^{]*\{ display:none !important \}/);
});

test("la sala de /llamadas (?room=…) se abre a terceros sin barra", () => {
  const html = read("llamadas.html");
  assert.match(html, /if\(new URLSearchParams\(location\.search\)\.has\("room"\)\)\{document\.documentElement\.setAttribute\("data-yk-no-frame",""\)/);
  assert.ok(html.indexOf("data-yk-no-frame") < html.indexOf("</head>"), "se decide antes de que cargue el marco");
  assert.match(frameJs, /if \(document\.documentElement\.hasAttribute\("data-yk-no-frame"\)\) return;/);
});

test("las cabeceras propias dejan paso al marco y sus controles conservan su id", () => {
  for (const [file, ids] of [
    ["retailer.html", ["account-switch", "signout"]],
    ["instalador.html", ["language", "login-top", "logout"]],
    ["superusuario.html", ["admin-logout"]],
    ["equipo-inventario.html", ["fBack", "fEdit", "fPrint"]],
    ["informe-incidencia.html", ["rpBack", "rpPrint", "rpMail", "rpCopy", "rpShare", "rpDownload", "rpMsg"]],
  ]) {
    const html = read(file);
    assert.match(html, /data-yk-replace/, file);
    for (const id of ids) assert.ok(html.includes('id="' + id + '"'), file + ": #" + id);
  }
  assert.match(frameJs, /document\.querySelectorAll\("\[data-yk-replace\]"\)/);
  // El informe descargable no se lleva el marco dentro.
  assert.match(read("informe-incidencia.html"), /#yk-frame,\.yk-navpop,\.yk-submenu/);
});

test("inventario ITIL: se monta en los raíles canónicos de yk-frame, sin un segundo shell", () => {
  const adapter = read("inventory-frame.mjs");
  assert.ok(!existsSync(join(site, "inventory-shell.js")) && !existsSync(join(site, "inventory-shell.css")), "sin shell paralelo");
  for (const [file, kind] of [["retailer.html", "retailer"], ["equipo-inventario.html", "equipment"]]) {
    const html = read(file);
    assert.match(html, new RegExp('data-inventory-host="yokup" data-inventory-page="' + kind + '"'), file);
    assert.ok(html.indexOf("/yk-frame.js") < html.indexOf("/inventory-frame.mjs"), file + ": el adaptador después del marco");
    assert.doesNotMatch(html, /window\.XPACE_SHELL/, file);
  }
  // Vistas en el contenedor canónico de Opciones; puente y ayuda en Avanzado; plegados al entrar.
  assert.match(adapter, /document\.querySelector\('#yk-rail-left \.yk-slot'\)/);
  assert.match(adapter, /document\.querySelector\('#yk-rail-right \.yk-slot'\)/);
  assert.match(adapter, /options\.prepend\(nav\)/);
  assert.match(adapter, /href: '\/help#inventory-frame'/);
  assert.match(adapter, /for \(const panel of \['left', 'right', 'bottom'\]\) frame\.close\(panel\);/);
  assert.match(adapter, /frame\.registerVerb\(/);
  assert.match(adapter, /document\.addEventListener\('yk:frame-ready', install, \{once: true\}\)/);
  assert.match(frameJs, /document\.dispatchEvent\(new CustomEvent\("yk:frame-ready"/);
  assert.match(frameJs, /window\.YkFrame\.registerVerb = registerVerb;/);
  // La ayuda del inventario usa los glifos del canon.
  const help = read("help/index.html");
  assert.match(help, /<section id="inventory-frame">/);
  assert.match(help, /☰ y ▤ muestran u ocultan paneles/);
  assert.doesNotMatch(help, /◨/);
});
