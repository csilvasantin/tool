import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import groups from './presence-groups.js';
import identity from './yk-agent-identity.js';
const source=await readFile(new URL('./dashboard.html',import.meta.url),'utf8');
const key='yk.dashboard.deepagents.group-process-filters.v1';
const viewKey='yk.dashboard.silicon-fleet.view.v1';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function setup(saved={}){
 const store=new Map(Object.entries(saved)),section={open:false},box={},http=[];
 const context={window:{YkPresenceGroups:groups,ykAgentIdentity:identity},YkPresenceGroups:groups,esc:escape,
 localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},document:{getElementById:id=>id==='pulseSection'?section:box,querySelector:()=>null},paPaint(){},paTickAgo(){},fetch:(...args)=>{http.push(args);throw new Error('filters must not call network');}};
 const start=source.indexOf('const PULSE_VIEW_KEY='),end=source.indexOf('async function pulse(renderMap=',start);
 vm.runInNewContext(source.slice(start,end)+`this.api={read:pulseReadGroupFilters,current:pulseGroupFilter,consensus:pulseFilterConsensus,apply:pulseApplyFilter,items:pulseFilterItems,counts:pulseFilterCounts,click:pulseHandleClick,markup:pulseGroupsMarkup,configure(items){PULSE_GROUPS=pulseControlledGroups(null,{items});}};`,context);
 return {api:context.api,store,section,http};
}
const row=(name,state,surface='cli')=>({agent:name,persona:name,machine:'MacMini',runtime:'Claude',surface,host:surface,identity_key:name+'|'+surface,control_key:name+'|'+surface,state:'unknown',process_state:state});
const plain=x=>JSON.parse(JSON.stringify(x));
test('new and legacy-global profiles default independently to Open without rewriting view preferences',()=>{
 const view=JSON.stringify({cli:{hidden:true,compact:false},app:{hidden:false,compact:true}});
 for(const saved of [{},{'yk.dashboard.deepagents.process-filter.v1':'all'},{'yk.dashboard.deepagents.process-filter.v1':'closed'}]){
  const s=setup({...saved,[viewKey]:view});assert.deepEqual(plain(s.api.read()),{cli:'open',app:'open',unknown:'open'});assert.equal(s.api.consensus(),'open');assert.equal(s.store.get(viewKey),view);assert.equal(s.store.has(key),false);
 }
});
test('group preferences round-trip independently, invalid values fail to Open, global selection synchronizes',()=>{
 const s=setup({[key]:JSON.stringify({cli:'all',app:'closed',unknown:'invalid'})});
 assert.deepEqual(plain(s.api.read()),{cli:'all',app:'closed',unknown:'open'});assert.equal(s.api.consensus(),null);
 s.api.apply('unknown','cli');assert.equal(s.api.current('cli'),'unknown');assert.equal(s.api.current('app'),'closed');
 const restored=setup(Object.fromEntries(s.store));assert.equal(restored.api.current('cli'),'unknown');assert.equal(restored.api.current('app'),'closed');
 restored.api.apply('all');assert.equal(restored.api.consensus(),'all');assert.deepEqual(plain(restored.api.read()),{cli:'all',app:'all',unknown:'all'});assert.deepEqual(s.http,[]);
});
test('Total orders Open and Waiting before Closed and Unavailable without changing source rows',()=>{
 const s=setup(),rows=[row('Z','unknown'),row('B','closed'),row('C','waiting'),row('A','open'),row('D','unknown')],before=JSON.stringify(rows);
 const ordered=s.api.items(rows,'all');assert.deepEqual(Array.from(ordered,r=>r.agent),['A','C','B','D','Z']);assert.equal(JSON.stringify(rows),before);
 assert.deepEqual(plain(s.api.counts(rows)),{all:5,open:2,closed:1,unknown:2});assert.deepEqual(Array.from(s.api.items(rows,'open'),r=>r.agent),['A','C']);
 assert.equal(s.api.items(rows,'open').length+s.api.items(rows,'closed').length+s.api.items(rows,'unknown').length,rows.length);
});
test('independent filtering survives poll updates without HTTP or changes to saved visibility/density',()=>{
 const view=JSON.stringify({cli:{hidden:true,compact:false},app:{hidden:false,compact:true}}),s=setup({[viewKey]:view});
 s.api.configure([row('A','open'),row('B','closed'),row('C','open','app'),row('D','closed','app')]);
 s.api.apply('closed','cli');assert.equal(s.api.current('cli'),'closed');assert.equal(s.api.current('app'),'open');assert.equal(s.api.consensus(),null);
 s.api.configure([row('A','closed'),row('B','closed'),row('C','open','app')]);assert.equal(s.api.current('cli'),'closed');assert.equal(s.api.current('app'),'open');assert.equal(s.store.get(viewKey),view);assert.deepEqual(s.http,[]);assert.equal(s.section.open,true);
});
