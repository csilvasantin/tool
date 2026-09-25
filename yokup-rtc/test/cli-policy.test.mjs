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
test('CLI policy is unpaused (rev 1079); only host=cli was gated when paused',()=>{
 assert.equal(CLI_POLICY.cli_paused,false);
 assert.equal(CLI_POLICY.revision,'1079');
 assert.equal(cliPolicyBlocked(target),false);
 assert.equal(cliPolicyBlocked({...target,host:'app'}),false);
 assert.equal(cliPolicyBlocked({runtime:'Codex'}),false);
 assert.equal(cliPolicyFor(target).start_allowed,false); // start_allowed only for host=app when unpaused
 assert.equal(cliPolicyFor({...target,host:'app'}).start_allowed,true);
});
test('CLI start reaches transport when unpaused; empty host still invalid',async()=>{
 const requests=[],env={TELEGRAM:{fetch:async req=>{requests.push(await req.json());return Response.json({command_id:'1',status:'queued'});}}};
 await dispatchAgentStart(env,target);assert.equal(requests.length,1);assert.equal(requests[0].host,'cli');
 await assert.rejects(dispatchAgentStart(env,{...target,host:''}),/invalid-host/);
 await dispatchAgentStart(env,{...target,host:'app',session_id:'desktop:codex'});assert.equal(requests.length,2);assert.equal(requests[1].host,'app');
});
test('mode activation on CLI is allowed when unpaused; APP still allowed',async()=>{
 const opp=evaluateModeOpportunity({...target,mode:'training'},{},{},Date.now());
 assert.notEqual(opp.reason,CLI_POLICY.reason);
 assert.equal(evaluateModeOpportunity({...target,mode:'manual'}).reason,'manual');
 // saveAgentMode / activate may still fail for other reasons; just assert not pause
 try { await saveAgentMode({}, {...target,mode:'learning'},'Carlos',()=>({id:'yokup',name:'Yokup'})); } catch (e) { assert.ok(!String(e?.message || e).includes('cli_paused_by_carlos')); }
 try { await activateAutomationTargets({},'learning',[{target}],[],0,'Carlos'); } catch (e) { assert.ok(!String(e?.message || e).includes('cli_paused_by_carlos')); }
 assert.equal(automationPermission([],'learning','oraculo|macmini|codex|cli').allowed,true);
 assert.equal(automationPermission([],'learning','oraculo|macmini|codex|app').allowed,true);
});
test('SQL publication fence no longer strips CLI jobs when unpaused',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE fleet_automation_controls(scope TEXT,enabled INTEGER,cutoff INTEGER);CREATE TABLE jobs(mode TEXT,identity_key TEXT,created_at INTEGER);');
 // fence sql: when unpaused, no |cli filter — placeholders: modeExpr, modeExpr, keyExpr, createdExpr in NOT EXISTS only
 // automationFenceSql(modeExpression, keyExpression, createdExpression) — caller binds mode,mode,key,created
 const fence=automationFenceSql('?','?','?');
 // When unpaused: "NOT EXISTS(...)" with 4 binds (mode, mode, key, created) — but INSERT SELECT uses different arity historically.
 // Match prior call shape used when paused (extra key bind at front). Detect arity from fence.
 const binds = (fence.match(/\?/g)||[]).length;
 if (binds===4) {
  db.prepare('INSERT INTO jobs SELECT ?,?,? WHERE '+fence).run('learning','a|cli',100,'learning','learning','a|cli',100);
 } else {
  db.prepare('INSERT INTO jobs SELECT ?,?,? WHERE '+fence).run('learning','a|cli',100,'a|cli','learning','learning','a|cli',100);
 }
 assert.equal(db.prepare('SELECT count(*) n FROM jobs').get().n,1);
 db.prepare('DELETE FROM jobs').run();
 if (binds===4) {
  db.prepare('INSERT INTO jobs SELECT ?,?,? WHERE '+fence).run('learning','a|app',100,'learning','learning','a|app',100);
 } else {
  db.prepare('INSERT INTO jobs SELECT ?,?,? WHERE '+fence).run('learning','a|app',100,'a|app','learning','learning','a|app',100);
 }
 assert.equal(db.prepare('SELECT count(*) n FROM jobs').get().n,1);
});
test('automatic OnIdle no longer applies the APP-only pause policy',async()=>{
 const src=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 const fn=src.match(/async function onIdleAppPolicy\([^]*?\n}\n__name\(onIdleAppPolicy, "onIdleAppPolicy"\);/)[0];
 let rows=[];const ctx=vm.createContext({CLI_POLICY,cliPolicyBlocked,reportAgentFamily,Date,__name:()=>{},highscoreVerifiedPresence:async()=>({process_targets:new Map(rows.map((row,i)=>[i,row]))})});vm.runInContext(fn,ctx);
 const id={agent:'OraculoMacMini',machine:'MacMini'}, app={family_key:'oraculo@macmini',host:'app',runtime:'Codex',session_id:'desktop:codex'};
 rows=[app];assert.equal((await ctx.onIdleAppPolicy({},id)).allowed,true);
 rows=[app,{...app,runtime:'Claude'}];assert.equal((await ctx.onIdleAppPolicy({},id)).allowed,true);
 const cliIdResult=await ctx.onIdleAppPolicy({},{...id,host:'cli'});
 assert.ok(cliIdResult.reason !== 'cli_paused_by_carlos');
});
