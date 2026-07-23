import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
await import("./yk-agent-identity.js");
const id = globalThis.ykAgentIdentity;

assert.equal(id.scoped("Oraculo","Mac Mini"),"OraculoMini");
assert.equal(id.scoped("Oraculo","Mac Mini","sub"),"SubOraculoMini");
assert.equal(id.scoped("Oraculo","Mac Mini","infra"),"InfraOraculoMini");
assert.equal(id.scoped("Neo","MacMini"),"NeoMini");
assert.equal(id.scoped("Morfeo","MacBookProNegro14"),"Morfeo14");
assert.equal(id.scoped("Morfeo","MacBookPro14","sub"),"SubMorfeo14");
assert.equal(id.scoped("Oraculo","MacBookPro16"),"Oraculo16");
assert.equal(id.scoped("Oraculo","MacBookPro16","infra"),"InfraOraculo16");
assert.equal(id.scoped("Smith","MacBookAirAzul"),"Agente Smith Azul");
assert.equal(id.scoped("Smith","MacBookAirAzul","sub"),"SubAgente Smith Azul");
assert.equal(id.scoped("Smith","MacBookAirAzul","infra"),"InfraAgente Smith Azul");
assert.equal(id.base("InfraOraculoMini"),"Oraculo");
assert.equal(id.base("subOraculo"),"Oraculo");
assert.equal(id.base("Cypher"),"Smith");
assert.equal(id.suffix(""),"");
assert.equal(id.suffix("equipo-desconocido"),"");
assert.equal(id.scoped("Oraculo",""),"Oraculo");
assert.equal(id.scoped("Oraculo","equipo-desconocido"),"Oraculo");

const status = readFileSync(new URL("./status.html", import.meta.url), "utf8");
assert.doesNotMatch(status, /ORACULO_TRIAD_PRESENCE/);
assert.doesNotMatch(status, /_synthetic\s*:\s*true/);
assert.match(status, /Las capas se muestran únicamente cuando existe presencia real/);
console.log("yk agent identity matrix: ok");
