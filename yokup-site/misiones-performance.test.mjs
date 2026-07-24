import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./misiones.html", import.meta.url), "utf8");
const load = source.match(/async function load\(\)\{([\s\S]*?)\n  \/\/ El tablero SÍ es crítico/);

test("Misiones arranca personalización, proyectos y tickets en paralelo", () => {
  assert.ok(load, "no se encontró load()");
  assert.match(load[1], /const customizeP=/);
  assert.match(load[1], /const projectsP=ykf\("\/projects"/);
  assert.match(load[1], /const ticketsP=ykf\("\/tickets\?scope="\+SCOPE/);
  assert.match(load[1], /await Promise\.all\(\[customizeP,projectsP\]\)/);
  assert.doesNotMatch(load[1], /await \(YkMisiones\.customizeReady/);
});
