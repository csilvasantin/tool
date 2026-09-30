// FLT-101292 · la verja de acceso (acceso.js, compartida por todas las páginas de
// Yokup) viste el look & feel del Portal del comercio. Sólo presentación: el flujo
// Google/sesión/401 lo cubren acceso-fedcm.test.mjs y misiones-resiliencia.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./acceso.js", import.meta.url), "utf8");

// DOM mínimo que registra el árbol que monta la verja.
function fakeDom() {
  const byId = new Map();
  const node = (tag) => {
    const n = {
      tagName: String(tag).toUpperCase(), children: [], attrs: {}, className: "", hidden: false,
      _text: "", _id: "",
      get id() { return this._id; }, set id(v) { this._id = v; byId.set(v, this); },
      get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); },
      set textContent(v) { this._text = String(v); this.children = []; },
      set innerHTML(v) { throw new Error("la verja no debe usar innerHTML"); },
      classList: { add() {}, remove() {} },
      appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      remove() {}
    };
    return n;
  };
  const find = (root, pred) => { if (pred(root)) return root; for (const c of root.children || []) { const r = find(c, pred); if (r) return r; } return null; };
  const doc = {
    documentElement: node("html"), head: node("head"), body: node("body"),
    createElement: node,
    getElementById: (id) => byId.get(id) || null,
    querySelector: (sel) => {
      const cls = sel.replace(/^#yk-gate\s+\./, "");
      const gate = byId.get("yk-gate");
      return gate ? find(gate, (n) => String(n.className).split(/\s+/).includes(cls)) : null;
    },
    addEventListener() {}
  };
  return {doc, byId, find};
}

async function runSinSesion() {
  const {doc, byId, find} = fakeDom();
  const rawFetch = async (url) => ({ok: false, status: 401, json: async () => ({ok: false})});
  const ctx = vm.createContext({
    window: {fetch: rawFetch}, document: doc, location: {pathname: "/incidencias", search: "", hash: "", reload() {}},
    localStorage: {getItem: () => null, setItem() {}, removeItem() {}},
    Promise, JSON, CustomEvent: class {}, console
  });
  vm.runInContext(source, ctx);
  await new Promise((r) => setTimeout(r, 20));
  return {doc, gate: byId.get("yk-gate"), find};
}

test("sin sesión se pinta la verja del portal con texto plano (sin innerHTML)", async () => {
  const {gate, find, doc} = await runSinSesion();
  assert.ok(gate, "la verja existe");
  const txt = gate.textContent;
  for (const trozo of ["yokup", "ACCESO RESTRINGIDO", "Entra en Yokup.", "Tu equipo, conectado.", "Identifícate", "Preparando el acceso seguro"]) {
    assert.ok(txt.includes(trozo), trozo);
  }
  assert.equal(gate.attrs.role, "dialog");
  assert.ok(find(gate, (n) => n.id === "yk-gbtn"), "hueco del botón de Google");
  assert.ok(find(gate, (n) => n.className === "err"), "zona de error");
  // Tipografía del portal: sólo se pide al pintar la verja.
  assert.ok(doc.head.children.some((n) => /fonts\.googleapis\.com.*DM\+Sans/.test(n.href || "")));
});

test("el CSS de la verja vive bajo #yk-gate y usa los tokens del portal", () => {
  const css = (source.match(/st\.textContent =([\s\S]*?);\n/) || [, ""])[1];
  const reglas = css.match(/"([^"]*)"/g).join("").replace(/"/g, "").replace(/@keyframes[^{]+\{[^}]*\{[^}]*\}\}/g, "");
  for (const sel of reglas.replace(/@media[^{]+\{/g, "").split("}").map((r) => r.split("{")[0].trim()).filter(Boolean)) {
    assert.match(sel, /^(html\.yk-locked body|#yk-gate)/, "regla sin alcance propio: " + sel);
  }
  for (const token of ["#173632", "#667a75", "#f6f8f3", "#dbe3d9", "#133d32", "#ac3838", "#67935c", "#eaf0df"]) assert.ok(css.includes(token), token);
  assert.doesNotMatch(css, /#78f3ff|#02080d/, "fuera la estética cian de la verja anterior");
  assert.match(css, /max-width:520px/, "ajuste móvil (375 px)");
});

test("los errores se muestran en la zona .err y apagan el «Preparando…»", () => {
  assert.match(source, /function gateMsg\(text\)/);
  assert.equal((source.match(/gateMsg\("No se pudo/g) || []).length, 3);
});
