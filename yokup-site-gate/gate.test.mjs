import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "./src/index.js";
import { TRUSTED_AFTER } from "./src/provenance.js";

const signed = {
  version:"v.10.08.2026.r8.10:30", deployedAt:TRUSTED_AFTER,
  deployer:"TrinityMBP14", machine:"MacBookPro14", signature:"TrinityMBP14 · MacBookPro14",
  git:"815c841", gitShort:"815c841", gitFull:"815c841012345678901234567890123456789012", dirty:false
};

test("un Pages antiguo queda aislado y la navegación sale por el fallback inmutable", async () => {
  const seen = [];
  const fakeFetch = async (input) => {
    const url = typeof input === "string" ? input : input.url;
    seen.push(url);
    if (url.includes("/version.json")) return Response.json({version:"v.03.08.2026.r1.18:27"});
    return new Response("correcto", {headers:{"Content-Type":"text/plain"}});
  };
  const response = await handleRequest(new Request("https://www.yokup.com/help/?q=1"), fakeFetch);
  assert.equal(await response.text(), "correcto");
  assert.equal(response.headers.get("X-Yokup-Gate"), "fallback");
  assert.equal(seen.at(-1), "https://adc0c9e3.yokup.pages.dev/help/?q=1");
});

test("una release firmada sirve el origen principal y conserva método y cuerpo", async () => {
  const seen = [];
  const fakeFetch = async (input) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.includes("/version.json")) return Response.json(signed);
    seen.push(input);
    return new Response("ok", {status:201});
  };
  await handleRequest(new Request("https://www.yokup.com/__yokup-gate"), fakeFetch);
  const request = new Request("https://www.yokup.com/api/local", {method:"POST", body:"dato", headers:{"Content-Type":"text/plain"}});
  const response = await handleRequest(request, fakeFetch);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("X-Yokup-Gate"), "primary");
  assert.equal(seen[0].url, "https://yokup.pages.dev/api/local");
  assert.equal(seen[0].method, "POST");
  assert.equal(await seen[0].text(), "dato");
});

test("el endpoint de control explica la decisión sin caché", async () => {
  const fakeFetch = async () => Response.json(signed);
  const response = await handleRequest(new Request("https://www.yokup.com/__yokup-gate"), fakeFetch);
  const body = await response.json();
  assert.equal(body.mode, "primary");
  assert.equal(body.fallback, false);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});
