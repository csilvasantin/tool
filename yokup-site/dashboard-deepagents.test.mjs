import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import groups from './presence-groups.js';
import identity from './yk-agent-identity.js';
const source=await readFile(new URL('./dashboard.html',import.meta.url),'utf8');
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function setup(saved={}){
 const store=new Map(Object.entries(saved)),section={open:false},summary={style:{}},boxes={pulse:{id:'pulse'},pulseN:{id:'pulseN',getBoundingClientRect:()=>({height:84})}};
 const context={window:{YkPresenceGroups:groups,ykAgentIdentity:identity},YkPresenceGroups:groups,esc:escape,
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},document:{getElementById:id=>id==='pulseSection'?section:boxes[id]||null,querySelector:()=>summary},paPaint:(box,html)=>box.html=html,paTickAgo(){}};
 const start=source.indexOf('const PULSE_VIEW_KEY='),end=source.indexOf('async function pulse(renderMap=',start);
 vm.runInNewContext(source.slice(start,end)+`this.api={counts:pulseFilterCounts,filter:pulseFilterItems,apply:pulseApplyFilter,click:pulseHandleClick,render:pulseRender,card:pulseCard,markup:pulseGroupsMarkup,summary:pulseModeSummary,
 configure(items){PULSE_GROUPS=pulseControlledGroups(null,{items});},record(item,record){PULSE_MODES.set(pulseModeKey(item),record);},view(){return JSON.stringify(PULSE_VIEW);},current(){return PULSE_FILTER;}};`,context);
 return {api:context.api,section,boxes,store,summary};
}
const item=(name,state,surface='cli')=>({agent:name,persona:name,machine:'MacMini',runtime:'Claude',host:surface,surface,identity_key:name+'|'+surface,control_key:name+'|'+surface,state:'unknown',process_state:state});

test('partición completa y filtros sobreviven a un poll sin alterar los recuentos globales',()=>{
 const {api,boxes}=setup();const rows=[item('a','open'),item('b','waiting','app'),item('c','closed'),item('d','unknown'),item('e',undefined)];
 api.configure(rows);api.apply('open');
 assert.equal(api.current(),'open');assert.equal((boxes.pulse.html.match(/<article /g)||[]).length,2);
 assert.deepEqual(JSON.parse(JSON.stringify(api.counts(rows))),{all:5,open:2,closed:1,unknown:2});
 for(const [label,n] of [['Todos',5],['Abiertos',2],['Cerrados',1],['Sin señal',2]])assert.ok(boxes.pulseN.html.includes(label+' <span class="filter-count">'+n+'</span>'));
 api.configure([...rows,item('f','open','app')]);api.render();
 assert.equal(api.current(),'open');assert.equal((boxes.pulse.html.match(/<article /g)||[]).length,3);
 assert.match(boxes.pulseN.html,/Todos <span class="filter-count">6<\/span>/);
});
test('filtrar abre la sección sin toggle y revela grupos ocultos hasta volver a Todos',async()=>{
 const key='yk.dashboard.silicon-fleet.view.v1',saved=JSON.stringify({cli:{hidden:true,compact:false},app:{hidden:false,compact:true}});
 const {api,section,boxes,store}=setup({[key]:saved});api.configure([item('a','open'),item('b','open','app')]);const initial=api.view();
 let stopped=0,prevented=0;
 const event={target:{closest:()=>({dataset:{pulseFilter:'open'}})},preventDefault(){prevented++;},stopPropagation(){stopped++;}};
 await api.click(event);assert.equal(section.open,true);assert.equal(stopped,1);assert.equal(prevented,1);
 assert.doesNotMatch(boxes.pulse.html,/<div class="pulse" hidden/);assert.equal((boxes.pulse.html.match(/<article /g)||[]).length,2);
 await api.click(event);assert.equal(section.open,true);assert.equal(api.view(),initial);assert.equal(store.get(key),saved);
 api.apply('all');assert.match(boxes.pulse.html,/<div class="pulse" hidden/);assert.equal(api.view(),initial);
});
test('preferencia de filtro es independiente y inválidos recuperan Todos',()=>{
 const key='yk.dashboard.deepagents.process-filter.v1';
 const {api,store}=setup({[key]:'closed'});assert.equal(api.current(),'closed');api.apply('unknown');assert.equal(store.get(key),'unknown');
 assert.equal(setup({[key]:'no-such-filter'}).api.current(),'all');
});
test('proyecto de cada superficie sigue el registro canónico y se actualiza en Manual',()=>{
 const {api}=setup(),cli=item('Morfeo','open'),app={...cli,host:'app',surface:'app'};
 api.record(cli,{mode:'manual',project_id:'yokup',project_name:'Yokup <principal>'});api.record(app,{mode:'manual',project_id:'admiranext',project_name:'AdmiraNext'});
 let html=api.card(cli);assert.match(html,/Yokup &lt;principal&gt;/);assert.doesNotMatch(html,/AdmiraNext/);
 assert.match(api.card(app),/AdmiraNext/);
 api.record(cli,{mode:'manual',project_id:'nuevo',project_name:'Principal nuevo'});html=api.card(cli);assert.match(html,/Principal nuevo/);assert.doesNotMatch(html,/Yokup &lt;/);
 assert.match(api.card(item('sin','unknown')),/Proyecto pendiente de verificar/);
});
test('cabecera tiene filtros fuera del details y las tres filas mantienen el proyecto compacto',()=>{
 const details=source.slice(source.indexOf('<details class="dash-section" id="pulseSection">'),source.indexOf('<div id="pulseN"'));
 assert.doesNotMatch(details,/data-pulse-filter|id="pulseN"/);assert.match(source,/<\/details>\s*<div id="pulseN"/);
 assert.match(source,/\.ag \.surface\{display:grid;grid-template-columns:minmax\(0,1fr\) auto/);
 assert.doesNotMatch(source,/\.compact[^{}]*\.project\{[^}]*display:none/);
 const {api,summary}=setup();api.configure([item('a','open')]);api.render();assert.equal(summary.style.minHeight,'84px');
 const html=api.card({...item('Morfeo','open'),model:'Actual LLM'});
 assert.ok(html.indexOf('class="top"')<html.indexOf('class="project"'));
 assert.ok(html.indexOf('class="project"')<html.indexOf('class="surface"'));
 assert.ok(html.indexOf('class="rt"')<html.indexOf('class="mach"'));
});

test('un modo asociado al proyecto anterior explica cómo reactivar sin afirmar cadencia activa',()=>{
 const {api}=setup();const note=api.summary({mode:'learning',project_mismatch:true,mode_project_name:'Anterior',project_name:'Actual'});
 assert.match(note,/Modo pausado/);assert.match(note,/Anterior/);assert.match(note,/Actual/);assert.match(note,/Selecciona Manual/);assert.doesNotMatch(note,/Cápsula cada hora/);
});
