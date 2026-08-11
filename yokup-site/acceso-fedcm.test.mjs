import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./acceso.js", import.meta.url), "utf8");
const headers = await readFile(new URL("./_headers", import.meta.url), "utf8");

test("el perímetro no abre One Tap mientras muestra el botón de Google", () => {
  assert.doesNotMatch(source, /google\.accounts\.id\.prompt\s*\(/);
  assert.match(source, /google\.accounts\.id\.renderButton\s*\(/);
});

test("Google Identity se inicializa con challenge y sin FedCM", () => {
  const initializes = source.match(/google\.accounts\.id\.initialize\s*\(/g) || [];
  assert.equal(initializes.length, 1);
  assert.match(source, /\/auth\/challenge/);
  assert.match(source, /nonce:\s*challenge\.nonce/);
  assert.match(source, /ux_mode:\s*["']popup["']/);
  assert.match(source, /use_fedcm_for_button:\s*false/);
  assert.doesNotMatch(source, /return_path:location/);
  assert.match(headers, /Cross-Origin-Opener-Policy:\s*same-origin-allow-popups/);
});

test("callback envía state y no persiste ni recibe tokens de sesión", () => {
  assert.match(source, /credential:\s*resp\.credential,\s*state:activeChallenge\.state/);
  assert.match(source, /credentials:\s*"include"/);
  assert.doesNotMatch(source, /localStorage\.setItem\(SKEY/);
  assert.doesNotMatch(source, /o\.d\.token/);
});
