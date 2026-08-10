import test from "node:test";
import assert from "node:assert/strict";
import { deploymentUrlsFromJson, signedVersionFromPayload, signedVersionsFromDeployments } from "./deploy-history.js";

const good = {
  version:"v.10.08.2026.r7.08:58",
  deployedAt:"2026-08-10T06:58:15.636Z",
  deployer:"TrinityMBP14",
  machine:"MacBookPro14",
  signature:"TrinityMBP14 · MacBookPro14",
  git:"bb14ce0",
  gitShort:"bb14ce0",
  gitFull:"bb14ce0e1bc3ff99ce87a69ac10aed76436509a2",
  dirty:false
};

test("sólo acepta sellos limpios, íntegros y firmados por una identidad canónica", () => {
  assert.equal(signedVersionFromPayload(good), good.version);
  for (const change of [
    {dirty:true},
    {signature:"otra firma"},
    {deployer:"Codex"},
    {gitFull:"bb14ce0"},
    {gitShort:"fffffff"},
    {deployedAt:"ayer"},
    {version:"v.03.08.2026.r1.18:27", gitFull:undefined}
  ]) assert.equal(signedVersionFromPayload({...good, ...change}), "");
});

test("extrae únicamente URLs inmutables del historial Pages", () => {
  const raw = JSON.stringify([
    {Deployment:"https://adc0c9e3.yokup.pages.dev"},
    {Deployment:"https://adc0c9e3.yokup.pages.dev"},
    {Deployment:"https://otro.pages.dev"},
    {Deployment:"javascript:alert(1)"}
  ]);
  assert.deepEqual(deploymentUrlsFromJson(raw), ["https://adc0c9e3.yokup.pages.dev"]);
});

test("un deployment antiguo sin sello no tapa la revisión firmada anterior", async () => {
  const deployments = [
    {Deployment:"https://d13cebf9.yokup.pages.dev"},
    {Deployment:"https://adc0c9e3.yokup.pages.dev"}
  ];
  const fetchImpl = async (url) => ({
    ok:true,
    json:async () => url.includes("adc0c9e3") ? good : {version:"v.03.08.2026.r1.18:27"}
  });
  assert.deepEqual(await signedVersionsFromDeployments(deployments, fetchImpl), [good.version]);
});
