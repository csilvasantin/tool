// /proyecto en el Portal del comercio (encargo #5980, 14-oct-2026): el verbo recuerda el proyecto en la pestaña,
// añade ?proyecto= a /dashboard y pinta el aviso. El recorte y el permiso los decide la API (api/admira-xpacios.test.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const read = (f) => readFile(new URL("./" + f, import.meta.url), "utf8");
const source = await read("retailer-proyecto.js");

function fakeDom() {
  const byId = new Map(), listeners = {};
  const node = (tag) => ({
    tagName: String(tag).toUpperCase(), children: [], attrs: {}, className: "", hidden: false, type: "", _text: "", _id: "", parentNode: null,
    get id() { return this._id; }, set id(v) { this._id = v; byId.set(v, this); },
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(" "); },
    set textContent(v) { this._text = String(v); this.children = []; },
    set innerHTML(_) { throw new Error("innerHTML prohibido"); },
    setAttribute(k, v) { this.attrs[k] = v; }, append(...c) { for (const x of c) { x.parentNode = this; this.children.push(x); } },
    prepend(...c) { this.children.unshift(...c); }, replaceChildren(...c) { this.children = []; this._text = ""; this.append(...c); },
    insertBefore(x, ref) { x.parentNode = this; const i = this.children.indexOf(ref); this.children.splice(i < 0 ? 0 : i, 0, x); },
  });
  const workspace = node("section"), status = node("p"); status.id = "workspace-status"; workspace.append(status);
  const document = {
    head: node("head"), documentElement: { lang: "es" }, createElement: node,
    getElementById: (id) => byId.get(id) || null, querySelector: () => null,
    addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
  };
  return { document, byId, workspace };
}

function run({ search = "", stored = null } = {}) {
  const dom = fakeDom(), mem = new Map(stored ? [["yk_retailer_proyecto", stored]] : []), verbs = [];
  const sessionStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const window = { sessionStorage, YkFrame: { registerVerb: (def) => verbs.push(def) } };
  vm.runInNewContext(source, { window, document: dom.document, location: { search }, URLSearchParams, String, Object, encodeURIComponent });
  const aviso = () => dom.byId.get("proyecto-aviso");
  return { P: window.YokupProyecto, mem, verbs, aviso, dom };
}

test("sin proyecto elegido, /dashboard sale igual que siempre y no hay aviso", () => {
  const { P, aviso } = run();
  assert.equal(P.query("/dashboard"), "/dashboard");
  assert.equal(P.aplicar({ proyecto: null, sites: [] }), null);
  assert.equal(aviso().hidden, true);
});

test("?proyecto=starbucks en la URL elige el proyecto; ?proyecto=off lo quita", () => {
  const a = run({ search: "?proyecto=Starbucks" });
  assert.equal(a.P.query("/dashboard"), "/dashboard?proyecto=starbucks");
  assert.equal(a.P.query("/incidents?status=open"), "/incidents?status=open&proyecto=starbucks");
  const b = run({ search: "?proyecto=off", stored: "starbucks" });
  assert.equal(b.P.query("/dashboard"), "/dashboard");
});

test("con la confirmación del servidor se pinta «Proyecto Starbucks» y «Quitar filtro», antes del estado del portal", () => {
  const { P, aviso, dom } = run({ stored: "starbucks" });
  P.aplicar({ proyecto: "starbucks", sites: [] });
  assert.equal(aviso().hidden, false);
  assert.match(aviso().textContent, /Proyecto Starbucks/);
  assert.match(aviso().textContent, /Lo filtra el servidor/);
  assert.ok(aviso().children.some((c) => c.tagName === "BUTTON" && c.textContent === "Quitar filtro"));
  assert.equal(dom.workspace.children[0], aviso(), "va encima de #workspace-status");
});

test("si el servidor no confirma el proyecto, se olvida (no se queda un aviso falso)", () => {
  const { P, mem, aviso } = run({ stored: "starbucks" });
  P.aplicar({ proyecto: null, sites: [] });
  assert.equal(mem.has("yk_retailer_proyecto"), false);
  assert.equal(aviso().hidden, true);
});

test("403 del servidor (no es superusuario): se quita el filtro, se avisa y el portal recarga sin él", () => {
  const { P, mem, aviso } = run({ stored: "starbucks" });
  assert.equal(P.fallo(Object.assign(new Error("superuser-required"), { status: 403 })), true);
  assert.equal(mem.has("yk_retailer_proyecto"), false);
  assert.match(aviso().textContent, /Solo un superusuario puede filtrar por proyecto/);
  assert.equal(P.query("/dashboard"), "/dashboard");
  P.aplicar({ proyecto: null, sites: [] });
  assert.match(aviso().textContent, /Solo un superusuario/, "el aviso sigue tras la recarga sin filtro");
  P.aplicar(null);
  assert.equal(aviso().hidden, true, "al salir del portal se borra");
  assert.equal(P.fallo({ status: 403 }), false, "sin proyecto elegido, el 403 no es suyo");
  assert.equal(run({ stored: "starbucks" }).P.fallo({ status: 500 }), false, "otros errores siguen su camino");
});

test("400 (proyecto desconocido) dice cuáles hay", () => {
  const { P, aviso } = run({ stored: "lumbre" });
  assert.equal(P.fallo({ status: 400 }), true);
  assert.match(aviso().textContent, /No existe el proyecto «lumbre»\. Disponibles: starbucks/);
});

test("el verbo /proyecto se registra en ⌘ Experto y recarga el portal con el filtro", async () => {
  const { P, verbs, mem } = run();
  assert.equal(verbs.length, 1);
  assert.equal(verbs[0].id, "proyecto");
  assert.deepEqual([...verbs[0].aliases], ["project"]);
  assert.match(verbs[0].es, /solo superusuario, lo comprueba el servidor/);
  let recargas = 0;
  P.conectar(async () => { recargas++; P.aplicar({ proyecto: P.actual() || null }); });
  assert.match(await verbs[0].run("starbucks"), /^Proyecto Starbucks: solo sus locales/);
  assert.equal(mem.get("yk_retailer_proyecto"), "starbucks");
  assert.match(await verbs[0].run(""), /^Proyecto Starbucks/);
  assert.match(await verbs[0].run("off"), /^Sin filtro de proyecto/);
  assert.equal(mem.has("yk_retailer_proyecto"), false);
  assert.equal(recargas, 2, "/proyecto sin argumento solo informa");
});

test("retailer.html carga retailer-proyecto.js antes que el portal y el portal pide /dashboard a través de él", async () => {
  const html = await read("retailer.html"), js = await read("retailer-portal.js");
  const a = html.indexOf('src="/retailer-proyecto.js'), b = html.indexOf('src="/retailer-portal.js');
  assert.ok(a > 0 && a < b);
  assert.match(js, /data=await api\(proyecto\(\)\.query\('\/dashboard'\)\);proyecto\(\)\.aplicar\(data\)/);
  assert.match(js, /else if\(proyecto\(\)\.fallo\(e\)\)retry=true/);
  assert.match(js, /window\.YokupProyecto\?\.conectar\(/);
});
