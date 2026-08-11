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
  assert.equal(body.signature, signed.signature);
  assert.equal(body.dirty, false);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("sin sello el Worker falla cerrado antes de servir assets", async () => {
  const response = await handleRequest(new Request("https://www.yokup.com/"), {ASSETS:{fetch:() => { throw new Error("no debe ejecutarse"); }}}, {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "missing-release");
});

test("challenge y callback POST los atiende el gate real, no Assets", async () => {
  let assetCalls = 0;
  const calls = [];
  const testEnv = env(async () => { assetCalls += 1; return new Response("asset"); });
  const fetchImpl = async (url, init) => {
    calls.push({url, init});
    if (String(url).endsWith("/auth/challenge")) {
      return new Response('{"state":"s","nonce":"n"}', {status:200, headers:{"Content-Type":"application/json", "Set-Cookie":"__Host-yk_challenge=s; Secure; HttpOnly; Path=/"}});
    }
    return new Response("handoff", {status:200, headers:{"Content-Type":"text/html"}});
  };
  const challenge = await handleRequest(new Request("https://www.yokup.com/auth/challenge", {
    method:"POST", headers:{"Content-Type":"application/json"}, body:'{"flow":"redirect","return_to":"/dashboard"}'
  }), testEnv, {}, fetchImpl);
  assert.equal(challenge.status, 200);
  assert.match(challenge.headers.get("Set-Cookie"), /__Host-yk_challenge=s/);
  const form = new URLSearchParams({credential:"jwt", state:"s", g_csrf_token:"csrf"}).toString();
  const callback = await handleRequest(new Request("https://www.yokup.com/auth/callback", {
    method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded", Cookie:"g_csrf_token=csrf; __Host-yk_challenge=s"}, body:form
  }), testEnv, {}, fetchImpl);
  assert.equal(callback.status, 200);
  assert.equal(await callback.text(), "handoff");
  assert.equal(assetCalls, 0);
  assert.equal(calls[0].init.headers.Origin, "https://www.yokup.com");
  assert.equal(calls[1].init.headers.Cookie, "g_csrf_token=csrf; __Host-yk_challenge=s");
});

test("el host bare canonicaliza navegación y nunca sirve o reenvía login", async () => {
  let assets = 0, network = 0;
  const testEnv = env(async () => { assets += 1; return new Response("asset"); });
  for (const method of ["GET", "HEAD"]) {
    const response = await handleRequest(new Request("https://yokup.com/dashboard?q=1", {method}), testEnv, {}, async () => { network += 1; });
    assert.equal(response.status, 308);
    assert.equal(response.headers.get("Location"), "https://www.yokup.com/dashboard?q=1");
  }
  const callback = await handleRequest(new Request("https://yokup.com/auth/callback", {
    method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"}, body:"credential=secret"
  }), testEnv, {}, async () => { network += 1; });
  assert.equal(callback.status, 403);
  assert.equal(assets, 0);
  assert.equal(network, 0);
});
