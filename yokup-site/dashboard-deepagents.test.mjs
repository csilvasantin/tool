import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import groups from './presence-groups.js';
import identity from './yk-agent-identity.js';
import control from './agent-control.js';
const source=await readFile(new URL('./dashboard.html',import.meta.url),'utf8');
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function setup(saved={},useControl=false){
 const store=new Map(Object.entries(saved)),section={open:false},summary={style:{}},boxes={pulse:{id:'pulse'},pulseN:{id:'pulseN',getBoundingClientRect:()=>({height:84})}};
 const context={Map,Set,window:{YkPresenceGroups:groups,ykAgentIdentity:identity},YkPresenceGroups:groups,esc:escape,
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},document:{getElementById:id=>id==='pulseSection'?section:boxes[id]||null,querySelector:()=>summary},paPaint:(box,html)=>box.html=html,paTickAgo(){}};
 if(useControl){context.window.YkAgentControl=control;context.YkAgentControl=control;}
 const start=source.indexOf('const PULSE_VIEW_KEY='),end=source.indexOf('async function pulse(renderMap=',start);
 vm.runInNewContext(source.slice(start,end)+`this.api={counts:pulseFilterCounts,filter:pulseFilterItems,apply:pulseApplyFilter,click:pulseHandleClick,render:pulseRender,card:pulseCard,markup:pulseGroupsMarkup,summary:pulseModeSummary,
 configure(items){PULSE_CONTROL_MODEL={items,by_key:new Map(items.map(i=>[i.control_key,i]))};PULSE_GROUPS=pulseControlledGroups(null,PULSE_CONTROL_MODEL);},cards(){return PULSE_GROUPS.groups.flatMap(g=>g.items);},batch(group,action){return YkAgentControl.batchPlan(PULSE_CONTROL_MODEL,group,action,{selections:PULSE_RUNTIME_SELECTIONS,requireSelections:PULSE_RUNTIME_INVALIDATED,identity:window.ykAgentIdentity});},select:pulseSelectRuntime,loaded(){PULSE_MODE_LOADED=true;},group:pulseGroupFilter,applyView:pulseApplyView,record(item,record){PULSE_MODES.set(pulseModeKey(item),record);},view(){return JSON.stringify(PULSE_VIEW);},current(){return PULSE_FILTER;}};`,context);
 return {api:context.api,section,boxes,store,summary};
}
const item=(name,state,surface='cli')=>({agent:name,persona:name,machine:'MacMini',runtime:'Claude',host:surface,surface,identity_key:name+'|'+surface,control_key:name+'|'+surface,state:'unknown',process_state:state});

test('partición completa y filtros sobreviven a un poll sin alterar los recuentos globales',()=>{
 const {api,boxes}=setup();const rows=[item('a','open'),item('b','waiting','app'),item('c','closed'),item('d','unknown'),item('e',undefined)];
 api.configure(rows);api.apply('open');
 assert.equal(api.current(),'open');assert.equal((boxes.pulse.html.match(/<article /g)||[]).length,2);
 assert.deepEqual(JSON.parse(JSON.stringify(api.counts(rows))),{all:5,open:2,closed:1,unknown:2});
 for(const [label,n] of [['Todos',5],['Abiertos',2],['Cerrados',1],['No disponibles',2]])assert.ok(boxes.pulseN.html.includes(label+' <span class="filter-count">'+n+'</span>'));
 api.configure([...rows,item('f','open','app')]);api.render();
 assert.equal(api.current(),'open');assert.equal((boxes.pulse.html.match(/<article /g)||[]).length,3);
 assert.match(boxes.pulseN.html,/Todos <span class="filter-count">6<\/span>/);
});
test('filtrar abre la sección y revela el grupo sin cambiar su preferencia de visibilidad',async()=>{
 const key='yk.dashboard.silicon-fleet.view.v1',saved=JSON.stringify({cli:{hidden:true,compact:false},app:{hidden:false,compact:true}});
 const {api,section,boxes,store}=setup({[key]:saved});api.configure([item('a','open'),item('b','open','app')]);const initial=api.view();
 let stopped=0,prevented=0;
 const event={target:{closest:()=>({dataset:{pulseFilter:'open'}})},preventDefault(){prevented++;},stopPropagation(){stopped++;}};
 await api.click(event);assert.equal(section.open,true);assert.equal(stopped,1);assert.equal(prevented,1);
 assert.doesNotMatch(boxes.pulse.html,/<div class="pulse" hidden/);assert.equal((boxes.pulse.html.match(/<article /g)||[]).length,2);
 await api.click(event);assert.equal(section.open,true);assert.equal(api.view(),initial);assert.equal(store.get(key),saved);
 api.apply('all');assert.doesNotMatch(boxes.pulse.html,/<div class="pulse" hidden/);assert.equal(api.view(),initial);
});
test('preferencia por grupo es independiente y cada valor inválido recupera Abiertos',()=>{
 const key='yk.dashboard.deepagents.group-process-filters.v1';
 const {api,store}=setup({[key]:JSON.stringify({cli:'closed',app:'closed'})});assert.equal(api.current(),'closed');api.apply('unknown');assert.deepEqual(JSON.parse(store.get(key)),{cli:'unknown',app:'unknown',unknown:'unknown'});
 assert.equal(setup({[key]:'no-json'}).api.current(),'open');
 assert.equal(setup({'yk.dashboard.deepagents.process-filter.v1':'all'}).api.current(),'open');
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

test('un proyecto ambiguo o no disponible no aparece como fallback confirmado',()=>{
 const {api}=setup(),cli=item('Morfeo','open');
 api.record(cli,{project_id:'admiranext',project_name:'AdmiraNeXT',project_available:false,project_issue:'project_ambiguous'});
 let html=api.card(cli);assert.match(html,/Asignación principal ambigua/);assert.doesNotMatch(html,/AdmiraNeXT/);
 api.record(cli,{project_id:'admiranext',project_name:'AdmiraNeXT',project_available:false});
 html=api.card(cli);assert.match(html,/Proyecto pendiente de verificar/);assert.doesNotMatch(html,/AdmiraNeXT/);
 assert.doesNotMatch(source,/Controles de la deepAgents/);
});
test('contador individual sustituye sólo su grupo y el global mixto no afirma una selección común',()=>{
 const {api,boxes,store}=setup();const rows=[item('z','unknown'),item('b','closed'),item('a','open'),item('app-open','open','app'),item('app-closed','closed','app')];
 api.configure(rows);api.render();assert.equal(api.group('cli'),'open');assert.equal(api.group('app'),'open');assert.equal((boxes.pulse.html.match(/<article /g)||[]).length,2);
 api.apply('closed','cli');assert.equal(api.group('app'),'open');assert.equal(api.current(),null);assert.match(boxes.pulseN.html,/Filtros distintos por grupo/);assert.doesNotMatch(boxes.pulseN.html,/aria-pressed="true"/);
 assert.equal((boxes.pulse.html.match(/<article /g)||[]).length,2);assert.match(boxes.pulse.html,/Total <span class="filter-count">3<\/span>/);
 api.apply('all','cli');const cards=boxes.pulse.html;assert.ok(cards.indexOf('<b>a</b>')<cards.indexOf('<b>b</b>'));assert.ok(cards.indexOf('<b>b</b>')<cards.indexOf('<b>z</b>'));
 api.apply('unknown');assert.equal(api.group('cli'),'unknown');assert.equal(api.group('app'),'unknown');assert.equal(api.current(),'unknown');
 assert.equal(store.has('yk.dashboard.silicon-fleet.view.v1'),false);
});
test('el orden visual es estado y nombre estable sin reordenar el inventario ni mezclar disponibilidad de control',()=>{
 const {api}=setup();const rows=[item('Z','unknown'),item('B','closed'),item('b','open'),item('A','waiting'),{...item('C','open'),state:'ambiguous'}],before=JSON.stringify(rows);
 assert.deepEqual(JSON.parse(JSON.stringify(api.filter(rows,'all').map(row=>row.agent))),['A','b','C','B','Z']);assert.equal(JSON.stringify(rows),before);
 assert.deepEqual(JSON.parse(JSON.stringify(api.filter(rows,'open').map(row=>row.agent))),['A','b','C']);
});
test('entrar por defecto conserva grupo oculto y compactación, contador Total revela sólo ese grupo',()=>{
 const key='yk.dashboard.silicon-fleet.view.v1',saved=JSON.stringify({cli:{hidden:true,compact:false},app:{hidden:true,compact:true}});
 const {api,boxes,section,store}=setup({[key]:saved});api.configure([item('cli-open','open'),item('cli-closed','closed'),item('app-open','open','app')]);api.render();
 assert.equal(section.open,false);assert.equal((boxes.pulse.html.match(/<div class="pulse" hidden/g)||[]).length,2);
 api.apply('all','cli');assert.equal(section.open,true);assert.equal((boxes.pulse.html.match(/<div class="pulse" hidden/g)||[]).length,1);assert.equal(store.get(key),saved);
 api.applyView('hide','cli');assert.equal((boxes.pulse.html.match(/<div class="pulse" hidden/g)||[]).length,2);assert.equal(api.group('cli'),'all');
});
test('ficha multiruntime opera y muestra modo sólo del destino elegido; perderlo obliga a elegir de nuevo',()=>{
 const {api}=setup({},true);
 const target=(runtime,state)=>({...item('Niobe',state,'app'),agent:'NiobeMacMini',runtime,identity_key:'niobe|app|'+runtime,control_key:'ctl-'+runtime,eligible:{start:state==='closed',stop:state==='open'},state:state==='closed'?'stopped':'active',model:runtime+' real'});
 const codex=target('Codex','closed'),open=target('OpenCode','open');
 api.configure([codex,open]);api.loaded();let card=api.cards()[0];assert.equal(api.cards().length,1);assert.equal(card.process_state,'open');
 let html=api.card(card);assert.equal(api.batch('app','start').count,0);assert.equal(api.batch('app','stop').count,0);assert.match(html,/Selecciona una aplicación/);assert.doesNotMatch(html,/data-pulse-mode=/);assert.match(html,/data-pulse-action=""[^>]* disabled/);
 api.record(codex,{mode:'training',available_modes:['manual','training']});api.record(open,{mode:'manual',available_modes:['manual']});
 api.select(encodeURIComponent(card.card_key),encodeURIComponent(codex.identity_key));html=api.card(card);assert.equal(api.batch('app','start').count,1);assert.equal(api.batch('app','stop').count,0);
 assert.doesNotMatch(html,/class="llm">Codex real/,"un destino cerrado no acredita su modelo actual");assert.doesNotMatch(html,/class="llm">OpenCode real/);assert.match(html,/Codex · Cerrado/);assert.match(html,/Estado de la ficha: Abierto/);
 assert.match(html,/data-pulse-action="start" data-control-key="ctl-Codex"/);assert.match(html,/data-pulse-mode="ctl-Codex"/);assert.match(html,/<option value="training" selected/);
 api.configure([open]);card=api.cards()[0];html=api.card(card);assert.equal(api.batch('app','stop').count,0,'bulk tampoco elige automáticamente el runtime restante');assert.match(html,/Selecciona una aplicación/);assert.doesNotMatch(html,/data-pulse-mode=/);assert.match(html,/data-pulse-action=""[^>]* disabled/);
 api.select(encodeURIComponent(card.card_key),encodeURIComponent(open.identity_key));html=api.card(card);assert.equal(api.batch('app','stop').count,1);assert.match(html,/data-pulse-action="stop" data-control-key="ctl-OpenCode"/);assert.match(html,/data-pulse-mode="ctl-OpenCode"/);assert.match(html,/<option value="manual" selected/);
});
