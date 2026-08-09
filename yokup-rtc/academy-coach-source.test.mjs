import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");

test("Yokup mantiene un registro dedicado e idempotente para fuentes del Coach", () => {
  assert.match(source,/CREATE TABLE IF NOT EXISTS academy_coach_sources/);
  assert.match(source,/UNIQUE\(audience,counselor,source_url\)/);
  assert.match(source,/academyCoachSourceId/);
});

test("la escritura de fuentes está autenticada y la lectura omite secretos", () => {
  assert.match(source,/url\.pathname === "\/academy\/coach\/source" && req\.method === "POST"/);
  assert.match(source,/env\.ACADEMY_COACH_TOKEN/);
  assert.match(source,/url\.pathname === "\/academy\/coach\/sources" && req\.method === "GET"/);
  assert.doesNotMatch(source,/function academyCoachSourcePublicRow[\s\S]{0,800}authorization/i);
});

test("Yokup verifica cápsula, imagen, fuente, tags y las dos interpretaciones", () => {
  assert.match(source,/\[COUNCIL_FORMACION_TAG, COUNCIL\[counselor\]\.tag, "site"\]/);
  assert.match(source,/String\(capsule\.externalRef \|\| ""\) !== previewId/);
  assert.match(source,/academyCoachSourceUrl\(capsule\.prompt\) !== sourceUrl/);
  assert.match(source,/summary\.includes\("PARA CARBONO"\)/);
  assert.match(source,/summary\.includes\("PARA SILICIO"\)/);
  assert.match(source,/summary\.includes\("APLICACIÓN"\)/);
});
