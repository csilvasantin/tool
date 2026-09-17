// D1 `exec()` ejecuta SENTENCIA POR LÍNEA. Una SQL repartida en varias líneas le llega
// cortada y responde «incomplete input: SQLITE_ERROR».
//
// El 17-09-2026 eso tumbó PRODUCCIÓN entera: las tablas del supervisor de visión llegaron
// escritas en plantilla multilínea, applySchema petaba y con ella todas las rutas que
// aseguran esquema — /highscore/daily, /projects, /fleet/missions… devolviendo 1101. Ya
// había pasado antes con hosting_cost_map, así que esta prueba está para que no haya
// una tercera vez: imita a D1 y se niega a tragar una SQL con salto de línea.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { readdir } from "node:fs/promises";

// applySchema usa constantes SQL repartidas por medio src/. En vez de listarlas a mano
// —y que la lista se quede vieja— se cargan TODAS las que exporte cualquier módulo: así,
// si mañana llega otra tabla nueva escrita en varias líneas, esta prueba la pilla sola.
const src = new URL("./src/", import.meta.url);
const constantes = {};
for (const fichero of (await readdir(src)).filter((f) => f.endsWith(".js") && f !== "index.js")) {
  const modulo = await import(new URL(fichero, src).href).catch(() => null);
  if (!modulo) continue;
  for (const [nombre, valor] of Object.entries(modulo)) {
    if (/_SQL[A-Z_]*$/.test(nombre) || /_SEED$/.test(nombre)) constantes[nombre] = valor;
  }
}
const supervisor = await import(new URL("supervisor.js", src).href);

const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");

function fuente(nombre, prefijo = "async function ") {
  const inicio = source.indexOf(prefijo + nombre + "(");
  assert.notEqual(inicio, -1, `falta ${nombre}`);
  const llave = source.indexOf("{", inicio);
  let nivel = 0, comilla = "", escapado = false;
  for (let i = llave; i < source.length; i += 1) {
    const c = source[i];
    if (comilla) {
      if (escapado) escapado = false;
      else if (c === "\\") escapado = true;
      else if (c === comilla) comilla = "";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { comilla = c; continue; }
    if (c === "{") nivel += 1;
    else if (c === "}" && --nivel === 0) return source.slice(inicio, i + 1);
  }
  throw new Error(`${nombre} incompleta`);
}

// Un D1 de mentira que se comporta como el de verdad: parte por líneas y protesta.
// Recorta el argumento de cada llamada `prefijo(...)` contando paréntesis, que con una
// expresión regular se comía el `.catch(() => {})` de al lado.
function argumentosDe(texto, prefijo) {
  const fuera = [];
  let desde = 0;
  for (;;) {
    const i = texto.indexOf(prefijo, desde);
    if (i === -1) return fuera;
    let nivel = 0, comilla = "", escapado = false;
    const inicio = i + prefijo.length - 1;
    for (let j = inicio; j < texto.length; j += 1) {
      const c = texto[j];
      if (comilla) {
        if (escapado) escapado = false;
        else if (c === "\\") escapado = true;
        else if (c === comilla) comilla = "";
        continue;
      }
      if (c === '"' || c === "'" || c === "`") { comilla = c; continue; }
      if (c === "(") nivel += 1;
      else if (c === ")" && --nivel === 0) { fuera.push(texto.slice(inicio + 1, j).trim()); desde = j; break; }
    }
    if (desde <= i) return fuera;
  }
}

function d1DeVerdad() {
  const ejecutadas = [];
  return {
    ejecutadas,
    async exec(sql) {
      const texto = String(sql);
      if (/\n/.test(texto)) {
        throw new Error("D1_EXEC_ERROR: Error in line 1: " + texto.split("\n")[0] + ": incomplete input: SQLITE_ERROR");
      }
      ejecutadas.push(texto);
      return { count: 1 };
    },
    prepare() { return { bind() { return this; }, async run() { return { meta:{ changes:0 } }; }, async first() { return null; }, async all() { return { results: [] }; } }; },
  };
}

test("applySchema no le pasa a D1 ni una sola SQL con salto de línea", () => {
  // Lectura estática, no ejecución: applySchema toca media docena de módulos y montar
  // todo su mundo para esta comprobación sería más frágil que lo que se comprueba.
  // Aquí se mira lo único que importa: qué se le entrega a env.DB.exec().
  const cuerpo = fuente("applySchema");
  const llamadas = argumentosDe(cuerpo, "env.DB.exec(");
  assert.ok(llamadas.length > 5, "applySchema debería crear varias tablas");

  const sinResolver = [];
  for (const arg of llamadas) {
    if (/^unaLinea\(/.test(arg)) continue;                       // ya viene aplanada
    if (/^["'`]/.test(arg)) {
      // Un literal partido con + a lo largo de varias líneas del fuente sigue siendo UNA
      // sola línea de SQL: lo que cuenta es la cadena resultante, no cómo está escrita.
      const cadena = arg.replace(/["'`]\s*\+\s*["'`]/g, "");
      assert.equal(/\n/.test(cadena), false, "SQL literal partida en varias líneas: " + arg.slice(0, 60));
      continue;
    }
    // La regla es simple y comprobable de un vistazo: si una constante va a exec, va
    // aplanada. Comprobar «sólo las que hoy vienen partidas» obliga a acordarse cada vez.
    assert.fail("env.DB.exec(" + arg.trim() + ") sin unaLinea(): si mañana esa SQL se escribe " +
      "en varias líneas, D1 la parte y tumba applySchema entera");
  }
  assert.deepEqual(sinResolver, []);
});

test("las tablas del supervisor siguen siendo las mismas, sólo que en una línea", () => {
  const ctx = vm.createContext({ String, RegExp });
  vm.runInContext(fuente("unaLinea", "function ").replace("__name", "void 0 && __name") + "\nglobalThis.unaLinea = unaLinea;", ctx);
  const plana = ctx.unaLinea(supervisor.SUPERVISOR_STATIONS_SQL);
  assert.equal(/\n/.test(plana), false);
  assert.match(plana, /^CREATE TABLE IF NOT EXISTS supervisor_stations \(/);
  // Aplanar no puede perder columnas: se cuentan antes y después.
  const columnas = (t) => (t.match(/\b(id|project_id|label|location|canonical_screen|expected_screens|status|issue_code|confidence|summary|visible_screens|active_screens|consecutive_failures|open_ticket_id|last_seen_at|last_alert_at|updated_by)\b/g) || []).length;
  assert.equal(columnas(plana), columnas(supervisor.SUPERVISOR_STATIONS_SQL));
});
