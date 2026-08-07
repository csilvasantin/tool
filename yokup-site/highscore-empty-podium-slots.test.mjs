import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./highscore.html", import.meta.url), "utf8");

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `No se encontró ${name}`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`No se pudo aislar ${name}`);
}

test("el podio no pinta placas vacías cuando faltan clasificados", () => {
  const podium = functionSource("pintaPodio");

  assert.match(podium, /if \(!a\) return "";/);
  assert.doesNotMatch(podium, /<div class=["']plaza["']><\/div>/);
});
