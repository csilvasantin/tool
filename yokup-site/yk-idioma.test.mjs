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
  const documentElement = { lang: "es" };
  const listeners = [];
  const document = {
    documentElement,
    body,
    readyState: "complete",
    addEventListener(type, fn) { listeners.push([type, fn]); },
    dispatchEvent(ev) { listeners.filter((l) => l[0] === ev.type).forEach((l) => l[1](ev)); }
  };
  const sandbox = { document, window: null, MutationObserver: class { observe() {} } };
  sandbox.window = sandbox;
  vm.runInNewContext(src, sandbox, { filename: "yk-idioma.js" });
  return { sandbox, ceja, mundo, log, document };
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
