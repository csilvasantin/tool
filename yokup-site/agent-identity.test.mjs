import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
await import("./yk-agent-identity.js");
const id = globalThis.ykAgentIdentity;

assert.equal(id.scoped("Oraculo","Mac Mini"),"OraculoMini");
assert.equal(id.scoped("Oraculo","Mac Mini","sub"),"SubOraculoMini");
assert.equal(id.scoped("Oraculo","Mac Mini","infra"),"InfraOraculoMini");
assert.equal(id.scoped("Neo","MacMini"),"NeoMini");
assert.equal(id.scoped("Smith","MacMini"),"SmithMini");
assert.equal(id.parse("SmithMini").persona,"Smith");
assert.equal(id.display("SmithMini","MacMini"),"SmithMini");
assert.equal(id.display("SmithMacMini",""),"SmithMini");
assert.equal(id.display("Neo","MacBook Pro 14"),"NeoMBP14");
assert.equal(id.scoped("Morfeo","MacBookProNegro14"),"MorfeoMBP14");
assert.equal(id.scoped("Morfeo","MacBookPro14","sub"),"SubMorfeoMBP14");
assert.equal(id.scoped("Oraculo","MacBookPro16"),"OraculoMBP16");
assert.equal(id.scoped("Oraculo","MacBookPro16","infra"),"InfraOraculoMBP16");
// Regla 02: el apellido es el del diccionario, sin acortar. Regla 03: los nombres
// viejos («NeoAzul», «Agente Smith Azul», «NeoMacMini») se leen y se reescriben.
assert.equal(id.scoped("Neo","MacBookAirAzul"),"NeoMBAAzul");
assert.equal(id.scoped("Neo","MacBookAirAzul","sub"),"SubNeoMBAAzul");
assert.equal(id.scoped("Morfeo","MacBook Air Rosa"),"MorfeoMBARosa");
assert.equal(id.scoped("Morfeo","MacBookAir16plata"),"MorfeoMBA16");
assert.equal(id.scoped("Smith","MacBookAirAzul"),"SmithMBAAzul");
assert.equal(id.scoped("Smith","MacBookAirAzul","sub"),"SubSmithMBAAzul");
assert.equal(id.scoped("Agente Smith Azul",""),"SmithMBAAzul");
assert.equal(id.scoped("NeoAzul",""),"NeoMBAAzul");
assert.equal(id.reportDisplay("NeoAzul","MacBookAirAzul"),"NeoMBAAzul");
assert.equal(id.reportDisplay("Oraculo","Mac Mini"),"OraculoMini");
assert.equal(id.base("InfraOraculoMacMini"),"Oraculo");
assert.equal(id.base("InfraOraculoMini"),"Oraculo");
assert.equal(id.base("subOraculo"),"Oraculo");
assert.equal(id.base("Cypher"),"Smith");
assert.equal(id.suffix(""),"");
assert.equal(id.suffix("equipo-desconocido"),"");
assert.equal(id.scoped("Oraculo",""),"Oraculo");
assert.equal(id.scoped("Oraculo","equipo-desconocido"),"Oraculo");
assert.equal(id.display("Oraculo",""),"OraculoSINMAQ");
assert.equal(id.parse("Neo16").suffix,"MBP16");
assert.equal(id.parse("MorfeoAir16").suffix,"MBA16");
assert.equal(id.canonicalMachine("InfraMorfeo16"),"MacBook Pro 16");
assert.deepEqual(id.missionPair("Morfeo","MacBook Pro 16",[]),{
  agent:"MorfeoMBP16",machine:"MacBook Pro 16"
});

const status = readFileSync(new URL("./status.html", import.meta.url), "utf8");
assert.doesNotMatch(status, /ORACULO_TRIAD_PRESENCE/);
assert.doesNotMatch(status, /_synthetic\s*:\s*true/);
assert.match(status, /Las capas se muestran únicamente cuando existe presencia real/);
console.log("yk agent identity matrix: ok");
