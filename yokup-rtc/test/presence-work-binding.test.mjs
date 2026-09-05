import { CLI_POLICY, cliPolicyBlocked } from '../src/cli-policy.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const code=source.match(/async function bindPresenceWork\([^]*?\n}\n__name\(bindPresenceWork, "bindPresenceWork"\);/)[0];
const ctx=vm.createContext({CLI_POLICY,cliPolicyBlocked,Request,__name:()=>{}});vm.runInContext(code,ctx);
const bind=ctx.bindPresenceWork;
const plain=value=>JSON.parse(JSON.stringify(value));
const target=['MorfeoMacMini','admira-macmini','FLT-TEST'];
function transport(body,status=200){const calls=[];return {calls,env:{TELEGRAM:{fetch:async req=>{calls.push(await req.json());return {ok:status<300,json:async()=>body};}}}};}

test('sesión exacta transmite identidad canónica y selector indivisible',async()=>{
 const t=transport({ok:true,bound:true});
 assert.deepEqual(plain(await bind(t.env,...target,{runtime:'Claude',host:'app',session_id:'desktop:claude',persona:'Other'})),{bound:true,reason:'bound'});
 assert.deepEqual(t.calls,[{persona:target[0],machine:target[1],work_ref:target[2],runtime:'Claude',host:'app',session_id:'desktop:claude'}]);
});
test('APP y CLI ambiguas se informan sin seleccionar la primera',async()=>{
 const t=transport({ok:false,error:'ambiguous_session'},409);
 assert.deepEqual(plain(await bind(t.env,...target)),{bound:false,reason:'ambiguous_session'});
 assert.deepEqual(t.calls,[{persona:target[0],machine:target[1],work_ref:target[2]}]);
});
test('selector parcial, desconocido o malformado no hace petición',async()=>{
 for(const selector of [{},{runtime:'Claude',host:'app'},{host:'app',session_id:'desktop:claude'},
  {runtime:'Claude',host:'desktop',session_id:'desktop:claude'},[], 'app',
  {runtime:'Claude',host:'app',session_id:'bad\nselector'}]){
  const t=transport({ok:true,bound:true});
  assert.equal((await bind(t.env,...target,selector)).reason,'invalid_session_selector');assert.equal(t.calls.length,0);
 }
});
test('HTTP ok sin bound no declara enlace; errores no exponen detalles privados',async()=>{
 for(const [body,status,reason] of [[{ok:true},200,'binding_unavailable'],[{ok:false,error:'session_not_found'},409,'session_not_found'],[{error:'private stack or token'},500,'binding_unavailable']]){
  const t=transport(body,status);assert.deepEqual(plain(await bind(t.env,...target)),{bound:false,reason});
 }
 assert.equal((await bind({},...target)).reason,'service_unavailable');
 const env={TELEGRAM:{fetch:async()=>{throw Error('private transport');}}};
 assert.equal((await bind(env,...target)).reason,'binding_unavailable');
});
test('progress y task-status exponen fallo de enlace sin convertirlo en fallo del trabajo',()=>{
 assert.match(source,/const workBinding = await bindPresenceWork\(env, actor.actor \|\| t.assignee, t.loc, mid, b.work_session\)/);
 assert.match(source,/ok: true, mission: mid, work_binding:workBinding, work_activity:workActivity, evidence_updated/);
 assert.match(source,/row.work_binding = await bindPresenceWork\(env, row.executor \|\| row.owner/);
});
