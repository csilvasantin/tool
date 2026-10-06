import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { novedadesFor } from "./deploy-novedades.js";

test("novedades: por sello, con .default de reserva y como mucho 4 líneas", () => {
  const n = { "v.06.10.2026.r1.00:30": ["a", " b ", "", "c", "d", "e"], default: ["x"] };
  assert.deepEqual(novedadesFor(n, "v.06.10.2026.r1.00:30"), ["a", "b", "c", "d"]);
  assert.deepEqual(novedadesFor(n, "v.otra"), ["x"]);
  assert.deepEqual(novedadesFor("no-json", "v"), []);
  assert.deepEqual(novedadesFor(["uno"], "v"), ["uno"]);
});

test("novedades.json del sitio trae la primera novedad del sello", () => {
  const n = JSON.parse(readFileSync(new URL("./novedades.json", import.meta.url), "utf8"));
  // La primera novedad queda en el histórico de su sello (r5 del 06-10-2026); .default es la del
  // próximo sello y cambia en cada publicación: 1-4 líneas en español, no vacías.
  assert.ok(novedadesFor(n, "v.06.10.2026.r5.20:35").includes("Sello de versión con novedades al pasar el ratón"));
  const next = novedadesFor(n, "cualquiera");
  assert.ok(next.length >= 1 && next.length <= 4 && next.every((line) => line.length > 10));
});

test("el deploy publica novedades en version.json", () => {
  const src = readFileSync(new URL("./deploy.mjs", import.meta.url), "utf8");
  assert.match(src, /payload\.novedades = novedadesFor\(/);
});
