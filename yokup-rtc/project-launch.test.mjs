import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {normalizeProjectLaunch,projectLaunchTarget} from "./src/project-launch.js";

const source=await readFile(new URL("./src/index.js",import.meta.url),"utf8");

test("normaliza las tres Desktop Apps y los tres modelos CLI sin confundir plataforma y modelo",()=>{
  for(const runtime of ["Claude","Codex","OpenCode"]){
    const launch=normalizeProjectLaunch({project:"admira-tv",machine:"MacMini",persona:"Neo",runtime,host:"app",session_id:"desktop:"+runtime.toLowerCase(),selection:runtime,model:"modelo real"});
    assert.equal(launch.selection,runtime);assert.equal(launch.host,"app");
  }
  assert.equal(normalizeProjectLaunch({project:"admira-tv",machine:"MacMini",persona:"Smith",runtime:"Grok",host:"cli",session_id:"smith",selection:"Grok"}).selection,"Grok");
  assert.equal(normalizeProjectLaunch({project:"admira-tv",machine:"MacMini",persona:"Niobe",runtime:"OpenCode",host:"cli",session_id:"niobe",selection:"Nemotron"}).selection,"Nemotron");
  assert.equal(normalizeProjectLaunch({project:"admira-tv",machine:"MacMini",persona:"Niobe",runtime:"OpenCode",host:"cli",session_id:"niobe",selection:"Qwen",model:"Qwen 3 Coder"}).selection,"Qwen");
});

test("Qwen no se finge cuando OpenCode sólo demuestra Nemotron",()=>{
  assert.throws(()=>normalizeProjectLaunch({project:"admira-tv",machine:"MacMini",persona:"Niobe",runtime:"OpenCode",host:"cli",session_id:"niobe",selection:"Qwen",model:"Nemotron 3 Ultra"}),/qwen-not-provisioned/);
});

test("el target remoto contiene sólo la identidad arrancable",()=>{
  const launch=normalizeProjectLaunch({project:"admira-tv",machine:"MacMini",persona:"Smith",runtime:"Grok",host:"cli",session_id:"smith",selection:"Grok"});
  assert.deepEqual(projectLaunchTarget(launch),{machine:"MacMini",persona:"Smith",runtime:"Grok",host:"cli",session_id:"smith"});
});

test("la ruta exige login, asociación física, persiste selección y despacha idempotente",()=>{
  assert.match(source,/url\.pathname === "\/projects\/launch"/);
  assert.match(source,/const sess = await requireAuth\(env, req\)/);
  assert.match(source,/code:"team_not_assigned"/);
  assert.match(source,/dispatchAgentStart\(env, projectLaunchTarget\(launch\)\)/);
  assert.match(source,/CREATE TABLE IF NOT EXISTS project_launch_assignments/);
  assert.match(source,/ON CONFLICT\(project_id,machine\) DO UPDATE/);
  assert.match(source,/const launchIdentity = principalAgentIdentity\(launch\.persona, launch\.machine\)/);
  assert.match(source,/const principal = await declarePrincipalProject\(env/);
  assert.match(source,/principal_declaration:principal\.declaration/);
  assert.match(source,/launches: launchRows\.filter/);
});
