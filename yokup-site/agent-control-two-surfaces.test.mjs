import test from 'node:test';
import assert from 'node:assert/strict';
import control from './agent-control.js';
import identity from './yk-agent-identity.js';
const now=1788594900;
const slot=(host,runtime='Codex',persona='Trinity')=>({persona,runtime,host,session_id:host==='app'?'desktop:'+runtime.toLowerCase():persona.toLowerCase()});
const heartbeat=(persona='Trinity',runtime='Codex',machine='MacMini',host='')=>({persona,runtime,machine,host,updated:now,verified:0,source:'heartbeat'});
const model=(presence=[],slots=[],updated=now,machine='MacMini')=>control.inventory({presence,controlMachines:slots.length?[{machine,updated,slots}]:[]},{identity,now});

test('unknown legacy stays diagnostic and cannot create cards or a control target',()=>{
 const original=model([heartbeat(),heartbeat('Neo','Claude'),heartbeat('Smith','Grok')]),before=JSON.stringify(original.items);
 const view=control.surfaceInventory(original,{identity});assert.deepEqual(view.items,[]);assert.equal(view.counts.total,0);assert.equal(view.surface_diagnostics.unresolved,3);assert.equal(view.surface_diagnostics.linked,0);
 assert.equal(JSON.stringify(original.items),before);assert.equal(original.items.length,3);
 for(const item of original.items)assert.throws(()=>control.requestFor(view,item.control_key,'start'),/target-not-found/);
 for(const group of ['app','cli'])assert.equal(control.batchPlan(view,group,'start',{identity}).count,0);
});
test('unique explicit target links legacy aliases without copying metadata or adding an item',()=>{
 const original=model([heartbeat('SubTrinityMini','Codex','admira-macmini')],[slot('app')]);
 const view=control.surfaceInventory(original,{identity});assert.equal(view.items.length,1);assert.equal(view.items[0].surface,'app');assert.equal(view.surface_diagnostics.linked,1);assert.equal(view.surface_diagnostics.unresolved,0);assert.equal(view.surface_diagnostics.items[0].resolved_surface,'app');
 const known=original.items.find(x=>x.surface==='app');assert.equal(view.items[0],known);assert.equal(view.targets,original.targets);assert.equal(control.requestFor(view,known.control_key,'start').body.host,'app');assert.equal(view.items[0].model,undefined);
});
test('both known hosts remain separate and ambiguous legacy cannot select either',()=>{
 const original=model([heartbeat()],[slot('app'),slot('cli')]),view=control.surfaceInventory(original,{identity});
 assert.equal(view.items.length,2);assert.deepEqual(view.items.map(x=>x.surface).sort(),['app','cli']);assert.equal(view.surface_diagnostics.unresolved,1);assert.equal(view.surface_diagnostics.items[0].reason,'ambiguous-surface');assert.equal(view.surface_diagnostics.items[0].resolved_surface,null);
 assert.equal(control.groupCards(view.items,{identity}).items.length,2);assert.equal(view.counts.total,2);
 for(const item of view.items){const req=control.requestFor(view,item.control_key,'start');assert.equal(req.body.host,item.surface);assert.equal(req.body.session_id,item.surface==='app'?'desktop:codex':'trinity');}
});
test('stale configured hosts retain their cards as unavailable rather than disappear or become closed',()=>{
 const view=control.surfaceInventory(model([],[slot('app'),slot('cli')],now-500),{identity});assert.equal(view.items.length,2);assert.ok(view.items.every(x=>x.process_state==='unknown'));assert.equal(view.surface_diagnostics.total,0);
 const cards=control.groupCards(view.items,{identity});assert.equal(cards.counts.unknown,2);assert.equal(cards.counts.closed,0);
});
test('no inferred host from runtime, another machine, or another physical family',()=>{
 const cases=[heartbeat('Trinity','Grok'),heartbeat('Trinity','OpenCode'),heartbeat('Neo','Codex'),heartbeat('Trinity','Codex','MacBookProNegro14')];
 const view=control.surfaceInventory(model(cases,[slot('app')]),{identity});assert.equal(view.items.length,1);assert.equal(view.surface_diagnostics.unresolved,4);assert.equal(view.surface_diagnostics.linked,0);
 const declared=model([heartbeat('Smith','Grok','MacMini','app'),heartbeat('Smith','OpenCode')]);const exact=control.surfaceInventory(declared,{identity});assert.equal(exact.surface_diagnostics.linked,0,'Grok and OpenCode are different runtimes');
});
test('explicit host declaration is preserved without upgrading its process confidence',()=>{
 const original=model([heartbeat('Neo','Claude','MacMini','cli'),heartbeat('Neo','Claude')]),view=control.surfaceInventory(original,{identity});assert.equal(view.items.length,1);assert.equal(view.items[0].process_state,'unknown');assert.equal(view.items[0].eligible.stop,false);assert.equal(view.surface_diagnostics.linked,1);assert.equal(view.surface_diagnostics.items[0].resolved_surface,'cli');
});
