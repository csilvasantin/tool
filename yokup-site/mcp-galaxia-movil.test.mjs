import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// /mcp/ en el móvil (Carlos, 2026-10-29): a 390 px la página medía 806 px porque la tabla de
// la Galaxia (siete columnas, 784 px) empujaba el ancho, y a 320 px la tabla de herramientas
// tampoco cabía por los nombres en <code>. La Galaxia se desplaza dentro de su caja y los
// nombres de herramienta parten línea; admira.biz sirve una copia de esta página.
const mcp = await readFile(new URL("./mcp/index.html", import.meta.url), "utf8");

test("la Galaxia se desplaza dentro de su caja y no ensancha la página", () => {
  assert.match(mcp, /^\.galaxia\{overflow-x:auto\}\.galaxia table\{font-size:12\.5px\}/m);
  assert.match(mcp, /<div id="galaxia" class="galaxia">\s*<table>/, "la tabla sigue dentro de la caja que desplaza");
});

test("los nombres de herramienta en las tablas parten línea", () => {
  assert.match(mcp, /^td code\{font-size:12px;overflow-wrap:anywhere\}$/m);
});
