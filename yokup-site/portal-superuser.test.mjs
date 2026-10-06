// Superusuario en /retailer e /instalador (06-10-2026): ya no se le manda a /superusuario sin
// avisar; se queda en el portal con «Abrir como retailer» / «Abrir como instalador».
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const read = (f) => readFile(new URL("./" + f, import.meta.url), "utf8");
const source = await read("portal-superuser.js");

function fakeDom() {
  const byId = new Map(), listeners = {};
  const node = (tag) => {
    const n = {
      tagName: String(tag).toUpperCase(), children: [], attrs: {}, className: "", hidden: false, disabled: false, value: "", _text: "", _id: "", parentNode: null,
      get id() { return this._id; }, set id(v) { this._id = v; byId.set(v, this); },
      get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); },
      set textContent(v) { this._text = String(v); this.children = []; },
      set innerHTML(_) { throw new Error("innerHTML prohibido"); },
      setAttribute(k, v) { this.attrs[k] = v; }, append(...c) { for (const x of c) { x.parentNode = this; this.children.push(x); } },
      prepend(...c) { this.children.unshift(...c); }, replaceChildren(...c) { this.children = []; this._text = ""; this.append(...c); },
      insertBefore(x, ref) { x.parentNode = this; const i = this.children.indexOf(ref); this.children.splice(i < 0 ? 0 : i, 0, x); },
      scrollIntoView() {}, find(pred) { if (pred(this)) return this; for (const c of this.children) { const r = c.find?.(pred); if (r) return r; } return null; },
    };
    return n;
  };
  const main = node("main"), access = node("section"); access.id = "access"; const onboarding = node("section"); onboarding.id = "onboarding";
  main.append(access, onboarding);
  const document = {
    currentScript: { dataset: {} }, head: node("head"), createElement: node,
    getElementById: (id) => byId.get(id) || null, querySelector: (s) => (s === "main" ? main : null),
    addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
  };
  return { document, main, byId, listeners };
}

async function run(kind, routes) {
  const dom = fakeDom(); dom.document.currentScript.dataset.kind = kind;
  const calls = [];
  const fetch = async (url, init = {}) => {
    const path = url.replace("https://data.yokup.com/api", ""), body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ path, method: init.method, body, credentials: init.credentials });
    const r = routes[path]; const [status, data] = typeof r === "function" ? r(body) : r || [404, { error: "no" }];
    return { ok: status < 300, status, json: async () => data };
  };
  let reloaded = 0;
  const window = {};
  const ctx = { window, document: dom.document, fetch, AbortSignal: { timeout: () => undefined }, location: { reload: () => reloaded++ }, setTimeout: (f) => f(), Error, Object, JSON };
  vm.runInNewContext(source, ctx);
  await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
  return { dom, calls, bar: dom.byId.get("superuser-bar"), reloaded: () => reloaded, window };
}

test("comercio o instalador normal: sin sesión de superusuario no aparece nada", async () => {
  const { bar, calls, window } = await run("retailer", { "/portal-admin/me": [401, { error: "Accede con Google como superusuario." }] });
  assert.ok(window.YokupSuperuser, "portal-google.js sabe que la página gestiona al superusuario");
  assert.ok(!bar || bar.hidden);
  assert.deepEqual(calls.map((c) => c.path), ["/portal-admin/me"]);
});

test("/retailer: el superusuario sin cuenta abierta elige la marca (365 por defecto) y la abre con /retailer/switch", async () => {
  const s = await run("retailer", {
    "/portal-admin/me": [200, { email: "csilva@admira.com", role: "superuser" }],
    "/retailer/me": [401, { error: "Entra" }],
    "/retailer/accounts": [200, { current: null, superuser: true, accounts: [
      { id: "alsea", name: "Alsea", role: "superuser", brand_key: "alsea" },
      { id: "r365", name: "365", role: "superuser", brand_key: "365" }] }],
    "/retailer/switch": (b) => [200, { ok: true, account: { id: b.retailer_id } }],
  });
  assert.ok(s.bar && !s.bar.hidden);
  assert.match(s.bar.textContent, /Modo superusuario/); assert.match(s.bar.textContent, /csilva@admira\.com/);
  const select = s.bar.find((n) => n.tagName === "SELECT"), open = s.bar.find((n) => n.tagName === "BUTTON");
  assert.equal(select.children.length, 2); assert.equal(select.value, "r365");
  assert.equal(open.textContent, "Abrir como retailer");
  assert.equal(s.bar.find((n) => n.tagName === "A").href, "/superusuario");
  await open.onclick(); 
  const sw = s.calls.find((c) => c.path === "/retailer/switch");
  assert.deepEqual(sw.body, { retailer_id: "r365" }); assert.equal(sw.credentials, "include"); assert.equal(s.reloaded(), 1);
  assert.equal(s.bar.parentNode, s.dom.main, "la barra va dentro del portal, antes del acceso");
});

test("/instalador: el superusuario abre un instalador y puede salir de la vista", async () => {
  const s = await run("installer", {
    "/portal-admin/me": [200, { email: "csilva@admira.com", role: "superuser" }],
    "/installer/me": [200, { profile: { id: "i1", name: "Técnico Uno" }, access: { delegated: true, role: "superuser", actor_email: "csilva@admira.com" } }],
    "/portal-admin/view-as": (b) => b ? [200, { ok: true }] : [200, { retailers: [], installer_as: "i1", installers: [
      { id: "i1", name: "Técnico Uno", city: "Barcelona", available: true }, { id: "i2", name: "Técnica Dos", city: "Madrid", available: false }] }],
  });
  assert.ok(!s.bar.hidden); assert.match(s.bar.textContent, /Estás viendo «Técnico Uno» como superusuario/);
  const select = s.bar.find((n) => n.tagName === "SELECT"); assert.equal(select.value, "i1");
  const buttons = []; s.bar.find((n) => { if (n.tagName === "BUTTON") buttons.push(n); return false; });
  assert.deepEqual(buttons.map((b) => b.textContent), ["Abrir como instalador", "Salir de la vista"]);
  select.value = "i2"; await buttons[0].onclick();
  assert.deepEqual(s.calls.filter((c) => c.method === "POST").map((c) => c.body), [{ kind: "installer", installer_id: "i2" }]);
  await buttons[1].onclick();
  assert.deepEqual(s.calls.filter((c) => c.method === "POST").at(-1).body, { kind: "installer", installer_id: null });
  assert.equal(s.reloaded(), 2);
});

test("los portales cargan portal-superuser.js antes del portal y portal-google.js ya no salta a /superusuario a ciegas", async () => {
  for (const [file, kind, portal] of [["retailer.html", "retailer", "retailer-portal.js"], ["instalador.html", "installer", "installer-portal.js"]]) {
    const html = await read(file), g = html.indexOf("/portal-google.js"), su = html.indexOf(`/portal-superuser.js?v=1" data-kind="${kind}"`), p = html.indexOf("/" + portal);
    assert.ok(g > 0 && su > g && p > su, file + ": portal-google → portal-superuser → portal");
  }
  const google = await read("portal-google.js");
  assert.match(google, /if\(!window\.YokupSuperuser\)fetch\('https:\/\/data\.yokup\.com\/api\/portal-admin\/me'/);
  assert.match(google, /if\(d\.role==='superuser'\)\{if\(!window\.YokupSuperuser\)\{location\.assign\('\/superusuario'\)/);
  const admin = await read("portal-admin.js");
  assert.match(admin, /openButton\('installer',a\.id\)/); assert.match(admin, /a\.brand_key\?openButton\('retailer',a\.id\)/);
  assert.match(admin, /api\/retailer\/switch/);
});
