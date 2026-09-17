// /turn no devuelve información: ACUÑA una credencial TURN de la cuenta y se la da a
// quien la pida. Estaba abierta a todo internet, con ttl de una hora y CORS *, así que
// cualquiera sacaba relé ilimitado a nuestra costa (inventario de superficie pública,
// 16-09-2026 · DCL-118df4c8137e9b1c945e62d0). Aquí se fija que el grifo queda acotado.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");

function fuente(nombre) {
  const marcas = [`function ${nombre}(`, `async function ${nombre}(`];
  const inicio = marcas.map((m) => source.indexOf(m)).filter((i) => i !== -1).sort((a, b) => a - b)[0];
  assert.notEqual(inicio, undefined, `falta ${nombre}`);
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
const constante = (nombre) => {
  const m = new RegExp(`^var ${nombre} = .*$`, "m").exec(source);
  assert.ok(m, `falta ${nombre}`);
  return m[0];
};

const ctx = vm.createContext({ __name: () => {}, Set, Math, Number, String, URL, console });
vm.runInContext([
  constante("TURN_ORIGENES"), constante("TURN_TTL_S"), constante("TURN_CUPO_HORA"),
  fuente("turnOrigenPermitido"), fuente("turnCupo"),
  "globalThis.origen = turnOrigenPermitido; globalThis.cupo = turnCupo; globalThis.LIMITE = TURN_CUPO_HORA; globalThis.TTL = TURN_TTL_S;",
].join("\n"), ctx);

const pide = (headers) => ({ headers: { get: (k) => headers[k] ?? headers[k.toLowerCase()] ?? null } });

// Una base de datos de mentira que cuenta como la de verdad.
function baseDatos({ rompe = false } = {}) {
  const filas = new Map();
  return { exec: async () => { if (rompe) throw new Error("D1 caído"); },
    prepare(sql) {
      return { bind(...args) { return {
        async run() {
          if (rompe) throw new Error("D1 caído");
          if (sql.startsWith("INSERT")) { const k = args[0] + "|" + args[1]; filas.set(k, (filas.get(k) || 0) + 1); }
          if (sql.startsWith("DELETE")) for (const k of [...filas.keys()]) if (Number(k.split("|")[1]) < args[0]) filas.delete(k);
        },
        async first() { return { n: filas.get(args[0] + "|" + args[1]) || 0 }; },
      }; } };
    } };
}

test("las páginas de yokup pueden pedir credencial; un curl pelado no", async () => {
  assert.equal(ctx.origen(pide({ Origin: "https://yokup.com" })), "https://yokup.com");
  assert.equal(ctx.origen(pide({ Origin: "https://www.yokup.com" })), "https://www.yokup.com");
  assert.equal(ctx.origen(pide({})), "", "sin Origin ni Referer no se acuña nada");
});

test("y las de admira.live también, porque yokup.com se está mudando allí", async () => {
  // 17-09-2026: /asistencia pasa a vivir en www.admira.live. Sin esto, la sala se
  // publica pero no puede negociar la llamada.
  assert.equal(ctx.origen(pide({ Origin: "https://www.admira.live" })), "https://www.admira.live");
  assert.equal(ctx.origen(pide({ Origin: "https://admira.live" })), "https://admira.live");
});

test("un origen ajeno no vale, ni aunque se parezca", async () => {
  for (const o of ["https://yokup.com.evil.net", "http://yokup.com", "https://admira.live.evil.net",
                   "http://www.admira.live", "https://admiralive.com", "null"]) {
    assert.equal(ctx.origen(pide({ Origin: o })), "", `${o} no debería pasar`);
  }
});

test("si no hay Origin se acepta el Referer de la página, y sólo el suyo", async () => {
  assert.equal(ctx.origen(pide({ Referer: "https://yokup.com/contactanos.html" })), "https://yokup.com");
  assert.equal(ctx.origen(pide({ Referer: "https://otro.example/x" })), "");
  assert.equal(ctx.origen(pide({ Referer: "no-es-una-url" })), "");
});

test("el Origin manda sobre el Referer: no se cuela por la puerta de atrás", async () => {
  assert.equal(ctx.origen(pide({ Origin: "https://malo.example", Referer: "https://yokup.com/x" })), "");
});

test("una IP puede acuñar hasta el límite y a partir de ahí se le niega", async () => {
  const env = { DB: baseDatos() };
  const ahora = Date.UTC(2026, 8, 16, 10, 0, 0);
  for (let i = 1; i <= ctx.LIMITE; i += 1) {
    const r = await ctx.cupo(env, "1.2.3.4", ahora);
    assert.equal(r.ok, true, `la petición ${i} debería entrar`);
  }
  const pasada = await ctx.cupo(env, "1.2.3.4", ahora);
  assert.equal(pasada.ok, false);
  assert.equal(pasada.usadas, ctx.LIMITE + 1);
});

test("el cupo es por IP: el vecino no paga el abuso de otro", async () => {
  const env = { DB: baseDatos() };
  const ahora = Date.UTC(2026, 8, 16, 10, 0, 0);
  for (let i = 0; i <= ctx.LIMITE; i += 1) await ctx.cupo(env, "1.2.3.4", ahora);
  assert.equal((await ctx.cupo(env, "5.6.7.8", ahora)).ok, true);
});

test("a la hora siguiente el cupo se renueva", async () => {
  const env = { DB: baseDatos() };
  const ahora = Date.UTC(2026, 8, 16, 10, 0, 0);
  for (let i = 0; i <= ctx.LIMITE; i += 1) await ctx.cupo(env, "1.2.3.4", ahora);
  assert.equal((await ctx.cupo(env, "1.2.3.4", ahora + 3600000)).ok, true);
});

test("sin IP no se acuña, y si la contabilidad falla tampoco: nada de barra libre", async () => {
  assert.equal((await ctx.cupo({ DB: baseDatos() }, "", Date.now())).ok, false);
  assert.equal((await ctx.cupo({}, "1.2.3.4", Date.now())).ok, false);
  assert.equal((await ctx.cupo({ DB: baseDatos({ rompe: true }) }, "1.2.3.4", Date.now())).ok, false);
});

test("la credencial dura 10 minutos, no una hora", () => {
  assert.equal(ctx.TTL, 600);
  assert.match(source, /body: JSON\.stringify\(\{ ttl: TURN_TTL_S \}\)/);
  assert.doesNotMatch(source, /JSON\.stringify\(\{ ttl: 3600 \}\)/);
});

test("la respuesta del grifo no sale con el comodín de CORS", () => {
  const ruta = source.slice(source.indexOf('url.pathname === "/turn"'));
  const bloque = ruta.slice(0, ruta.indexOf("/circuits"));
  assert.match(bloque, /"Access-Control-Allow-Origin": turnOrigen \|\| "https:\/\/yokup\.com"/);
  assert.match(bloque, /"Vary": "Origin"/);
  assert.doesNotMatch(bloque, /\.\.\.CORS, "content-type"/);
});
