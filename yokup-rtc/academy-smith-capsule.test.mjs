import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");

test("cada cápsula nace encargada a Smith y conserva un respaldo honesto", () => {
  assert.match(source, /smith_status TEXT/);
  assert.match(source, /smith_agent TEXT/);
  assert.match(source, /'pending','Smith'/);
  assert.match(source, /Toda franja se encarga a Smith/);
  assert.match(source, /source:"academia\/leccion"/);
});

test("Smith recoge una sola franja actual o adelantada y el reintento es idempotente", () => {
  assert.match(source, /url\.pathname === "\/academy\/capsula\/smith\/pending"/);
  assert.match(source, /COALESCE\(smith_status,'pending'\)!='verified'/);
  assert.match(source, /ORDER BY hour_start ASC LIMIT 1/);
  assert.match(source, /row\.smith_status === "verified"/);
  assert.match(source, /La franja ya tiene una entrega verificada/);
});

test("Yokup no acepta una cápsula hasta verificar vídeo, etiquetas y enlace", () => {
  assert.match(source, /url\.pathname === "\/academy\/capsula\/smith\/result"/);
  assert.match(source, /String\(video\.type \|\| ""\)\.toLowerCase\(\) !== "video"/);
  assert.match(source, /\["capsula","guion"\]\.includes\(capsuleType\)/);
  assert.match(source, /stockHasTags\(video, required\)/);
  assert.match(source, /stockHasTags\(capsule, required\)/);
  assert.match(source, /String\(capsule\.externalRef \|\| ""\) !== videoId/);
  assert.match(source, /source='pixeria\/capsula'/);
});

test("la cápsula es el tipo canónico y guion queda sólo como legado", () => {
  assert.match(source, /var COUNCIL_CAPSULA_TYPE = "capsula"/);
  assert.match(source, /new Set\(\[COUNCIL_CAPSULA_TYPE, "guion"\]\)/);
  assert.match(source, /capsulas: pieces\.filter\(\(p\) => p\.capsula\)\.length/);
  assert.match(source, /capsula_tipo: COUNCIL_CAPSULA_TYPE/);
});
