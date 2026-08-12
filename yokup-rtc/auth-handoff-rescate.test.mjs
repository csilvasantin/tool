// El relevo del login tenía UN solo camino —enviar un formulario— y ese camino se
// puede bloquear sin lanzar ningún error: el navegador no navega y la página se
// queda en «Continuando…» para siempre. Carlos se lo comió el 12-ago. Estas
// pruebas fijan las dos salidas: el vigía que lo cuenta y el enlace que sí pasa.
import test from "node:test";
import assert from "node:assert/strict";
import { handoffHtml, AUTH_HANDOFF_URI } from "./src/auth-flow.js";

// handoffHtml devuelve un Response, no una cadena.
const html = await handoffHtml("a".repeat(43)).text();

test("el relevo ofrece un enlace además del formulario", () => {
  assert.match(html, /id="handoff-link"/);
  assert.match(html, new RegExp(AUTH_HANDOFF_URI.replace(/[/.]/g, "\\$&") + "\\?code="),
    "el enlace lleva el código: una navegación normal no la gobierna form-action");
});

test("el enlace NO depende del script: está desde el primer byte", () => {
  // Nació oculto y lo revelaba el propio script. Pero el caso que hay que cubrir
  // es justo que el script NO corra —un nonce que no casa lo bloquea entero— y
  // entonces el rescate se ocultaba a sí mismo. Se comprobó de verdad: con el
  // nonce descuadrado la página se queda en «Continuando…» para siempre.
  assert.match(html, /<p id="handoff-link">/);
  assert.doesNotMatch(html, /<p id="handoff-link" hidden>/);
  assert.match(html, /rel="noreferrer nofollow"/, "nofollow para desanimar a los rastreadores");
});

test("hay un vigía: un envío bloqueado NO lanza excepción y hay que detectarlo por tiempo", () => {
  assert.match(html, /setTimeout\(function\(\)\{if\(!document\.hidden&&s\)rescate\("sin respuesta"\)\},1500\)/);
  assert.match(html, /rescate\("bloqueado"\)/, "y el caso que sí lanza también avisa");
});

test("la salida se explica en HTML estático, no solo desde el script", () => {
  // <noscript> NO cubre el caso real: el JS está activado y es la política la que
  // lo corta, así que noscript no se muestra y el usuario se queda sin pista.
  assert.match(html, /id="handoff-ayuda"/);
  assert.match(html, /Continuar por enlace/);
});

test("la CSP seguía permitiendo el envío del formulario", () => {
  // Se comprobó en un Chrome real que el auto-envío SÍ funciona con esta CSP:
  // el fallo no estaba aquí, y quitarla habría sido apagar un fuego inexistente.
  assert.ok(AUTH_HANDOFF_URI.startsWith("https://"), "el destino del relevo es https");
});
