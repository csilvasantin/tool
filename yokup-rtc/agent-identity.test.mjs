import test from "node:test";
import assert from "node:assert/strict";
import {
  baseAgentIdentity,
  sameAgentFamily,
  scopedAgentIdentity,
} from "./src/agent-identity.js";

test("aplica el apellido físico a principal, subagente e infraagente", () => {
  assert.equal(scopedAgentIdentity("Oraculo", "Mac Mini"), "OraculoMini");
  assert.equal(scopedAgentIdentity("Oraculo", "Mac Mini", "sub"), "SubOraculoMini");
  assert.equal(scopedAgentIdentity("Oraculo", "Mac Mini", "infra"), "InfraOraculoMini");
  assert.equal(scopedAgentIdentity("Neo", "Mac Mini"), "NeoMini");
  assert.equal(scopedAgentIdentity("Morfeo", "MacBook Pro 14"), "MorfeoMBP14");
  assert.equal(scopedAgentIdentity("Oraculo", "MacBook Pro 16"), "OraculoMBP16");
  assert.equal(scopedAgentIdentity("Neo", "admira-macbookpro16"), "NeoMBP16");
  assert.equal(scopedAgentIdentity("Trinity", "MacBook Pro 16"), "TrinityMBP16");
});

test("el apellido viejo del Pro 16 se sigue leyendo, pero se reescribe a MBP16", () => {
  assert.equal(baseAgentIdentity("Neo16"), "Neo");
  assert.equal(sameAgentFamily("Neo16", "NeoMBP16"), true);
  // Un registro guardado como Neo16 vuelve a salir con el apellido actual.
  assert.equal(scopedAgentIdentity("Neo16", ""), "NeoMBP16");
  assert.equal(scopedAgentIdentity("SubMorfeo16", ""), "SubMorfeoMBP16");
});

test("el apellido es el del diccionario, sin acortar ni apodos (regla 02)", () => {
  assert.equal(scopedAgentIdentity("Neo", "MacBookAirAzul"), "NeoMBAAzul");
  assert.equal(scopedAgentIdentity("Neo", "MacBookAirAzul", "sub"), "SubNeoMBAAzul");
  assert.equal(scopedAgentIdentity("Morfeo", "MacBook Air Rosa"), "MorfeoMBARosa");
  assert.equal(scopedAgentIdentity("Morfeo", "MacBookAir16plata"), "MorfeoMBA16");
  // "Agente Smith Azul" se lee, pero ya no se propaga (regla 03).
  assert.equal(scopedAgentIdentity("Smith", "MacBook Air Azul"), "SmithMBAAzul");
  assert.equal(scopedAgentIdentity("Agente Smith Azul", ""), "SmithMBAAzul");
  assert.equal(scopedAgentIdentity("NeoAzul", ""), "NeoMBAAzul");
});

test("lee aliases históricos sin perder la familia operativa", () => {
  assert.equal(baseAgentIdentity("InfraOraculoMini"), "Oraculo");
  assert.equal(baseAgentIdentity("subOraculo"), "Oraculo");
  assert.equal(baseAgentIdentity("Cypher"), "Smith");
  assert.equal(sameAgentFamily("Oráculo", "SubOraculo16"), true);
  assert.equal(sameAgentFamily("NeoMini", "InfraOraculoMini"), false);
});

test("una máquina vacía o desconocida nunca hereda Mini por prefijo vacío", () => {
  assert.equal(scopedAgentIdentity("Oraculo", ""), "Oraculo");
  assert.equal(scopedAgentIdentity("Oraculo", "equipo-desconocido"), "Oraculo");
});
