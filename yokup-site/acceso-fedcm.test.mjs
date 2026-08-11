import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./acceso.js", import.meta.url), "utf8");

test("el perímetro no abre One Tap mientras muestra el botón de Google", () => {
  assert.doesNotMatch(source, /google\.accounts\.id\.prompt\s*\(/);
  assert.match(source, /google\.accounts\.id\.renderButton\s*\(/);
});

test("Google Identity sólo se inicializa una vez por página", () => {
  const initializes = source.match(/google\.accounts\.id\.initialize\s*\(/g) || [];
  assert.equal(initializes.length, 1);
  assert.match(source, /window\.__ykGoogleIdentityInitialized/);
  assert.match(source, /use_fedcm_for_button:\s*true/);
});
