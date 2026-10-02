// admira.biz es el espejo de yokup.com (Carlos, 2-oct-2026): mismo sitio, su propia API.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { publicOriginFor } from "./functions/_shared/casas.mjs";

const source = await readFile(new URL("./acceso.js", import.meta.url), "utf8");

function cargar(hostname) {
  const llamadas = [], replaced = [];
  const window = { fetch:async (u, init) => { llamadas.push([String(u), init]); return { ok:false, status:401, json:async () => ({}) }; } };
  const node = () => ({ classList:{ add() {}, remove() {} }, appendChild() {}, setAttribute() {}, style:{} });
  const context = { window, document:{ documentElement:node(), head:node(), body:null, createElement:node, addEventListener() {}, getElementById:() => null, querySelector:() => null },
    location:{ hostname, pathname:"/incidencias", search:"?a=1", hash:"", reload() {}, replace(u) { replaced.push(u); } },
    localStorage:{ getItem:() => null, setItem() {}, removeItem() {} }, CustomEvent:class {}, Promise, Object, String, Boolean, setTimeout };
  vm.runInNewContext(source, context);
  return { test:window.__ykAccesoTest, llamadas, replaced, fetch:window.fetch };
}

test("en yokup.com nada cambia: API y fallback de siempre, sin traducción", () => {
  const { test:t, llamadas } = cargar("www.yokup.com");
  assert.equal(t.ESPEJO, false);
  assert.equal(t.WORKER, "https://api.yokup.com");
  assert.equal(t.toHouse("https://api.yokup.com/tickets"), "https://api.yokup.com/tickets");
  assert.ok(t.signable("https://rtc.yokup.com/x"));
  assert.equal(llamadas[0][0], "https://api.yokup.com/auth/session");
});

test("en admira.biz la sesión se pide a api.admira.biz y lo escrito para api.yokup.com se traduce", () => {
  const { test:t, llamadas } = cargar("www.admira.biz");
  assert.equal(t.ESPEJO, true);
  assert.equal(t.WORKER, "https://api.admira.biz");
  assert.equal(llamadas[0][0], "https://api.admira.biz/auth/session");
  assert.equal(t.toHouse("https://api.yokup.com/tickets?x=1"), "https://api.admira.biz/tickets?x=1");
  assert.equal(t.toHouse("https://rtc.yokup.com/tickets"), "https://api.admira.biz/tickets");
  assert.equal(t.toHouse("https://api.yokup.com.evil/x"), "https://api.yokup.com.evil/x");
  assert.equal(t.toHouse("https://stock.admira.store/x"), "https://stock.admira.store/x");
  assert.ok(!t.signable("https://rtc.yokup.com/x"), "la sesión del espejo no viaja a otro sitio");
  assert.ok(!t.signable("https://api.yokup.com/x"));
});

test("la raíz admira.biz salta a www antes de pedir nada", () => {
  const { replaced, llamadas } = cargar("admira.biz");
  assert.deepEqual(replaced, ["https://www.admira.biz/incidencias?a=1"]);
  assert.equal(llamadas.length, 0);
});

test("las funciones puente hablan al backend en nombre de la casa que las llama", () => {
  assert.equal(publicOriginFor(new Request("https://www.admira.biz/auth/challenge")), "https://www.admira.biz");
  assert.equal(publicOriginFor(new Request("https://admira.biz/auth/callback")), "https://www.admira.biz");
  assert.equal(publicOriginFor(new Request("https://www.yokup.com/auth/challenge")), "https://www.yokup.com");
  assert.equal(publicOriginFor(new Request("https://yokup.pages.dev/auth/challenge")), "https://www.yokup.com");
  assert.equal(publicOriginFor(new Request("https://admira.biz.evil.example/auth/challenge")), "https://www.yokup.com");
});
