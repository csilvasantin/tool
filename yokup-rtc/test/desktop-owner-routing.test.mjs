import test from 'node:test';
import assert from 'node:assert/strict';
import control from '../../yokup-site/agent-control.js';
import identity from '../../yokup-site/yk-agent-identity.js';
import {selectLiveAgentSession,dispatchAgentStop} from '../src/fleet-agent-stop.js';
const now=1788590000;
const app={persona:'Oraculo',machine:'MacMini',runtime:'Codex',host:'app',session_id:'desktop:codex',pid:123,updated:now,verified:1,source:'process_snapshot'};
const cli={...app,persona:'Trinity',host:'cli',session_id:'trinity',pid:456};
const input={presence:[app,cli],controlMachines:[{machine:'MacMini',updated:now,slots:[app,cli].map(({persona,runtime,host,session_id})=>({persona,runtime,host,session_id}))}]};
test('Dashboard control conserva APP Oraculo y CLI Trinity como destinos físicos separados',()=>{
 const model=control.inventory(input,{identity,now});const cards=control.groupCards(model.items,{identity}).items;
 assert.equal(cards.length,2);
 const desktop=cards.find(c=>c.surface==='app'),terminal=cards.find(c=>c.surface==='cli');
 assert.equal(desktop.agent,'OraculoMacMini');assert.equal(terminal.agent,'TrinityMacMini');
 const selected=control.selectedCardTarget(desktop),body=control.requestFor(model,selected.control_key,'stop').body;
 assert.deepEqual(body,{action:'stop',machine:'MacMini',persona:'Oraculo',runtime:'Codex',host:'app',session_id:'desktop:codex',pid:123});
 assert.equal(control.batchPlan(model,'app','stop',{identity}).count,1);
});
test('API nunca sustituye Oraculo Desktop por Trinity CLI ni acepta antiguo owner APP',async()=>{
 assert.equal(selectLiveAgentSession([app,cli],app,now),app);
 assert.throws(()=>selectLiveAgentSession([app,cli],{...app,persona:'Trinity'},now),/agent-offline-or-stale/);
 assert.throws(()=>selectLiveAgentSession([app,cli],{...app,pid:456},now),/agent-offline-or-stale/);
 const calls=[];const env={TELEGRAM:{fetch:async req=>{calls.push(req);return Response.json({ok:true,now,presence:[app,cli]});}}};
 await assert.rejects(dispatchAgentStop(env,{...app,persona:'Trinity'}),/agent-offline-or-stale/);
 assert.equal(calls.length,1,'stale owner rejected before enqueue');
});
