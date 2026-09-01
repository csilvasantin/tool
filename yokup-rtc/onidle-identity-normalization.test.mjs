import test from "node:test";
import assert from "node:assert/strict";
import { memberRefMatches, resolveDecisionIdentity } from "./src/decision-project.js";

// Hasta el 1-sep-2026 esto fijaba lo contrario: que toda escritura nueva del Mac
// Mini convergiera a `Mini`. Chocaba de frente con la normativa 02 (4-ago-2026,
// «el apellido no se abrevia; el del Mac Mini es MacMini»), y como la ruta de
// misiones sí escribía MacMini, el mismo agente salía en DOS filas del Highscore.
// Se invierte la dirección: `Mini` se sigue leyendo, `MacMini` es lo que se escribe.
test("OnIdle acepta OraculoMini exacto y toda escritura nueva converge a MacMini", () => {
  const machine = "admira-macmini";
  assert.deepEqual(resolveDecisionIdentity("OraculoMini", machine), {
    ok:true, agent:"OraculoMacMini", machine
  });
  assert.deepEqual(resolveDecisionIdentity("Oraculo", machine), {
    ok:true, agent:"OraculoMacMini", machine
  });
  assert.deepEqual(resolveDecisionIdentity("SubOraculoMini", machine), {
    ok:true, agent:"SubOraculoMacMini", machine
  });
  assert.deepEqual(resolveDecisionIdentity("InfraOraculoMini", machine), {
    ok:true, agent:"InfraOraculoMacMini", machine
  });
});

test("OraculoMini queda como alias histórico de lectura y no vuelve a emitirse", () => {
  const machine = "admira-macmini";
  assert.deepEqual(resolveDecisionIdentity("OraculoMacMini", machine), {
    ok:true, agent:"OraculoMacMini", machine
  });
  assert.deepEqual(resolveDecisionIdentity("SubOraculoMacMini", machine), {
    ok:true, agent:"SubOraculoMacMini", machine
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
