import test from "node:test";
import assert from "node:assert/strict";
import { memberRefMatches, resolveDecisionIdentity } from "./src/decision-project.js";

test("OnIdle acepta OraculoMini exacto y toda escritura nueva converge a Mini", () => {
  const machine = "admira-macmini";
  assert.deepEqual(resolveDecisionIdentity("OraculoMini", machine), {
    ok:true, agent:"OraculoMini", machine
  });
  assert.deepEqual(resolveDecisionIdentity("Oraculo", machine), {
    ok:true, agent:"OraculoMini", machine
  });
  assert.deepEqual(resolveDecisionIdentity("SubOraculoMini", machine), {
    ok:true, agent:"SubOraculoMini", machine
  });
  assert.deepEqual(resolveDecisionIdentity("InfraOraculoMini", machine), {
    ok:true, agent:"InfraOraculoMini", machine
  });
});

test("OraculoMacMini queda como alias histórico de lectura y no vuelve a emitirse", () => {
  const machine = "admira-macmini";
  assert.deepEqual(resolveDecisionIdentity("OraculoMacMini", machine), {
    ok:true, agent:"OraculoMini", machine
  });
  assert.deepEqual(resolveDecisionIdentity("SubOraculoMacMini", machine), {
    ok:true, agent:"SubOraculoMini", machine
  });
  assert.equal(memberRefMatches("agent", "OraculoMacMini", "OraculoMini"), true);
  assert.equal(memberRefMatches("agent", "InfraOraculoMini", "InfraOraculoMacMini"), true);
});

test("la equivalencia Mini/MacMini no relaja MBP ni MBA", () => {
  assert.deepEqual(resolveDecisionIdentity("Oraculo", "admira-macbookpro16"), {
    ok:true, agent:"OraculoMBP16", machine:"admira-macbookpro16"
  });
  assert.deepEqual(resolveDecisionIdentity("Morfeo", "MacBookAir16plata"), {
    ok:true, agent:"MorfeoMBA16", machine:"MacBookAir16plata"
  });
  assert.deepEqual(resolveDecisionIdentity("Neo", "MacBook Air Azul"), {
    ok:true, agent:"NeoMBAAzul", machine:"MacBook Air Azul"
  });
  assert.equal(resolveDecisionIdentity("OraculoMini", "admira-macbookpro16").ok, false);
  assert.equal(resolveDecisionIdentity("OraculoMBP16", "admira-macmini").ok, false);
  assert.equal(memberRefMatches("agent", "NeoMini", "NeoMBP16"), false);
  assert.equal(memberRefMatches("agent", "MorfeoMBA16", "MorfeoMBP16"), false);
});
