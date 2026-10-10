import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("./yk-idioma.js", import.meta.url), "utf8");

function nodoTexto(value) {
  return { nodeType: 3, nodeValue: value, parentNode: null };
}
function elemento(tag, clase, hijos) {
  const el = { nodeType: 1, tagName: tag, className: clase || "", childNodes: hijos, parentNode: null };
  hijos.forEach((h) => { h.parentNode = el; });
  return el;
}

function montar() {
  const ceja = nodoTexto(" TECNOLOGÍA GLOBAL. TALENTO LOCAL.");
  const mundo = nodoTexto("Un mundo");
  const log = nodoTexto("TECNOLOGÍA GLOBAL. TALENTO LOCAL.");
  const body = elemento("body", "", [
    elemento("p", "eyebrow", [elemento("span", "live-dot", []), ceja]),
    elemento("h1", "", [mundo, nodoTexto("conectado.")]),
    elemento("ol", "yk-lcli-log", [log])
  ]);
  let avisos = 0;
  let observer = null;
  const documentElement = {
    _lang: "es",
    get lang() { return this._lang; },
    set lang(value) {
      if (this._lang === value) return;
      this._lang = value;
      avisos += 1;
      if (observer) observer();
    }
  };
  const listeners = [];
  const document = {
    documentElement,
    body,
    readyState: "complete",
    addEventListener(type, fn) { listeners.push([type, fn]); },
    dispatchEvent(ev) { listeners.filter((l) => l[0] === ev.type).forEach((l) => l[1](ev)); }
  };
  const sandbox = {
    document,
    window: null,
    MutationObserver: class {
      constructor(fn) { this.fn = fn; }
      observe() { observer = () => this.fn(); }
    }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(src, sandbox, { filename: "yk-idioma.js" });
  return { sandbox, ceja, mundo, log, document, avisos: () => avisos };
}

test("el cuerpo de la portada pasa de español a inglés y vuelve, sin tocar la consola", () => {
  const { sandbox, ceja, mundo, log, document } = montar();
  assert.match(ceja.nodeValue, /TECNOLOGÍA GLOBAL/);
  sandbox.YkIdioma.aplicar("en");
  assert.equal(ceja.nodeValue, " GLOBAL TECHNOLOGY. LOCAL TALENT.");
  assert.equal(mundo.nodeValue, "A world");
  assert.match(log.nodeValue, /TECNOLOGÍA GLOBAL/, "la consola no se traduce");
  document.dispatchEvent({ type: "admiranext:lang", detail: { lang: "es" } });
  assert.match(ceja.nodeValue, /TECNOLOGÍA GLOBAL/);
  assert.equal(mundo.nodeValue, "Un mundo");
  assert.equal(document.documentElement.lang, "es");
});

test("el titular del comercio y las pestañas de la cuenta pasan a inglés", () => {
  const { sandbox, document } = montar();
  const equipos = nodoTexto("Tus equipos.");
  const calma = nodoTexto("Tu tranquilidad.");
  const cuenta = nodoTexto("Crear cuenta de comercio");
  const entrar = nodoTexto("Entrar");
  const alta = nodoTexto("Crear cuenta →");
  for (const nodo of [equipos, calma, cuenta, entrar, alta]) {
    nodo.parentNode = document.body;
    document.body.childNodes.push(nodo);
  }
  sandbox.YkIdioma.aplicar("en");
  assert.equal(equipos.nodeValue, "Your devices.");
  assert.equal(calma.nodeValue, "Your peace of mind.");
  assert.equal(cuenta.nodeValue, "Create a retailer account");
  assert.equal(entrar.nodeValue, "Sign in");
  assert.equal(alta.nodeValue, "Create account →");
});

test("observar lang no vuelve a entrar y el cambio termina", () => {
  const { sandbox, ceja, avisos } = montar();
  sandbox.YkIdioma.aplicar("en");
  assert.equal(ceja.nodeValue, " GLOBAL TECHNOLOGY. LOCAL TALENT.");
  assert.equal(avisos(), 1);
  sandbox.YkIdioma.aplicar("en");
  assert.equal(avisos(), 1);
  sandbox.YkIdioma.aplicar("es");
  assert.match(ceja.nodeValue, /TECNOLOGÍA GLOBAL/);
  assert.equal(avisos(), 2);
});
