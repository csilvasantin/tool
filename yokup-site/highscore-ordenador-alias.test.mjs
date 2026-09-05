// FLT-1256 · La columna ORDENADOR del Highscore nombra la máquina.
//
// Carlos, 8-ago-2026: en la columna se leía «MacBookProNegro» cortado, que no nombra
// ninguna máquina de la flota. La pastilla debe pintar el ALIAS CORTO del diccionario
// —el que ya resuelve yk-agent-identity.js— y dejar el nombre largo en el title.
// Y como MBP14 = MacBookPro14 = macbookpro14 = macbookpro14negro = MacBookProNegro14
// son la MISMA máquina, dos grafías no pueden partir el equipo en dos pastillas:
// se normalizan, nunca se comparan literales (normativa regla 02).
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const highscore = await readFile(new URL("./highscore.html", import.meta.url), "utf8");
const identitySource = await readFile(new URL("./yk-agent-identity.js", import.meta.url), "utf8");

function functionSource(name) {
  const start = highscore.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `falta ${name}`);
  const brace = highscore.indexOf("{", start);
  let depth = 0, quote = "", escaped = false;
  for (let index = brace; index < highscore.length; index++) {
    const char = highscore[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return highscore.slice(start, index + 1);
  }
  throw new Error(`función ${name} incompleta`);
}

// `esc` se toma del propio fuente, tal cual está escrita en la página: es una línea
// suelta y el recortador por llaves tropieza con la comilla de su expresión regular.
const escSource = highscore.match(/^\s*function esc\(s\) \{.*\}$/m)[0];

function pinta(fila, tope) {
  const sandbox = { window: {}, module: undefined };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(identitySource, sandbox);
  vm.runInContext(escSource, sandbox);
  vm.runInContext(functionSource("normaliza"), sandbox);
  vm.runInContext(functionSource("interfazCliHtml"), sandbox);
  vm.runInContext(functionSource("pintaMaquinas"), sandbox);
  sandbox.__fila = fila; sandbox.__tope = tope;
  return vm.runInContext("pintaMaquinas(__fila, __tope)", sandbox);
}

const pastillas = (html) =>
  [...html.matchAll(/<span class="maq-b[^"]*"[^>]*>([^<]*)<\/span>/g)].map((m) => m[1]);

test("la pastilla pinta el alias corto del diccionario, no el nombre largo", () => {
  const html = pinta({ maquinasVivas: ["MacBookProNegro14"], maquinas: ["MacBookProNegro14"] });
  assert.deepEqual(pastillas(html), ["MBP14"]);
  assert.ok(!/>MacBookProNegro14</.test(html), "el nombre largo no se pinta dentro de la pastilla");
});

test("el nombre largo no se pierde: sigue entero en el title", () => {
  const html = pinta({ maquinasVivas: ["MacBookProNegro14"], maquinas: ["MacBookProNegro14"] });
  assert.match(html, /<div class="maqs" title="MacBookProNegro14">/);
  assert.match(html, /<span class="maq-b on" title="MacBookProNegro14">MBP14<\/span>/);
});

test("cada equipo de la flota se lee por su alias corto", () => {
  const html = pinta({
    maquinasVivas: [],
    maquinas: ["MacBookProNegro14", "MacBookAir16plata", "Mac Mini", "MacBookAirAzul", "spark-1e61"],
  });
  assert.deepEqual(pastillas(html).sort(), ["DGX", "MBA16", "MBAAzul", "MBP14", "MacMini"]);
});

test("dos grafías del MISMO equipo se funden en una sola pastilla", () => {
  const html = pinta({
    maquinasVivas: [],
    maquinas: ["MacBookProNegro14", "MacBookPro14", "macbookpro14negro", "MBP14"],
  });
  assert.deepEqual(pastillas(html), ["MBP14"]);
  assert.match(html, /title="MBP14 = MacBookPro14 = MacBookProNegro14 = macbookpro14negro"/);
});

test("si una sola grafía late, el equipo entero cuenta como encendido", () => {
  const html = pinta({ maquinasVivas: ["MacBookProNegro14"], maquinas: ["MacBookPro14"] });
  assert.deepEqual(pastillas(html), ["MBP14"]);
  assert.match(html, /class="maq-b on"/);
});

test("el tope cuenta EQUIPOS ya normalizados, no grafías sueltas", () => {
  const html = pinta({
    maquinasVivas: [],
    maquinas: ["MacBookProNegro14", "MacBookPro14", "Mac Mini", "MacBookAirAzul"],
  }, 3);
  assert.deepEqual(pastillas(html), ["MacMini", "MBAAzul", "MBP14"]);
  assert.ok(!/maq-mas/.test(html), "tres equipos caben en el tope de 3: no sobra ninguno");
});

test("una máquina fuera del diccionario se pinta tal cual, sin inventarle alias", () => {
  const html = pinta({ maquinasVivas: [], maquinas: ["equipo-desconocido"] });
  assert.deepEqual(pastillas(html), ["equipo-desconocido"]);
});

test("sin ordenadores conocidos sigue diciéndolo, no queda en blanco", () => {
  assert.match(pinta({ maquinasVivas: [], maquinas: [] }), /sin registro/);
});

test("CLI aparece una sola vez junto al equipo solo con ejecución CLI verificada", () => {
  for (const via of ["cli", "app", "", "unknown"]) {
    const html = pinta({ maquinasVivas:["MacMini"], maquinas:["MacMini"], runtime:"Codex", via, runtimePeso:120, runtimeAt:Date.now()/1000 });
    const cliCount = (html.match(/>CLI<\/span>/g) || []).length;
    assert.equal(cliCount, via === "cli" ? 1 : 0);
    if (via === "cli") assert.match(html, />MacMini<\/span>\s*<span[^>]*>CLI<\/span>/);
  }
});

// El diccionario es la fuente única: si aquí se rompe, la columna vuelve a partir
// el equipo en dos filas.
test("las cinco grafías de la norma 02 normalizan al mismo equipo", async () => {
  const sandbox = { window: {} };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(identitySource, sandbox);
  const id = sandbox.window.ykAgentIdentity;
  for (const grafia of ["MBP14", "MacBookPro14", "macbookpro14", "macbookpro14negro", "MacBookProNegro14"]) {
    assert.equal(id.suffix(grafia), "MBP14", `${grafia} debe resolver MBP14`);
    assert.equal(id.canonicalMachine(grafia), "MacBookPro14", `${grafia} debe normalizar a MacBookPro14`);
  }
  // El color se cae, pero el modelo+tamaño manda: el 16 no se confunde con el 14.
  assert.equal(id.canonicalMachine("MacBookPro16"), "MacBook Pro 16");
  assert.equal(id.canonicalMachine("MacBookProNegro16"), "MacBook Pro 16");
});
