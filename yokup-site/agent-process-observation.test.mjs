import test from 'node:test';
import assert from 'node:assert/strict';
import control from './agent-control.js';
import identity from './yk-agent-identity.js';
const now=10000, slot={persona:'Morfeo',runtime:'Claude',host:'app',session_id:'desktop:claude'};
const live={...slot,machine:'MacMini',pid:42,updated:now-2,verified:1,source:'process_snapshot',online:true};
const inventory=(presence=[],machine={machine:'MacMini',slots:[slot]})=>control.inventory({presence,controlMachines:[machine]},{identity,now}).items[0];
test('fresh real process is open, explicit idle becomes waiting and manual does not invent wait',()=>{
 assert.equal(inventory([live]).process_state,'open');
 assert.equal(inventory([{...live,status:'waiting'}]).process_state,'waiting');
 assert.equal(inventory([{...live,mode:'learning'}]).process_state,'open');
});
test('fresh watcher absence proves closed even against old unverified heartbeat',()=>{
 const result=inventory([{...live,verified:0,source:'heartbeat',updated:now-100}],{machine:'MacMini',updated:now-1,slots:[slot]});
 assert.equal(result.process_state,'closed');assert.equal(result.observation_reason,'watcher-no-process');
});
test('missing or stale watcher and stale process prove neither open nor closed',()=>{
 assert.equal(inventory([]).process_state,'unknown');
 assert.equal(inventory([],{machine:'MacMini',updated:now-40,slots:[slot]}).process_state,'unknown');
 assert.equal(inventory([{...live,updated:now-40}]).process_state,'unknown');
});
test('process proof without controllable session remains open but cannot stop',()=>{
 const result=control.inventory({presence:[{...live,session_id:''}],controlMachines:[]},{identity,now}).items[0];
 assert.equal(result.process_state,'open');assert.equal(result.eligible.stop,false);
});
