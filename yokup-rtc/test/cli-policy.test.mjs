import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {CLI_POLICY,cliPolicyBlocked,cliPolicyFor} from '../src/cli-policy.js';
import {reportAgentFamily} from '../src/agent-identity.js';
import {dispatchAgentStart} from '../src/fleet-agent-stop.js';
import {automationPermission,automationFenceSql,activateAutomationTargets} from '../src/fleet-automation-control.js';
import {evaluateModeOpportunity,saveAgentMode} from '../src/fleet-hourly-modes.js';
const target={persona:'Oraculo',agent:'OraculoMacMini',machine:'MacMini',runtime:'Codex',host:'cli',session_id:'oraculo'};
test('CLI policy survives fresh module instances; APP and ordinary shell are not inferred as CLI',()=>{
 assert.equal(CLI_POLICY.cli_paused,true);assert.equal(cliPolicyBlocked(target),true);
 assert.equal(cliPolicyBlocked({...target,host:'app'}),false);
 assert.equal(cliPolicyBlocked({runtime:'Codex'}),false);
 assert.equal(cliPolicyFor(target).start_allowed,false);
});
test('CLI start cannot reach transport, APP exact does and unknown host cannot bypass',async()=>{
 const requests=[],env={TELEGRAM:{fetch:async req=>{requests.push(await req.json());return Response.json({command_id:'1',status:'queued'});}}};
 await assert.rejects(dispatchAgentStart(env,target),/cli_paused_by_carlos/);assert.equal(requests.length,0);
 await assert.rejects(dispatchAgentStart(env,{...target,host:''}),/invalid-host/);assert.equal(requests.length,0);
 await dispatchAgentStart(env,{...target,host:'app',session_id:'desktop:codex'});assert.equal(requests.length,1);assert.equal(requests[0].host,'app');
});
test('mode activation and execution cannot enable CLI even with saved preferences and fresh telemetry',async()=>{
 assert.equal(evaluateModeOpportunity({...target,mode:'training'},{},{},Date.now()).reason,CLI_POLICY.reason);
 assert.equal(evaluateModeOpportunity({...target,mode:'manual'}).reason,'manual');
 await assert.rejects(saveAgentMode({}, {...target,mode:'learning'},'Carlos',()=>{throw Error('should not resolve project');}),/cli_paused_by_carlos/);
 await assert.rejects(activateAutomationTargets({},'learning',[{target}],[],0,'Carlos'),/cli_paused_by_carlos/);
 assert.equal(automationPermission([],'learning','oraculo|macmini|codex|cli').allowed,false);
 assert.equal(automationPermission([],'learning','oraculo|macmini|codex|app').allowed,true);
});
test('SQL publication fence rejects old CLI jobs atomically and keeps APP job semantics',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE fleet_automation_controls(scope TEXT,enabled INTEGER,cutoff INTEGER);CREATE TABLE jobs(mode TEXT,identity_key TEXT,created_at INTEGER);');
 db.prepare('INSERT INTO jobs SELECT ?,?,? WHERE '+automationFenceSql('?','?','?')).run('learning','a|cli',100,'a|cli','learning','learning','a|cli',100);
 assert.equal(db.prepare('SELECT count(*) n FROM jobs').get().n,0);
 db.prepare('INSERT INTO jobs SELECT ?,?,? WHERE '+automationFenceSql('?','?','?')).run('learning','a|app',100,'a|app','learning','learning','a|app',100);
 assert.equal(db.prepare('SELECT count(*) n FROM jobs').get().n,1);
});
test('automatic OnIdle requires unique fresh verified APP from source; CLI-only and ambiguity are blocked',async()=>{
 const src=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 const fn=src.match(/async function onIdleAppPolicy\([^]*?\n}\n__name\(onIdleAppPolicy, "onIdleAppPolicy"\);/)[0];
 let rows=[];const ctx=vm.createContext({CLI_POLICY,cliPolicyBlocked,reportAgentFamily,Date,__name:()=>{},highscoreVerifiedPresence:async()=>({process_targets:new Map(rows.map((row,i)=>[i,row]))})});vm.runInContext(fn,ctx);
 const id={agent:'OraculoMacMini',machine:'MacMini'}, app={family_key:'oraculo@macmini',host:'app',runtime:'Codex',session_id:'desktop:codex'};
 assert.equal((await ctx.onIdleAppPolicy({},id)).allowed,false);
 rows=[{...app,host:'cli'}];assert.equal((await ctx.onIdleAppPolicy({},id)).allowed,false);
 rows=[app];assert.equal((await ctx.onIdleAppPolicy({},id)).allowed,true);
 rows=[app,{...app,runtime:'Claude'}];assert.equal((await ctx.onIdleAppPolicy({},id)).reason,'ambiguous_app_surface');
 rows=[app];assert.equal((await ctx.onIdleAppPolicy({},{...id,host:'cli'})).reason,CLI_POLICY.reason);
});
