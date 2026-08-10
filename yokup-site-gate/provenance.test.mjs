import test from "node:test";
import assert from "node:assert/strict";
import { assessProvenance, FALLBACK_ORIGIN, PRIMARY_ORIGIN, TRUSTED_AFTER } from "./src/provenance.js";

const good = {
  version:"v.10.08.2026.r7.08:58",
  deployedAt:TRUSTED_AFTER,
  deployer:"TrinityMBP14",
  machine:"MacBookPro14",
  signature:"TrinityMBP14 · MacBookPro14",
  git:"bb14ce0",
  gitShort:"bb14ce0",
  gitFull:"bb14ce0e1bc3ff99ce87a69ac10aed76436509a2",
  dirty:false
};

test("acepta la recuperación firmada y releases posteriores", () => {
  assert.deepEqual(assessProvenance(good), {trusted:true, reason:"signed-clean-release"});
  assert.equal(assessProvenance({...good, version:"v.10.08.2026.r8.10:30", deployedAt:"2026-08-10T08:30:00Z"}).trusted, true);
});

test("rechaza el baseline antiguo y cualquier procedencia incompleta o manipulada", () => {
  const cases = [
    {version:"v.03.08.2026.r1.18:27", note:"baseline"},
    {...good, dirty:true},
    {...good, deployedAt:"2026-08-09T23:00:00Z"},
    {...good, signature:"TrinityMBP14 · otro"},
    {...good, gitFull:"bb14ce0"},
    {...good, gitShort:"1234567"}
  ];
  for (const payload of cases) assert.equal(assessProvenance(payload).trusted, false);
});

test("los orígenes son Pages, separados del dominio protegido", () => {
  assert.equal(PRIMARY_ORIGIN, "https://yokup.pages.dev");
  assert.match(FALLBACK_ORIGIN, /^https:\/\/[a-f0-9]+\.yokup\.pages\.dev$/);
});
