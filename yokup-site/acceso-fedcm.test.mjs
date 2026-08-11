import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

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
  assert.match(source, /state_cookie_domain:\s*["']yokup\.com["']/);
  assert.doesNotMatch(source, /state_cookie_domain:\s*["']\.yokup\.com["']/);
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

test("todas las páginas protegidas cargan el acceso cross-subdomain actual", async () => {
  const root = new URL("./", import.meta.url);
  const seal = createHash("sha256").update(source).digest("hex").slice(0, 12);
  const expected = `/acceso.js?v=20260811-r4-${seal}`;
  let protectedPages = 0;
  for (const name of (await readdir(root, { recursive:true })).filter((file) => file.endsWith(".html"))) {
    const html = await readFile(new URL(name, root), "utf8");
    if (!/\/acceso\.js(?:\?|["'])/.test(html)) continue;
    protectedPages += 1;
    assert.match(html, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), name);
  }
  assert.ok(protectedPages > 0);
});
