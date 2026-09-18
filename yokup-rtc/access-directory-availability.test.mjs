import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";
import {normalizeAccessDirectory, supervisorAccessForSession} from "./src/supervisor-access.js";

const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
const start = source.indexOf('var WL_API = "https://whitelist.admira.store"');
const end = source.indexOf("var b64u =", start);
assert.ok(start >= 0 && end > start, "no se encontró el bloque del directorio de acceso");
const directorySource = source.slice(start, end);

function harness(fetchImpl) {
  let now = 1_000_000;
  const timeouts = [];
  const calls = [];
  const context = vm.createContext({
    fetch:(url, init) => { calls.push({url, init}); return fetchImpl(url, init); },
    AbortSignal:{
      timeout(milliseconds) {
        timeouts.push(milliseconds);
        return {timeout_ms:milliseconds};
      }
    },
    Date:{now:() => now},
    normalizeAccessDirectory,
    supervisorAccessForSession,
    __name:value => value,
    Set, String, Error
  });
  vm.runInContext(`${directorySource}\nglobalThis.directoryTest={accessDirectory,whitelist,emergencyAccessDirectory};`, context);
  return {
    api:context.directoryTest,
    calls,
    timeouts,
    advance:milliseconds => { now += milliseconds; }
  };
}

test("el directorio remoto usa un timeout corto y conserva su caché saludable", async () => {
  const run = harness(async () => ({
    ok:true,
    json:async () => ({emails:["viewer@example.com", "admin@example.com"], superusers:["admin@example.com"]})
  }));

  const first = await run.api.accessDirectory();
  assert.deepEqual([...first.emails], ["viewer@example.com", "admin@example.com"]);
  assert.deepEqual([...first.superusers], ["admin@example.com"]);
  assert.equal(run.calls.length, 1);
  assert.equal(run.calls[0].url, "https://whitelist.admira.store/list");
  assert.equal(run.calls[0].init.signal.timeout_ms, 2500);
  assert.deepEqual(run.timeouts, [2500]);

  run.advance(299_999);
  assert.equal(await run.api.accessDirectory(), first);
  assert.equal(run.calls.length, 1, "la caché viva evita nuevas consultas durante cinco minutos");
  run.advance(2);
  await run.api.accessDirectory();
  assert.equal(run.calls.length, 2);
});

test("una caída usa whitelist de emergencia, niega superusuarios y cachea brevemente el fallo", async () => {
  const run = harness(async () => { throw new Error("upstream offline"); });
  const first = await run.api.accessDirectory();

  assert.deepEqual([...first.emails].sort(), [
    "agonzalez@admira.com", "csilva@admira.com", "csilvasantin@gmail.com",
    "jsedano@admira.com", "mzavaleta@admira.com"
  ]);
  assert.equal(first.superusers.size, 0, "el fallback nunca inventa privilegios de superusuario");
  assert.equal(supervisorAccessForSession(first, {email:"csilva@admira.com"}).allowed, true);
  assert.equal(supervisorAccessForSession(first, {email:"csilva@admira.com"}).canChangeProject, false);
  assert.equal(run.calls.length, 1);

  run.advance(14_999);
  assert.equal(await run.api.accessDirectory(), first);
  assert.equal(run.calls.length, 1, "el fallo cacheado evita una tormenta por petición");
  run.advance(2);
  const refreshedFallback = await run.api.accessDirectory();
  assert.equal(run.calls.length, 2, "el fallback breve vuelve a comprobar el directorio");
  assert.equal(refreshedFallback.superusers.size, 0);
  assert.deepEqual(run.timeouts, [2500, 2500]);
});

test("una respuesta HTTP fallida también degrada de forma cerrada", async () => {
  const run = harness(async () => ({ok:false, status:503, json:async () => ({
    emails:["attacker@example.com"], superusers:["attacker@example.com"]
  })}));
  const directory = await run.api.accessDirectory();

  assert.equal(directory.emails.has("attacker@example.com"), false);
  assert.equal(directory.superusers.size, 0);
  assert.match(directorySource, /if \(!r\.ok\) throw new Error\("whitelist_unavailable"\)/);
});
