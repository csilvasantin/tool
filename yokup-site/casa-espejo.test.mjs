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

test("solo admira.biz es espejo: ni yokup.com, ni Pages, ni un parecido", () => {
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

test("yk-casa.js no hace nada fuera de admira.biz y no reescribe scripts ni campos de texto", () => {
  assert.match(fuente, /if \(!\/\(\^\|\\\.\)admira\\\.biz\$\/i\.test\(location\.hostname \|\| ""\) \|\| root\.YkCasa\) return;/);
  assert.match(fuente, /SKIP = \/\^\(SCRIPT\|STYLE\|NOSCRIPT\|TEXTAREA\)\$\//);
});

test("en admira.biz los portales piden datos a data.admira.biz (mismo sitio), no a data.yokup.com", () => {
  assert.equal(cliente.datosDeCasa("https://data.yokup.com/api/portal-access/google/challenge"), "https://data.admira.biz/api/portal-access/google/challenge");
  assert.equal(cliente.datosDeCasa("https://data.yokup.com"), "https://data.admira.biz");
  assert.equal(cliente.datosDeCasa("https://data.yokup.com?x=1"), "https://data.admira.biz?x=1");
  for (const otra of ["https://data.yokup.com.evil/x", "https://data.yokup.comx/x", "https://api.yokup.com/x", "https://www.yokup.com/x", "/api/local", ""]) assert.equal(cliente.datosDeCasa(otra), otra, otra);
  assert.match(fuente, /root\.fetch = function \(input, init\)/);
  // El envoltorio de fetch va DESPUÉS del corte «solo en admira.biz»: en yokup.com nada cambia.
  assert.ok(fuente.indexOf("root.fetch = function") > fuente.indexOf('if (!/(^|\\.)admira\\.biz$/i.test(location.hostname'));
});
