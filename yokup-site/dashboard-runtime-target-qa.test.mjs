import test from 'node:test';
import assert from 'node:assert/strict';
import control from './agent-control.js';
import identity from './yk-agent-identity.js';
const now=1788584807000;
const slot=runtime=>({persona:'Niobe',runtime,host:'app',session_id:'desktop:'+runtime.toLowerCase()});
function model(presence=[],slots=[slot('Codex'),slot('OpenCode')]){return control.inventory({presence,controlMachines:[{machine:'MacMini',updated:now/1000,slots}]},{identity,now});}
const live=runtime=>({persona:'Niobe',machine:'MacMini',runtime,host:'app',session_id:'desktop:'+runtime.toLowerCase(),pid:runtime==='Codex'?101:202,updated:now/1000,source:'process_snapshot',verified:1});
test('two closed Niobe runtimes form one card but require an exact destination before any command',()=>{
 const m=model(),grouped=control.groupCards(m.items,{identity}),card=grouped.items[0];assert.equal(grouped.items.length,1);assert.equal(card.runtime_targets.length,2);assert.equal(card.process_state,'closed');assert.equal(card.runtime_selection_required,true);assert.equal(control.selectedCardTarget(card),null);assert.equal(control.selectedCardTarget(card,'bogus'),null);assert.equal(card.eligible.start,false);assert.equal(card.eligible.stop,false);
 assert.equal(control.batchPlan(m,'app','start').count,0);
 const opencode=m.items.find(r=>r.runtime==='OpenCode'),selections=new Map([[card.card_key,opencode.identity_key]]),target=control.selectedCardTarget(card,opencode.identity_key);assert.equal(target.control_key,opencode.control_key);
 const plan=control.batchPlan(m,'app','start',{selections});assert.equal(plan.count,1);const request=control.requestFor(m,plan.targets[0],'start');assert.equal(request.body.runtime,'OpenCode');assert.equal(request.body.session_id,'desktop:opencode');assert.equal(request.body.persona,'Niobe');assert.equal(request.body.host,'app');
});
test('multiple open processes never allow a batch to stop the unselected runtime',()=>{
 const m=model([live('Codex'),live('OpenCode')]),card=control.groupCards(m.items,{identity}).items[0];assert.equal(card.process_state,'open');assert.equal(control.batchPlan(m,'app','stop').count,0);
 const codex=m.items.find(r=>r.runtime==='Codex'),selections=new Map([[card.card_key,codex.identity_key]]),plan=control.batchPlan(m,'app','stop',{selections});assert.equal(plan.count,1);const request=control.requestFor(m,plan.targets[0],'stop');assert.equal(request.body.runtime,'Codex');assert.equal(request.body.pid,101);assert.notEqual(request.body.pid,202);
});
test('a closed and unobserved runtime aggregate as unavailable, and opening one establishes Open only',()=>{
 const m=model(),rows=m.items.map((r,i)=>({...r,process_state:i?'unknown':'closed'}));assert.equal(control.groupCards(rows,{identity}).items[0].process_state,'unknown');rows[0].process_state='open';assert.equal(control.groupCards(rows,{identity}).items[0].process_state,'open');assert.equal(rows[1].process_state,'unknown');
});
test('card grouping separates other physical machines and CLI without losing original destinations',()=>{
 const m=model(),rows=[...m.items,{...m.items[0],machine:'MacBookProNegro14',machine_key:'mbp14',agent:'NiobeMBP14',identity_key:'niobe14',control_key:'niobe14'},{...m.items[1],surface:'cli',host:'cli',identity_key:'niobecli',control_key:'niobecli'}];
 const result=control.groupCards(rows,{identity});assert.equal(result.items.length,3);assert.equal(result.items.flatMap(r=>r.runtime_targets).length,4);assert.equal(new Set(result.items.map(r=>r.card_key)).size,3);
});
test('two configured sessions of the same runtime remain ambiguous and unlaunchable',()=>{
 const m=model([],[{persona:'Niobe',runtime:'OpenCode',host:'cli',session_id:'niobe-a'},{persona:'Niobe',runtime:'OpenCode',host:'cli',session_id:'niobe-b'}]),card=control.groupCards(m.items,{identity}).items[0];assert.equal(m.items.length,1);assert.equal(m.items[0].state,'ambiguous');assert.equal(card.eligible.start,false);assert.equal(control.batchPlan(m,'cli','start').count,0);
});
