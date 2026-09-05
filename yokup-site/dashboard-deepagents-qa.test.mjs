import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('./dashboard.html',import.meta.url),'utf8');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function api(saved={}){
 const writes=[];const context={localStorage:{getItem:key=>saved[key]??null,setItem:(key,value)=>writes.push([key,value])},window:{},document:{getElementById:()=>null},esc:escape,paRuntimeSurface:row=>row.runtime||'',PROJECT_FILTER:'unrelated-global-project'};
 const start=source.indexOf('const PULSE_VIEW_KEY='),end=source.indexOf('function pulseRender()',start);
 vm.runInNewContext(source.slice(start,end)+'\nthis.api={pulseFilterBucket,pulseFilterCounts,pulseFilterItems,pulseFilterMarkup,pulseCard,pulseProjectLabel,pulseReadView,pulseReadGroupFilters,setFilter:v=>{PULSE_GROUP_KEYS.forEach(k=>PULSE_GROUP_FILTERS[k]=v);PULSE_FILTER=v;},project:r=>PULSE_MODES.set(pulseModeKey(r),r),view:()=>PULSE_VIEW};',context);
 return {...context.api,writes};
}
const rows=Array.from({length:33},(_,i)=>({agent:'Agent'+i,persona:'Agent'+i,machine:'MacMini',runtime:'Claude',surface:i%2?'cli':'app',process_state:i<7?'open':i===7?'waiting':i<11?'closed':'unknown'}));
test('33 inventory rows partition into 8 open, 3 closed and 22 without signal without overlap',()=>{
 const a=api(),counts=JSON.parse(JSON.stringify(a.pulseFilterCounts(rows)));
 assert.deepEqual(counts,{all:33,open:8,closed:3,unknown:22});
 const buckets=['open','closed','unknown'].flatMap(key=>a.pulseFilterItems(rows,key));
 assert.equal(new Set(buckets).size,33);assert.equal(buckets.length,33);
 assert.equal(a.pulseFilterBucket({process_state:'waiting'}),'open');
 for(const value of [undefined,'active','stopped','ambiguous','bogus'])assert.equal(a.pulseFilterBucket({process_state:value}),'unknown');
});
test('filter counts remain global when a segment is selected and preferences remain separate',()=>{
 const saved={'yk.dashboard.silicon-fleet.view.v1':JSON.stringify({cli:{compact:false,hidden:true},app:{compact:true,hidden:false}}),'yk.dashboard.deepagents.group-process-filters.v1':JSON.stringify({cli:'closed',app:'closed',unknown:'closed'})};
 const a=api(saved);assert.equal(a.pulseReadGroupFilters().cli,'closed');const before=JSON.stringify(a.view());
 const markup=a.pulseFilterMarkup({groups:[{items:rows.slice(0,14)},{items:rows.slice(14)}]});
 for(const [label,count] of [['Todos',33],['Abiertos',8],['Cerrados',3],['No disponibles',22]])assert.ok(markup.includes(label+' <span class="filter-count">'+count+'</span>'));
 assert.match(markup,/data-pulse-filter="closed"[^>]*aria-pressed="true"/);
 assert.equal(a.pulseFilterItems(rows).length,3);assert.equal(JSON.stringify(a.view()),before);assert.deepEqual(a.writes,[]);
});
test('project metadata belongs to exact agent and surface rather than global dashboard project filter',()=>{
 const a=api(),base={persona:'Morfeo',agent:'MorfeoMacMini',machine:'MacMini',runtime:'Claude',surface:'cli'};
 a.project({...base,host:'cli',project_id:'yokup',project_name:'Yokup <actual>'});
 a.project({...base,surface:'app',host:'app',project_id:'admiranext',project_name:'AdmiraNeXT'});
 assert.equal(a.pulseProjectLabel(base),'Yokup <actual>');assert.equal(a.pulseProjectLabel({...base,surface:'app'}),'AdmiraNeXT');
 assert.notEqual(a.pulseProjectLabel({...base,persona:'Neo',agent:'NeoMacMini'}),'Yokup <actual>');
});
test('compact card orders identity, project, then runtime with device and CLI on the same metadata row',()=>{
 const a=api(),row={persona:'Morfeo',agent:'MorfeoMacMini',machine:'MacMini',runtime:'Claude',surface:'cli',host:'cli',process_state:'open',model:'Fable 5.1'};
 a.project({...row,project_id:'yokup',project_name:'Yokup <actual>'});const card=a.pulseCard(row);
 const top=card.indexOf('class="top"'),project=card.indexOf('class="project"'),surface=card.indexOf('class="surface"'),runtime=card.indexOf('class="rt"'),machine=card.indexOf('class="mach"');
 assert.ok(top<project&&project<surface&&surface<runtime&&runtime<machine);
 assert.match(card.slice(top,project),/MorfeoMacMini[\s\S]*Fable 5\.1/);assert.match(card.slice(project,surface),/Yokup &lt;actual&gt;/);
 assert.match(card.slice(surface),/Claude · Abierto[\s\S]*MacMini[\s\S]*>CLI<\/span>/);
 assert.doesNotMatch(card,/<actual>|unrelated-global-project/);
 const desktop=a.pulseCard({...row,surface:'app',host:'app'});assert.doesNotMatch(desktop,/>CLI<\/span>/);
});
test('filter click uses the productive event handler without dispatching controls or saving an agent mode',async()=>{
 const original=JSON.stringify({cli:{compact:false,hidden:true},app:{compact:true,hidden:false}}),store=new Map([['yk.dashboard.silicon-fleet.view.v1',original]]),http=[],section={open:false},box={};
 const context={window:{},esc:escape,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},document:{getElementById:id=>id==='automationModules'?null:id==='pulseSection'?section:box,querySelector:()=>null},fetch:(...args)=>{http.push(args);throw new Error('filter must not call network');},paPaint(){},paTickAgo(){}};
 const start=source.indexOf('const PULSE_VIEW_KEY='),end=source.indexOf('async function pulse(renderMap=',start);
 vm.runInNewContext(source.slice(start,end)+'\nthis.click=pulseHandleClick; this.config=rows=>{PULSE_GROUPS={groups:[{key:"cli",items:rows}]};};',context);
 context.config(rows);
 await context.click({target:{closest:()=>({dataset:{pulseFilter:'closed'}})},preventDefault(){},stopPropagation(){}});
 assert.equal(section.open,true);assert.deepEqual(http,[]);assert.equal(store.get('yk.dashboard.silicon-fleet.view.v1'),original);
 assert.deepEqual(JSON.parse(store.get('yk.dashboard.deepagents.group-process-filters.v1')),{cli:'closed',app:'closed',unknown:'closed'});assert.equal(store.size,2);
});
