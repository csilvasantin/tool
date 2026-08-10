import test from "node:test";
import assert from "node:assert/strict";
import worker, { handleRequest } from "./src/index.js";

const signed = {
  version:"v.10.08.2026.r8.10:01", deployedAt:"2026-08-10T08:01:59.443Z",
  deployer:"TrinityMBP14", machine:"MacBookPro14", signature:"TrinityMBP14 · MacBookPro14",
  git:"d8a4ce0", gitShort:"d8a4ce0", gitFull:"d8a4ce0ad3ea1232a9701a1b94483bdd1a99d581", dirty:false
};
const env = (assetFetch = async () => new Response("asset")) => ({RELEASE_JSON:JSON.stringify(signed), ASSETS:{fetch:assetFetch}});

test("el adaptador Cloudflare no confunde env con la función fetch", () => {
  assert.notEqual(worker.fetch, handleRequest);
  assert.equal(worker.fetch.length, 3);
});

test("la navegación sale de assets propios y nunca de Pages", async () => {
  const seen = [];
  const response = await handleRequest(new Request("https://www.yokup.com/help/?q=1"), env(async (request) => {
    seen.push(request.url);
    return new Response("correcto");
  }), {});
  assert.equal(await response.text(), "correcto");
  assert.deepEqual(seen, ["https://www.yokup.com/help/index.html?q=1"]);
});

test("conserva alias, puertas MCP/Help y fallback SPA sin _redirects", async () => {
  const seen = [];
  const assetEnv = env(async (request) => {
    seen.push(new URL(request.url).pathname);
    return new URL(request.url).pathname.startsWith("/desconocida") ? new Response("no", {status:404}) : new Response("sí");
  });
  const alias = await handleRequest(new Request("https://www.yokup.com/agentica"), assetEnv, {});
  assert.equal(alias.status, 301);
  assert.equal(alias.headers.get("location"), "https://www.yokup.com/dashboard");
  assert.equal(await (await handleRequest(new Request("https://www.yokup.com/help"), assetEnv, {})).text(), "sí");
  assert.equal(await (await handleRequest(new Request("https://www.yokup.com/mcp/"), assetEnv, {})).text(), "sí");
  assert.equal(await (await handleRequest(new Request("https://www.yokup.com/desconocida"), assetEnv, {})).text(), "sí");
  assert.deepEqual(seen, ["/help/index.html", "/mcp/index.html", "/desconocida.html", "/desconocida", "/index.html"]);
});

test("resuelve páginas HTML limpias sin delegar redirecciones al motor de assets", async () => {
  const seen = [];
  const response = await handleRequest(new Request("https://www.yokup.com/dashboard"), env(async (request) => {
    seen.push(new URL(request.url).pathname);
    return new URL(request.url).pathname === "/dashboard.html" ? new Response("dashboard") : new Response("no", {status:404});
  }), {});
  assert.equal(await response.text(), "dashboard");
  assert.deepEqual(seen, ["/dashboard.html"]);
});

test("version.json procede del sello inyectado, no del baseline de assets", async () => {
  const response = await handleRequest(new Request("https://www.yokup.com/version.json"), env(), {});
  assert.deepEqual(await response.json(), signed);
  assert.equal(response.headers.get("X-Yokup-Gate"), "worker-assets");
});

test("el endpoint de control explica la decisión sin caché", async () => {
  const response = await handleRequest(new Request("https://www.yokup.com/__yokup-gate"), env(), {});
  const body = await response.json();
  assert.equal(body.mode, "worker-assets");
  assert.equal(body.version, signed.version);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("sin sello el Worker falla cerrado antes de servir assets", async () => {
  const response = await handleRequest(new Request("https://www.yokup.com/"), {ASSETS:{fetch:() => { throw new Error("no debe ejecutarse"); }}}, {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "missing-release");
});
