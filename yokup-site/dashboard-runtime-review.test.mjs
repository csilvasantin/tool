import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import control from './agent-control.js';
import identity from './yk-agent-identity.js';
import groups from './presence-groups.js';
const source=await readFile(new URL('./dashboard.html',import.meta.url),'utf8'),now=1788584807;
const slots=['Codex','OpenCode'].map(runtime=>({persona:'Niobe',runtime,host:'app',session_id:'desktop:'+runtime.toLowerCase()}));
const model=rows=>control.inventory({presence:[],controlMachines:[{machine:'MacMini',updated:now,slots:rows}]},{identity,now});
function setup(){
 const requests=[],context={Map,Set,window:{YkAgentControl:control,YkPresenceGroups:groups,ykAgentIdentity:identity},YkAgentControl:control,YkPresenceGroups:groups,
 esc:v=>String(v??''),localStorage:{getItem:()=>null,setItem:()=>{}},document:{getElementById:()=>null,querySelector:()=>null},paPaint(){},paTickAgo(){},requests};
 vm.runInNewContext(source.slice(source.indexOf('const PULSE_VIEW_KEY='),source.indexOf('async function pulse(renderMap='))+`
 pulseModesRequest=async options=>{const item=JSON.parse(options.body);requests.push(item);return {ok:true,item};};
 this.api={set(model){PULSE_CONTROL_MODEL=model;PULSE_GROUPS=pulseControlledGroups(null,model);PULSE_MODE_LOADED=true;PULSE_MODE_ERROR=false;return PULSE_GROUPS;},select:pulseSelectRuntime,selected(){return [...PULSE_RUNTIME_SELECTIONS];},card:pulseCard,mode:pulseHandleMode,counts:pulseFilterCounts,items:pulseFilterItems};`,context);
 return {api:context.api,requests};
}
test('poll removes runtime selection permanently when its exact target disappears',()=>{
 const {api}=setup();let result=api.set(model(slots)),card=result.by_key.app.items[0],codex=card.runtime_targets.find(row=>row.runtime==='Codex');
 api.select(encodeURIComponent(card.card_key),encodeURIComponent(codex.identity_key));assert.equal(api.selected().length,1);
 api.set(model([slots[1]]));assert.equal(api.selected().length,0);
 result=api.set(model(slots));card=result.by_key.app.items[0];assert.equal(api.selected().length,0);assert.match(api.card(card),/Selecciona una aplicación/);assert.doesNotMatch(api.card(card),/data-pulse-mode=/);
});
test('selected runtime mode payload stays exact while filters count the aggregated card once',async()=>{
 const {api,requests}=setup(),result=api.set(model(slots)),card=result.by_key.app.items[0],target=card.runtime_targets.find(row=>row.runtime==='OpenCode');
 assert.equal(api.counts(result.by_key.app.items).all,1);assert.equal(api.items(result.by_key.app.items,'closed').length,1);
 api.select(encodeURIComponent(card.card_key),encodeURIComponent(target.identity_key));
 assert.match(api.card(card),/Los controles y el modo corresponden a la aplicación elegida/);
 const select={dataset:{pulseMode:target.control_key},value:'learning'};
 await api.mode({target:{closest:selector=>selector==='select[data-pulse-mode]'?select:null}});
 assert.deepEqual(JSON.parse(JSON.stringify(requests)),[{persona:'Niobe',machine:'MacMini',runtime:'OpenCode',host:'app',mode:'learning'}]);
});

test('desaparición de la ficha completa no autoriza otro runtime al reaparecer',()=>{
 const {api}=setup();let result=api.set(model(slots)),card=result.by_key.app.items[0],target=card.runtime_targets.find(row=>row.runtime==='Codex');
 api.select(encodeURIComponent(card.card_key),encodeURIComponent(target.identity_key));
 api.set(model([]));assert.equal(api.selected().length,0);
 result=api.set(model([slots[1]]));card=result.by_key.app.items[0];
 assert.equal(card.runtime_selection_required,true);assert.doesNotMatch(api.card(card),/data-pulse-mode=/);assert.equal(card.eligible.start,false);
});
