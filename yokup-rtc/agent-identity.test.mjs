import test from "node:test";
import assert from "node:assert/strict";
import {
  baseAgentIdentity,
  machineSuffix,
  parseAgentIdentity,
  sameAgentFamily,
  scopedAgentIdentity,
} from "./src/agent-identity.js";

test("aplica el apellido físico a principal, subagente e infraagente", () => {
  assert.equal(scopedAgentIdentity("Oraculo", "Mac Mini"), "OraculoMacMini");
  assert.equal(scopedAgentIdentity("Oraculo", "Mac Mini", "sub"), "SubOraculoMacMini");
  assert.equal(scopedAgentIdentity("Oraculo", "Mac Mini", "infra"), "InfraOraculoMacMini");
  assert.equal(scopedAgentIdentity("Neo", "Mac Mini"), "NeoMacMini");
  assert.equal(scopedAgentIdentity("Morfeo", "admira-macmini"), "MorfeoMacMini");
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

test("una identidad Mini explícita prevalece y MacMini histórico se sigue leyendo", () => {
  assert.equal(baseAgentIdentity("MorfeoMini"), "Morfeo");
  assert.equal(sameAgentFamily("MorfeoMini", "MorfeoMacMini"), true);
  assert.equal(scopedAgentIdentity("MorfeoMini", ""), "MorfeoMini");
  assert.equal(scopedAgentIdentity("MorfeoMacMini", ""), "MorfeoMacMini");
  assert.equal(scopedAgentIdentity("SubNeoMini", ""), "SubNeoMini");
  assert.equal(scopedAgentIdentity("OraculoMini", "macmini", "infra"), "InfraOraculoMini");
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

// Una persona que corre de verdad en la flota pero no está en el diccionario NO
// PUEDE CERRAR NADA: parseAgentIdentity cae al return final con suffix vacío, y
// validateMissionActor lo compara contra machineSuffix(loc) devolviendo 403
// owner_mismatch con expected y received IDÉNTICOS. Le pasó a NiobeMacMini el
// 15-08-2026 con FLT-1445, y el mensaje de error no daba ninguna pista.
test("los consejeros de GrokBot tienen carné: persona del diccionario y equipo GrokBot (FLT-1580)", () => {
  assert.equal(machineSuffix("grokbot"), "GrokBot");
  assert.equal(machineSuffix("Grok Bot"), "GrokBot");
  assert.equal(machineSuffix("sand"), "GrokBot", "el bundle de la app también se lee como equipo GrokBot");
  for (const [persona, largo] of [["Wozniak", "Steve Wozniak"], ["Jobs", "Steve Jobs"], ["Disney", "Walt Disney"], ["Lucas", "George Lucas"]]) {
    const id = `${persona}GrokBot`;
    assert.equal(baseAgentIdentity(id), persona);
    assert.equal(parseAgentIdentity(id).suffix, "GrokBot");
    assert.equal(parseAgentIdentity(id).legacy, false, `${id} no es legado: es una identidad viva`);
    assert.equal(scopedAgentIdentity(persona, "GrokBot"), id);
    assert.equal(scopedAgentIdentity(largo, "grokbot"), id, "el nombre completo del bot firma con el apellido corto");
    assert.equal(sameAgentFamily(persona, id), true);
  }
  assert.equal(parseAgentIdentity("SubWozniakGrokBot").role, "sub");
  assert.equal(sameAgentFamily("WozniakGrokBot", "JobsGrokBot"), false, "cada consejero es su propia familia aunque compartan equipo");
  assert.equal(sameAgentFamily("WozniakGrokBot", "MorfeoMacMini"), false);
});

test("Niobe está en el diccionario y su apellido case con su máquina", () => {
  assert.equal(baseAgentIdentity("NiobeMacMini"), "Niobe");
  assert.equal(parseAgentIdentity("NiobeMacMini").suffix, machineSuffix("macmini"));
  assert.equal(parseAgentIdentity("NiobeMacMini").legacy, false);
  assert.equal(parseAgentIdentity("SubNiobeMacMini").role, "sub");
  assert.equal(scopedAgentIdentity("Niobe", "MacMini"), "NiobeMacMini");
  assert.equal(scopedAgentIdentity("NiobeMini", ""), "NiobeMacMini");
  assert.equal(scopedAgentIdentity("SubNiobeMini", ""), "SubNiobeMacMini");
  assert.equal(scopedAgentIdentity("InfraNiobeMini", ""), "InfraNiobeMacMini");
  assert.equal(parseAgentIdentity("SubNiobeMini").suffix, machineSuffix("macmini"));
  assert.equal(parseAgentIdentity("InfraNiobeMini").suffix, machineSuffix("macmini"));
  assert.equal(sameAgentFamily("Niobe", "NiobeMacMini"), true);
  assert.equal(sameAgentFamily("SubNiobeMini", "InfraNiobeMacMini"), true);
  assert.equal(sameAgentFamily("NiobeMacMini", "OraculoMacMini"), false,
    "Niobe y Oraculo son familias distintas aunque compartan el mismo equipo");
});
