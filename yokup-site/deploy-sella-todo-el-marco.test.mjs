// Ningún fichero del marco puede quedarse sin resellar.
//
// El deploy llevaba una lista escrita a mano de qué ficheros reciben el ?v= del
// sello. Una lista así se queda corta cada vez que nace uno: el 5-ago-2026 fue
// yk-frame.css —resellaban su .js pero no su hoja, así que podía verse el JS nuevo
// con los estilos viejos— y el 7-ago eran SEIS a la vez. Con `max-age=14400` en
// Pages, un fichero sin resellar tarda hasta 4 h en verse: se publicó el cambio del
// cabezal y producción siguió sirviendo el anterior, pidiendo ?v=r4.
//
// Añadir el que falta arregla el caso de hoy y deja la trampa puesta para mañana.
// Por eso se sella por PATRÓN, y esto lo vigila.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const deploy = await readFile(new URL("./deploy.mjs", import.meta.url), "utf8");

test("el sellado va por patrón, no por lista", () => {
  assert.match(deploy, /\.replace\(\/\\\/\(yk-\[a-z0-9-\]\+\\\.\(\?:js\|css\)\)\(\?:\\\?v=\[A-Za-z0-9\._%\+-\]\+\)\?\/g, "\/\$1\?v=" \+ stamp\)/);
});

test("cubre TODOS los ficheros del marco que hay en el árbol", async () => {
  const files = (await readdir(new URL("./", import.meta.url)))
    .filter((f) => /^yk-[a-z0-9-]+\.(js|css)$/.test(f));
  assert.ok(files.length >= 15, "el marco tiene sus ficheros donde se espera");
  const patron = /\/(yk-[a-z0-9-]+\.(?:js|css))(?:\?v=[A-Za-z0-9._%+-]+)?/g;
  for (const f of files) {
    patron.lastIndex = 0;
    assert.ok(patron.test("/" + f), `${f} se queda fuera del sellado`);
  }
});

test("el ?v= no se traga la etiqueta siguiente", () => {
  // El charset acotado es deliberado: con `[^"']*` el valor podía atravesar un
  // comentario CSS sin comillas y llevarse por delante el <body> entero.
  assert.doesNotMatch(deploy, /\?v=\[\^"'\]\*/);
});
