// admira.biz se presenta con la marca Admira, como las otras tres patas en su dominio
// Admira (Carlos, 2-oct-2026). La marca blanca (/marca) va encima y no depende de esto.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { marcaDeCasa, enlaceDeCasa, esEspejo, CASA_ESPEJO } from "./functions/_shared/casas.mjs";

const cliente = createRequire(import.meta.url)("./yk-casa.js");
const middleware = await readFile(new URL("./functions/_middleware.js", import.meta.url), "utf8");
const fuente = await readFile(new URL("./yk-casa.js", import.meta.url), "utf8");
const rutas = JSON.parse(await readFile(new URL("./_routes.json", import.meta.url), "utf8"));

const CASOS = [
  ["Yokup — Personas que cuidan de un mundo conectado", "admira.biz — Personas que cuidan de un mundo conectado"],
  ["Entra en Yokup.", "Entra en admira.biz."],
  ["powered by YOKUP", "powered by ADMIRA.BIZ"],
  ["yokup", "admira.biz"],
  ["Starbucks · Yokup — Incidencias", "Starbucks · admira.biz — Incidencias"],
  ["https://www.yokup.com/incidencias", "https://www.admira.biz/incidencias"],
  ["visita yokup.com hoy", "visita admira.biz hoy"],
  // Lo que NO es marca visible se queda como está.
  ["hola@yokup.com", "hola@yokup.com"],
  ["https://api.yokup.com/tickets", "https://api.yokup.com/tickets"],
  ["wss://rtc.yokup.com/room", "wss://rtc.yokup.com/room"],
  ["yokup.pages.dev", "yokup.pages.dev"],
  ["yokup-site y yokup_rtc", "yokup-site y yokup_rtc"],
  ["YokupX", "YokupX"],
  ["", ""]
];

test("«Yokup» se lee «admira.biz»; correos, subdominios técnicos e identificadores no se tocan", () => {
  for (const [entrada, esperado] of CASOS) assert.equal(marcaDeCasa(entrada), esperado, entrada);
});

test("servidor y navegador reescriben exactamente igual", () => {
  for (const [entrada] of CASOS) assert.equal(cliente.marcaDeCasa(entrada), marcaDeCasa(entrada), entrada);
  for (const href of ["https://www.yokup.com/help#x", "https://yokup.com", "https://api.yokup.com/x", "/local", "https://www.yokup.com.evil/x"]) {
    assert.equal(cliente.enlaceDeCasa(href), enlaceDeCasa(href), href);
  }
});

test("los enlaces al sitio se quedan en el espejo; los del API y los ajenos, no", () => {
  assert.equal(enlaceDeCasa("https://www.yokup.com/help#x"), "https://www.admira.biz/help#x");
  assert.equal(enlaceDeCasa("https://yokup.com"), "https://www.admira.biz");
  assert.equal(enlaceDeCasa("https://api.yokup.com/x"), "https://api.yokup.com/x");
  assert.equal(enlaceDeCasa("https://www.yokup.com.evil/x"), "https://www.yokup.com.evil/x");
});

test("admira.biz es espejo: ni yokup.com, ni Pages, ni un parecido", () => {
  assert.ok(esEspejo("www.admira.biz")); assert.ok(esEspejo("admira.biz"));
  for (const host of ["www.yokup.com", "yokup.pages.dev", "admira.biz.evil.example", "xadmira.biz"]) assert.ok(!esEspejo(host), host);
  assert.equal(CASA_ESPEJO.origin, "https://www.admira.biz");
});

test("el middleware solo actúa en el espejo y sobre HTML, y carga yk-casa.js lo primero", () => {
  assert.match(middleware, /if \(!esEspejo\(url\.hostname\)\) return response;/);
  assert.match(middleware, /includes\('text\/html'\)\) return response;/);
  assert.match(middleware, /el\.prepend\(`<script src="\/yk-casa\.js/);
  assert.match(middleware, /link\[rel="canonical"\]/);
  assert.deepEqual(rutas.include, ["/*"]);
  for (const patron of ["/*.js", "/*.css", "/*.json", "/*.png"]) assert.ok(rutas.exclude.includes(patron), patron);
});

test("yk-casa.js no hace nada fuera de la casa y no reescribe scripts ni campos de texto", () => {
  assert.match(fuente, /if \(!apexDe\(location\.hostname\) \|\| root\.YkCasa\) return;/);
  for (const host of ["www.admira.biz", "admira.biz", "www.admira.app", "admira.app"]) assert.ok(cliente.apexDe(host), host);
  for (const host of ["www.yokup.com", "yokup.pages.dev", "admira.biz.evil.example", "xadmira.app", "admira.apps"]) assert.equal(cliente.apexDe(host), "", host);
  assert.match(fuente, /SKIP = \/\^\(SCRIPT\|STYLE\|NOSCRIPT\|TEXTAREA\)\$\//);
});

test("en admira.biz los portales piden datos a data.admira.biz (mismo sitio), no a data.yokup.com", () => {
  assert.equal(cliente.datosDeCasa("https://data.yokup.com/api/portal-access/google/challenge"), "https://data.admira.biz/api/portal-access/google/challenge");
  assert.equal(cliente.datosDeCasa("https://data.yokup.com"), "https://data.admira.biz");
  assert.equal(cliente.datosDeCasa("https://data.yokup.com?x=1"), "https://data.admira.biz?x=1");
  for (const otra of ["https://data.yokup.com.evil/x", "https://data.yokup.comx/x", "https://api.yokup.com/x", "https://www.yokup.com/x", "/api/local", ""]) assert.equal(cliente.datosDeCasa(otra), otra, otra);
  assert.match(fuente, /root\.fetch = function \(input, init\)/);
  // El envoltorio de fetch va DESPUÉS del corte «solo en admira.biz»: en yokup.com nada cambia.
  assert.ok(fuente.indexOf("root.fetch = function") > fuente.indexOf("if (!apexDe(location.hostname) || root.YkCasa) return;"));
});

// ── INTERCAMBIO DE DOMINIOS (Carlos, 4-oct-2026) ────────────────────────────────────────
// admira.biz pasa a servir la parte de negocio (Pages clearchannel-tv) y admira.app la de
// coordinación (Yokup). El mismo código vale en los dos dominios; las redirecciones de
// compatibilidad solo actúan con host admira.app (inertes hasta el corte).
import { casaDe, apexDe } from "./functions/_shared/casas.mjs";
import { mudanzaANegocio, NEGOCIO_ORIGIN } from "./functions/_shared/mudanza.mjs";
import { onRequest } from "./functions/_middleware.js";
import { existsSync } from "node:fs";

test("la casa se deriva del host: admira.biz y admira.app, nada más", () => {
  assert.deepEqual(casaDe("www.admira.biz"), { id:"admira-biz", name:"admira.biz", origin:"https://www.admira.biz" });
  assert.deepEqual(casaDe("admira.app"), { id:"admira-app", name:"admira.app", origin:"https://www.admira.app" });
  assert.deepEqual(casaDe("WWW.ADMIRA.APP"), { id:"admira-app", name:"admira.app", origin:"https://www.admira.app" });
  for (const host of ["www.yokup.com", "yokup.pages.dev", "admira.app.evil.example", "xadmira.app", "admira.apps", ""]) {
    assert.equal(casaDe(host), null, host); assert.equal(apexDe(host), "", host); assert.ok(!esEspejo(host), host);
  }
  assert.ok(esEspejo("www.admira.app")); assert.ok(esEspejo("admira.app"));
});

test("en admira.app «Yokup» se lee «admira.app», igual en servidor y navegador", () => {
  const casos = [
    ["Entra en Yokup.", "Entra en admira.app."],
    ["powered by YOKUP", "powered by ADMIRA.APP"],
    ["https://www.yokup.com/incidencias", "https://www.admira.app/incidencias"],
    ["visita yokup.com hoy", "visita admira.app hoy"],
    ["hola@yokup.com", "hola@yokup.com"],
    ["https://api.yokup.com/tickets", "https://api.yokup.com/tickets"],
    ["yokup-site", "yokup-site"]
  ];
  for (const [entrada, esperado] of casos) {
    assert.equal(marcaDeCasa(entrada, "admira.app"), esperado, entrada);
    assert.equal(cliente.marcaDeCasa(entrada, "admira.app"), esperado, entrada);
  }
  assert.equal(enlaceDeCasa("https://www.yokup.com/help#x", "https://www.admira.app"), "https://www.admira.app/help#x");
  assert.equal(cliente.enlaceDeCasa("https://yokup.com", "https://www.admira.app"), "https://www.admira.app");
  assert.equal(cliente.datosDeCasa("https://data.yokup.com/api/x", "admira.app"), "https://data.admira.app/api/x");
  assert.equal(cliente.datosDeCasa("https://data.yokup.com.evil/x", "admira.app"), "https://data.yokup.com.evil/x");
});

test("el middleware toma la casa del host (no una fija) para marca, data-casa y canónica", () => {
  assert.match(middleware, /const casa = casaDe\(url\.hostname\);/);
  assert.match(middleware, /marcaDeCasa\(chunk\.text, casa\.name\)/);
  assert.match(middleware, /setAttribute\('data-casa', casa\.id\)/);
  assert.match(middleware, /setAttribute\('href', casa\.origin \+ url\.pathname\)/);
  assert.doesNotMatch(middleware, /CASA_ESPEJO/);
  // La mudanza va ANTES de context.next(): un enlace viejo no llega a pedir el asset.
  assert.ok(middleware.indexOf("mudanzaANegocio(context.request)") < middleware.indexOf("await context.next()"));
});

const RUTAS_NEGOCIO = ["/about", "/about.html", "/detail", "/backoffice", "/backoffice.html", "/backoffice/circuitos", "/marketplace",
  "/store-3d", "/walk", "/parrilla/", "/parrilla/hoy", "/players/x", "/presentacion/", "/presentation/deck", "/target/",
  "/tutorial/", "/documentacion/guia.pdf", "/wututu/", "/cafebreria/menu", "/distribucion", "/distribucion/sala.html"];
const RUTAS_YOKUP = ["/", "/incidencias", "/misiones", "/help", "/mcp/", "/carbono", "/auth/callback", "/api/fleet-census",
  "/aboutx", "/targets", "/walker", "/backoffices", "/api/demo-sessions"];

test("en admira.app los enlaces viejos de negocio saltan con 308 a la misma ruta en www.admira.biz", () => {
  for (const host of ["https://www.admira.app", "https://admira.app"]) {
    for (const ruta of RUTAS_NEGOCIO) {
      const r = mudanzaANegocio(new Request(host + ruta + "?q=1"));
      assert.ok(r, host + ruta);
      assert.equal(r.status, 308, ruta);
      assert.equal(r.headers.get("location"), NEGOCIO_ORIGIN + ruta + "?q=1", ruta);
    }
    for (const q of ["locationId=7", "circuit=alsea", "tour=1", "campaign=x", "campaignId=9", "assetUrl=https%3A%2F%2Fa", "screenId=3", "draft=1", "target=jti"]) {
      const r = mudanzaANegocio(new Request(host + "/?" + q));
      assert.equal(r && r.status, 308, q);
      assert.equal(r.headers.get("location"), "https://www.admira.biz/?" + q);
    }
    for (const ruta of RUTAS_YOKUP) assert.equal(mudanzaANegocio(new Request(host + ruta)), null, ruta);
    assert.equal(mudanzaANegocio(new Request(host + "/?marca=starbucks")), null, "la portada de Yokup sin query de negocio se queda");
    assert.equal(mudanzaANegocio(new Request(host + "/incidencias?target=jti")), null, "la query de negocio solo cuenta en la portada");
  }
});

test("en admira.app las APIs de negocio responden 410 con su nuevo hogar", async () => {
  const casos = [["POST", "/api/demo-session"], ["POST", "/api/orders"], ["GET", "/api/orders"], ["GET", "/api/orders/42"], ["GET", "/api/demo-signage/sala"], ["POST", "/api/demo-signage/x/y"]];
  for (const [method, ruta] of casos) {
    const r = mudanzaANegocio(new Request("https://www.admira.app" + ruta, { method }));
    assert.equal(r && r.status, 410, method + " " + ruta);
    assert.match(r.headers.get("content-type"), /application\/json/);
    assert.deepEqual(await r.json(), { moved_to:"https://www.admira.biz" });
  }
  assert.equal(mudanzaANegocio(new Request("https://www.admira.app/api/demo-session")), null, "solo el POST de demo-session");
  assert.equal(mudanzaANegocio(new Request("https://www.admira.app/api/demo-signage")), null);
});

test("las redirecciones son INERTES fuera de admira.app: admira.biz, yokup.com y Pages no cambian", () => {
  for (const origen of ["https://www.admira.biz", "https://admira.biz", "https://www.yokup.com", "https://yokup.pages.dev", "https://abc.yokup.pages.dev", "https://admira.app.evil.example", "https://xadmira.app"]) {
    for (const ruta of [...RUTAS_NEGOCIO, "/?circuit=alsea"]) assert.equal(mudanzaANegocio(new Request(origen + ruta)), null, origen + ruta);
    for (const ruta of ["/api/demo-session", "/api/orders", "/api/demo-signage/x"]) assert.equal(mudanzaANegocio(new Request(origen + ruta, { method:"POST" })), null, origen + ruta);
  }
});

test("el middleware real: en admira.app corta antes de pedir el asset; en admira.biz sigue su curso", async () => {
  let pedidas = 0;
  const next = async () => { pedidas += 1; return new Response("{}", { headers:{ "content-type":"application/json" } }); };
  const salto = await onRequest({ request:new Request("https://www.admira.app/backoffice?x=1"), next, env:{} });
  assert.equal(salto.status, 308);
  assert.equal(salto.headers.get("location"), "https://www.admira.biz/backoffice?x=1");
  assert.equal(pedidas, 0);
  const sigue = await onRequest({ request:new Request("https://www.admira.biz/backoffice?x=1"), next, env:{} });
  assert.equal(sigue.status, 200);
  assert.equal(pedidas, 1);
});

test("ninguna ruta de la mudanza existe en yokup-site (no se le roba una página a Yokup)", () => {
  for (const ruta of ["about", "detail", "backoffice", "marketplace", "store-3d", "walk", "parrilla", "players", "presentacion", "presentation",
    "target", "tutorial", "documentacion", "wututu", "cafebreria", "distribucion", "functions/api/demo-session.js", "functions/api/orders", "functions/api/demo-signage"]) {
    assert.ok(!existsSync(new URL("./" + ruta, import.meta.url)), ruta);
    assert.ok(!existsSync(new URL("./" + ruta + ".html", import.meta.url)), ruta + ".html");
  }
});

test("_redirects: los estáticos de negocio van a clearchannel.tv antes del catch-all y Yokup no los sirve", async () => {
  const redirects = await readFile(new URL("./_redirects", import.meta.url), "utf8");
  const reglas = redirects.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).map((l) => l.trim().split(/\s+/));
  const catchAll = reglas.findIndex(([desde]) => desde === "/*");
  const esperadas = {
    "/locations.js":"https://www.clearchannel.tv/locations.js",
    "/expert-commands.js":"https://www.clearchannel.tv/expert-commands.js",
    "/assets/demo/*":"https://www.clearchannel.tv/assets/demo/:splat",
    "/assets/intro/*":"https://www.clearchannel.tv/assets/intro/:splat",
    "/assets/og-cover.jpg":"https://www.clearchannel.tv/assets/og-cover.jpg",
    "/assets/admira-app-cockpit.webp":"https://www.clearchannel.tv/assets/admira-app-cockpit.webp",
    "/data/*":"https://www.clearchannel.tv/data/:splat",
    "/target-assets/*":"https://www.clearchannel.tv/target-assets/:splat",
    "/mcp/admira-app/*":"https://www.clearchannel.tv/mcp/admira-app/:splat"
  };
  for (const [desde, hacia] of Object.entries(esperadas)) {
    const i = reglas.findIndex(([d]) => d === desde);
    assert.ok(i >= 0, desde);
    assert.deepEqual(reglas[i], [desde, hacia, "301"], desde);
    assert.ok(i < catchAll, desde + " antes del catch-all");
    // _redirects no filtra por host: solo vale para lo que Yokup NO sirve.
    assert.ok(!existsSync(new URL("." + desde.replace(/\/\*$/, ""), import.meta.url)), desde + " no existe en yokup-site");
  }
});
