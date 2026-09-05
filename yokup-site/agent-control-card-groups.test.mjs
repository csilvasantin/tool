import test from 'node:test';
import assert from 'node:assert/strict';
import control from './agent-control.js';
import identity from './yk-agent-identity.js';
import detail from './agent-detail.js';
const now=1788584807;
const slots=[{persona:'Niobe',runtime:'Codex',host:'app',session_id:'desktop:codex'},{persona:'Niobe',runtime:'OpenCode',host:'app',session_id:'desktop:opencode'},{persona:'Niobe',runtime:'OpenCode',host:'cli',session_id:'niobe'}];
const build=(presence=[],configured=slots)=>control.inventory({presence,controlMachines:[{machine:'MacMini',updated:now,slots:configured}]},{identity,detailUrl:detail.detailUrl,now});
const live=(runtime,host='app')=>({persona:'Niobe',machine:'MacMini',runtime,host,session_id:host==='app'?'desktop:'+runtime.toLowerCase():'niobe',pid:72,updated:now,verified:1,source:'process_snapshot'});

test('Niobe conserva CLI real y una tarjeta App con dos destinos cerrados sin acción implícita',()=>{
 const model=build([live('OpenCode','cli')]),cards=control.groupCards(model.items,{identity});
 assert.equal(cards.items.length,2);assert.equal(cards.counts.open,1);assert.equal(cards.counts.closed,1);assert.equal(cards.counts.runtime_targets,3);
 const app=cards.items.find(c=>c.surface==='app'),cli=cards.items.find(c=>c.surface==='cli');
 assert.equal(app.runtime_selection_required,true);assert.equal(app.process_state,'closed');assert.equal(app.control_key,'');assert.equal(app.runtime,'');
 assert.deepEqual(app.eligible,{start:false,stop:false});assert.equal(control.selectedCardTarget(app),null);
 assert.equal(cli.runtime_targets.length,1);assert.equal(control.selectedCardTarget(cli).eligible.stop,true);
 assert.equal(control.batchPlan(model,'app','start',{identity}).count,0);
 assert.equal(control.batchPlan(model,'app','start',{identity}).skipped_ambiguous,1);
 assert.throws(()=>control.requestFor(model,app.control_key,'start'),/target-not-found/);
});

test('selección explícita conserva payload exacto y batch nunca arranca ambos runtimes',()=>{
 const model=build(),app=control.groupCards(model.items,{identity}).items.find(c=>c.surface==='app');
 for(const runtime of ['Codex','OpenCode']){
   const original=app.runtime_targets.find(row=>row.runtime===runtime),selected=control.selectedCardTarget(app,original.identity_key);
   assert.equal(selected,original);assert.equal(control.requestFor(model,selected.control_key,'start').body.runtime,runtime);
   assert.equal(control.requestFor(model,selected.control_key,'start').body.session_id,'desktop:'+runtime.toLowerCase());
   const plan=control.batchPlan(model,'app','start',{identity,selections:new Map([[app.card_key,selected.identity_key]])});
   assert.deepEqual(plan.targets,[selected.control_key]);
 }
 assert.equal(control.selectedCardTarget(app,'stale-or-other-identity'),null);
});

test('estado agregado exige evidencia: abierto cualquiera, cerrado todos, unknown si falta señal',()=>{
 const variants=build().items.filter(row=>row.surface==='app');
 const state=(a,b)=>control.groupCards(variants.map((row,i)=>({...row,process_state:i?b:a})),{identity}).items[0].process_state;
 assert.equal(state('open','unknown'),'open');assert.equal(state('waiting','closed'),'waiting');
 assert.equal(state('closed','unknown'),'unknown');assert.equal(state('closed','closed'),'closed');
 assert.equal(state('unknown','unknown'),'unknown');
});

test('mismo runtime vivo y cerrado siguen siendo destinos distintos; agrupación no altera originales',()=>{
 const model=build([live('Codex')]),before=JSON.stringify(model.items),app=control.groupCards(model.items,{identity}).items.find(c=>c.surface==='app');
 assert.equal(app.process_state,'open');assert.equal(app.runtime_selection_required,true);assert.equal(app.runtime,'');
 assert.equal(control.selectedCardTarget(app),null);assert.equal(JSON.stringify(model.items),before);
 assert.equal(app.runtime_targets.find(row=>row.runtime==='Codex').eligible.stop,true);
 assert.equal(app.runtime_targets.find(row=>row.runtime==='OpenCode').eligible.start,true);
 assert.equal(JSON.stringify(app).includes('session_id'),false);assert.equal(JSON.stringify(app).includes('"pid"'),false);
});

test('alias físicos se reúnen, otra persona/equipo/interfaz no se fusiona',()=>{
 const row=build().items.find(item=>item.runtime==='Codex'&&item.surface==='app');
 const rows=[row,{...row,runtime:'OpenCode',identity_key:'other-runtime',agent:'NiobeMini',machine:'admira-macmini'},
   {...row,agent:'TrinityMacMini',persona:'Trinity',family_key:'trinity',identity_key:'trinity'},
   {...row,agent:'NiobeMBP14',machine:'MacBookProNegro14',machine_key:'mbp14',identity_key:'other-machine'},
   {...row,surface:'unknown',identity_key:'unknown-surface'}];
 const cards=control.groupCards(rows,{identity});assert.equal(cards.items.length,4);
 assert.equal(cards.items.find(c=>c.runtime_targets.length===2).runtime_targets.length,2);
});

test('perder selección exige nueva elección incluso cuando solo queda otro runtime y tampoco bulk lo sortea',()=>{
 const model=build([],slots.filter(row=>row.runtime==='OpenCode'&&row.host==='app')),
   card=control.groupCards(model.items,{identity}).items[0],required=new Set([card.card_key]);
 assert.equal(card.runtime_targets.length,1);
 assert.equal(control.selectedCardTarget({...card,runtime_selection_required:true}),null);
 const plan=control.batchPlan(model,'app','start',{identity,requireSelections:required});
 assert.equal(plan.count,0);assert.equal(plan.skipped_ambiguous,1);
 const target=card.runtime_targets[0],selections=new Map([[card.card_key,target.identity_key]]);
 assert.equal(control.batchPlan(model,'app','start',{identity,requireSelections:required,selections}).count,1);
});
