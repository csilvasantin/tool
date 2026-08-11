import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./acceso.js", import.meta.url), "utf8");
const headers = await readFile(new URL("./_headers", import.meta.url), "utf8");

test("el perímetro no abre One Tap mientras muestra el botón de Google", () => {
  assert.doesNotMatch(source, /google\.accounts\.id\.prompt\s*\(/);
  assert.match(source, /google\.accounts\.id\.renderButton\s*\(/);
});

test("Google Identity se inicializa con redirect top-level, challenge y sin FedCM", () => {
  const initializes = source.match(/google\.accounts\.id\.initialize\s*\(/g) || [];
  assert.equal(initializes.length, 1);
  assert.match(source, /\/auth\/challenge/);
  assert.match(source, /nonce:\s*challenge\.nonce/);
  assert.match(source, /ux_mode:\s*["']redirect["']/);
  assert.match(source, /login_uri:\s*LOGIN_URI/);
  assert.match(source, /state:\s*challenge\.state/);
  assert.match(source, /use_fedcm_for_button:\s*false/);
  assert.match(source, /return_to:returnTo/);
  assert.doesNotMatch(source, /callback:\s*onCred/);
  assert.match(headers, /Cross-Origin-Opener-Policy:\s*same-origin-allow-popups/);
});

test("el navegador no procesa credenciales ni las persiste", () => {
  assert.doesNotMatch(source, /resp\.credential|activeChallenge/);
  assert.match(source, /credentials:\s*"include"/);
  assert.doesNotMatch(source, /localStorage\.setItem\(SKEY/);
  assert.doesNotMatch(source, /o\.d\.token/);
});
