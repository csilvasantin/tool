// El relevo del login tuvo un formulario programático que Chrome podía bloquear
// en silencio. El contrato definitivo no depende del DOM: callback -> 303 ->
// handoff GET -> 303, y la cookie nace en el host del API.
import test from "node:test";
import assert from "node:assert/strict";
import { handoffRedirect, AUTH_HANDOFF_URI } from "./src/auth-flow.js";

const code = "a".repeat(43);
const response = handoffRedirect(code);

test("el callback releva por 303 al host que debe emitir la cookie", () => {
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), AUTH_HANDOFF_URI + "?code=" + code);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
});

test("el relevo no puede quedarse esperando HTML, formulario o JavaScript", async () => {
  assert.equal(await response.text(), "");
  assert.equal(response.headers.get("content-type"), null);
  assert.doesNotMatch(String(response.headers), /script|form-action|unsafe-inline/i);
});

test("el código opaco no se filtra a terceros", () => {
  assert.ok(AUTH_HANDOFF_URI.startsWith("https://api.yokup.com/"));
  assert.equal(response.headers.get("cache-control"), "no-store");
});
