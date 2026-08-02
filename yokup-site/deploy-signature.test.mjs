import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {validateDeployIdentity,wranglerCommitArgs} from "./deploy-signature.mjs";
const deploy=await readFile(new URL("./deploy.mjs",import.meta.url),"utf8");

test("firma exige agente completo y máquina explícita",()=>{
  assert.throws(()=>validateDeployIdentity("","MacMini"),/Falta YOKUP_DEPLOY_AGENT/);
  assert.throws(()=>validateDeployIdentity("OraculoMini",""),/Falta YOKUP_DEPLOY_MACHINE/);
  assert.throws(()=>validateDeployIdentity("Oraculo","MacMini"),/apellido físico/);
  assert.throws(()=>validateDeployIdentity("AmpereMini","MacMini"),/runtime o identidad interna/);
  assert.throws(()=>validateDeployIdentity("PersonaInventadaMini","MacMini"),/identidad operativa conocida/);
  assert.throws(()=>validateDeployIdentity("OraculoMini\nengaño","MacMini"),/control/);
  assert.throws(()=>validateDeployIdentity("Oraculo"+"x".repeat(100),"MacMini"),/supera 80/);
});

test("Oraculo, Smith, Sub e Infra firman con equipo canónico",()=>{
  assert.deepEqual(validateDeployIdentity("OraculoMini","MacMini"),{deployer:"OraculoMini",machine:"MacMini",signature:"OraculoMini · MacMini"});
  assert.deepEqual(validateDeployIdentity("SmithMini","Mac Mini"),{deployer:"SmithMini",machine:"MacMini",signature:"SmithMini · MacMini"});
  assert.equal(validateDeployIdentity("SubOraculoMini","admira-macmini").signature,"SubOraculoMini · MacMini");
  assert.equal(validateDeployIdentity("InfraMorfeoMBP16","MacBook Pro 16").signature,"InfraMorfeoMBP16 · MacBookPro16");
  assert.throws(()=>validateDeployIdentity("OraculoMini","MacBook Pro 16"),/no coincide/);
  assert.equal(validateDeployIdentity("Agente Smith Azul","MacBookAirAzul").signature,"Agente Smith Azul · MacBookAirAzul");
  assert.equal(validateDeployIdentity("SubAgente Smith Azul","MacBook Air Azul").deployer,"SubAgente Smith Azul");
  assert.equal(validateDeployIdentity("InfraAgente Smith Azul","MBA Azul").deployer,"InfraAgente Smith Azul");
  assert.equal(validateDeployIdentity("SmithAzul","MacBookAirAzul").deployer,"Agente Smith Azul");
  assert.throws(()=>validateDeployIdentity("Agente Smith Azul","MacMini"),/no coincide/);
});

test("Wrangler recibe hash y mensaje firmados sin shell",()=>{
  const hash="a".repeat(40),args=wranglerCommitArgs({gitFull:hash,signature:"OraculoMini · MacMini",version:"v.03.08.2026.r1"});
  assert.deepEqual(args,["--commit-hash",hash,"--commit-message","Yokup v.03.08.2026.r1 · OraculoMini · MacMini"]);
  assert.match(deploy,/gitFull = execFileSync\("git", \["rev-parse", "HEAD"\]/);
  assert.match(deploy,/gitShort = execFileSync\("git", \["rev-parse", "--short", "HEAD"\]/);
  assert.match(deploy,/deployer,\s*machine,\s*signature,\s*git:gitShort,\s*gitShort,\s*gitFull,\s*dirty/s);
  assert.match(deploy,/wranglerCommitArgs\(\{ gitFull, signature, version:payload\.version \}\)/);
  assert.match(deploy,/\.\.\.commitArgs/);
});

test("staging excluye todos los helpers deploy pero publica version.json firmado",()=>{
  assert.match(deploy,/\/\^deploy\(\?:-\[a-z-\]\+\)\?\\\.\(\?:m\?js\)\$\/i\.test\(name\)/);
  assert.match(deploy,/cp\(sourceRoot, stagingPath, \{ recursive:true, filter:publicArtifactFilter \}\)/);
  assert.match(deploy,/writeFile\(join\(stagingPath, "version\.json"\), JSON\.stringify\(payload/);
  assert.match(deploy,/const payload = \{[\s\S]*deployer,[\s\S]*machine,[\s\S]*signature/);
});
