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
  assert.equal(scopedAgentIdentity("Morfeo", "MacBook Pro 14"), "Morfeo14");
  assert.equal(scopedAgentIdentity("Oraculo", "MacBook Pro 16"), "Oraculo16");
});

test("conserva la forma especial de Agente Smith en los MBA de color", () => {
  assert.equal(scopedAgentIdentity("Smith", "MacBook Air Azul"), "Agente Smith Azul");
  assert.equal(scopedAgentIdentity("Smith", "MacBook Air Azul", "sub"), "SubAgente Smith Azul");
  assert.equal(scopedAgentIdentity("Smith", "MacBook Air Azul", "infra"), "InfraAgente Smith Azul");
});

test("lee aliases históricos sin perder la familia operativa", () => {
  assert.equal(baseAgentIdentity("InfraOraculoMini"), "Oraculo");
  assert.equal(baseAgentIdentity("subOraculo"), "Oraculo");
  assert.equal(baseAgentIdentity("Cypher"), "Smith");
  assert.equal(sameAgentFamily("Oráculo", "SubOraculo16"), true);
  assert.equal(sameAgentFamily("NeoMini", "InfraOraculoMini"), false);
});
