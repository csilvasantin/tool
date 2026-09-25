// Encargo #4378: applySchema son ~125 idas y vueltas a D1 en serie. Desde un colo lejano
// eso eran 12-15 s de isolate frío y /fleet/missions no contestaba a tiempo. Ahora el
// esquema se sella con el id de la versión desplegada y un isolate nuevo de ESA versión
// hace una sola lectura. Estas pruebas vigilan las tres salidas: sellado, sin sellar y
// sin binding (que debe comportarse exactamente como antes).
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
const wrangler = await readFile(new URL("./wrangler.toml", import.meta.url), "utf8");

function fuente(nombre, prefijo) {
  const inicio = source.indexOf(prefijo + nombre + "(");
  assert.notEqual(inicio, -1, `falta ${nombre}`);
  const fin = source.indexOf(`__name(${nombre},`, inicio);
  assert.notEqual(fin, -1, `falta el __name de ${nombre}`);
  return source.slice(inicio, fin);
}

// applySchema de mentira con el mismo guard que la real: si el sello vale, no ejecuta nada.
const ctx = vm.createContext({ __name: (f) => f, Date });
vm.runInContext([
  fuente("versionDeEsquema", "function "),
  fuente("esquemaSellado", "async function "),
  fuente("sellarEsquema", "async function "),
  `async function applySchema(env) {
    const version = versionDeEsquema(env);
    if (await esquemaSellado(env, version)) return;
    for (let i = 0; i < 125; i += 1) await env.DB.exec("CREATE TABLE IF NOT EXISTS t" + i + " (x)");
    await sellarEsquema(env, version);
  }`,
  "this.applySchema = applySchema;",
].join("\n"), ctx);

function d1Falso(selloInicial) {
  const s = { sello: selloInicial, llamadas: 0, ddl: 0, sinTabla: selloInicial === undefined };
  s.DB = {
    async exec(sql) {
      s.llamadas += 1;
      if (/schema_meta/.test(sql)) s.sinTabla = false; else s.ddl += 1;
    },
    prepare(sql) {
      return {
        bind(...args) { this.args = args; return this; },
        async first() {
          s.llamadas += 1;
          if (s.sinTabla) throw new Error("no such table: schema_meta");
          return s.sello ? { version: s.sello } : null;
        },
        async run() { s.llamadas += 1; s.sello = this.args[0]; },
      };
    },
  };
  return s;
}

test("isolate frío de una versión ya sellada: una sola lectura, cero DDL", async () => {
  const s = d1Falso("v-123");
  await ctx.applySchema({ DB: s.DB, CF_VERSION_METADATA: { id: "v-123" } });
  assert.equal(s.llamadas, 1);
  assert.equal(s.ddl, 0);
});

test("versión nueva (o primera vez, sin tabla): aplica todo y sella", async () => {
  const s = d1Falso(undefined);
  await ctx.applySchema({ DB: s.DB, CF_VERSION_METADATA: { id: "v-456" } });
  assert.equal(s.ddl, 125);
  assert.equal(s.sello, "v-456");
  const otro = { DB: s.DB, CF_VERSION_METADATA: { id: "v-456" } };
  s.llamadas = 0; s.ddl = 0;
  await ctx.applySchema(otro);
  assert.equal(s.llamadas, 1, "el siguiente isolate de la misma versión solo lee el sello");
});

test("sello de otra versión: vuelve a aplicar entero", async () => {
  const s = d1Falso("v-viejo");
  await ctx.applySchema({ DB: s.DB, CF_VERSION_METADATA: { id: "v-nuevo" } });
  assert.equal(s.ddl, 125);
  assert.equal(s.sello, "v-nuevo");
});

test("sin binding de versión: se aplica entero como antes y no se sella nada", async () => {
  const s = d1Falso("v-123");
  await ctx.applySchema({ DB: s.DB });
  assert.equal(s.ddl, 125);
  assert.equal(s.llamadas, 125, "ni lee ni escribe el sello");
});

test("la applySchema real lleva el guard al principio y el sello al final; wrangler declara el binding", () => {
  const real = source.slice(source.indexOf("async function applySchema(env) {"), source.indexOf("__name(applySchema,"));
  assert.match(real, /^async function applySchema\(env\) \{\s*const version = versionDeEsquema\(env\);\s*if \(await esquemaSellado\(env, version\)\) return;/);
  assert.match(real, /await sellarEsquema\(env, version\);\s*\}\s*$/);
  assert.match(wrangler, /\[version_metadata\]\s*binding = "CF_VERSION_METADATA"/);
});

test("una promesa de esquema huérfana (petición cancelada) se relanza pasados 20 s", async () => {
  const inicio = source.indexOf("var schemaDesde = 0");
  const fin = source.indexOf('__name(ensureSchema, "ensureSchema");');
  assert.ok(inicio > 0 && fin > inicio, "no encuentro ensureSchema con su guarda");
  let ahora = 1_000_000, lanzadas = 0;
  const pendientes = [];
  const c = vm.createContext({
    Date: { now: () => ahora },
    applySchema: () => { lanzadas += 1; return new Promise((ok) => pendientes.push(ok)); },
  });
  vm.runInContext(source.slice(inicio, fin) + "\nthis.ensureSchema = ensureSchema;", c);
  c.ensureSchema({});                 // la primera petición arranca y «se cancela»: nunca resuelve
  ahora += 5_000; c.ensureSchema({});
  assert.equal(lanzadas, 1, "dentro de 20 s se comparte la misma promesa");
  ahora += 16_000; const p = c.ensureSchema({});
  assert.equal(lanzadas, 2, "pasados 20 s sin resolverse se relanza");
  pendientes[1]();
  await p;
  ahora += 60_000; await c.ensureSchema({});
  assert.equal(lanzadas, 2, "resuelta, no se vuelve a lanzar aunque pase el tiempo");
});
