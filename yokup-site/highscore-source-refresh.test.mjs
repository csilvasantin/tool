import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('./highscore.html',import.meta.url),'utf8');
function fn(name){const start=html.indexOf(`function ${name}(`),brace=html.indexOf('{',start);assert.ok(start>=0,name);let depth=0,quote='',escaped=false;for(let i=brace;i<html.length;i++){const c=html[i];if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';continue;}if(['"',"'",'`'].includes(c)){quote=c;continue;}if(c==='{')depth++;else if(c==='}'&&!--depth)return html.slice(start,i+1);}throw Error(name);}
function load(extra,names){const c=vm.createContext({Set,Map,Promise,console,...extra});vm.runInContext(names.map(fn).join('\n'),c);return c;}
test('refresh failures expose unavailable work and stale scores without erasing manual selection or old real scores',async()=>{
 let healthy=true;const manual=new Set(['morfeomacmini']);let writes=0;
 const daily={day:'2026-09-05',scores:[{agent:'Morfeo',machine:'MacMini',points:40}]};
 const history={ok:true,all_days:[{day:'2026-09-04',top:[{agent:'MorfeoMacMini',points:60}]}]};
 const routes={'/tasks/all?scope=fleet':[], '/highscore/daily':daily,'/highscore/history?scope=global':history,'/highscore/active-work':{ok:true,participants:[{agent:'MorfeoMacMini',state:'running'}],generated_at:1000,mode:'active'}};
 const noop=()=>{};
 const c=load({refrescando:false,datos:{},AGENT_SCOPE_MODE:'manual',AGENT_SCOPE:manual,listaCache:[],listaCompletaCache:[],fallos:[],window:{},performance:{now:()=>100},document:{getElementById:()=>({textContent:''})},seguroYokup:(route)=>Promise.resolve(healthy?(routes[route]??null):null),seguro:()=>Promise.resolve(null),hsBeginPresenceRequest:()=>1,hsAcceptPresenceRequest:()=>true,claveDia:()=>daily.day,guardaActividadDiaria:noop,hsWriteAgentScope:()=>writes++,normaliza:x=>String(x||''),calcula:()=>[],aplicaAgentScope:x=>x,hsRenderAgentScope:noop,pintaRecordDiario:noop,pintaPodio:noop,pintaTabla:noop,listaVisible:x=>x,pintaFormula:noop,actualizaCarreraPodio:noop},['actualizaMarcador']);
 await c.actualizaMarcador();assert.equal(c.datos.trabajosAvailable,true);assert.equal(c.datos.actividadFresh,true);assert.equal(c.datos.historialFresh,true);
 healthy=false;await c.actualizaMarcador();assert.equal(c.datos.trabajosAvailable,false);assert.equal(c.datos.trabajos.length,0);assert.equal(c.datos.actividadFresh,false);assert.equal(c.datos.historialFresh,false);assert.equal(c.datos.actividad[0].points,40);assert.equal(c.datos.historial,history);assert.equal(c.AGENT_SCOPE,manual);assert.equal(writes,0);assert.equal(c.refrescando,false);
 healthy=true;await c.actualizaMarcador();assert.equal(c.datos.trabajosAvailable,true);assert.equal(c.datos.actividadFresh,true);assert.equal(c.datos.historialFresh,true);assert.equal(c.AGENT_SCOPE,manual);
});
test('ranking summary tells the actual filter apart from compact display and never changes it while rendering',()=>{
 const nodes={rankingScopeSummary:{},rankingScopeAll:{}};const rows=[{agente:'MorfeoMacMini'},{agente:'MorfeoMBP14'},{agente:'NiobeMacMini'}];
 const c=load({document:{getElementById:id=>nodes[id]},AGENT_SCOPE_MODE:'manual',filtroSoloVivos:false,RANKING_PERIOD:'day',listaCompletaCache:rows,colapsaFilasRanking:x=>x,datos:{actividadFresh:true,historialFresh:true}},['hsRankingScopeSummary','hsRankingSourceWarning','hsRenderRankingScope']);
 c.hsRenderRankingScope(rows.slice(0,2),1);assert.equal(nodes.rankingScopeSummary.textContent,'Agentes: Selección manual · 2/3 · 1 fila visible (compacto)');assert.equal(nodes.rankingScopeAll.hidden,false);assert.equal(c.AGENT_SCOPE_MODE,'manual');
 c.AGENT_SCOPE_MODE='all';c.hsRenderRankingScope(rows,3);assert.equal(nodes.rankingScopeSummary.textContent,'Agentes: Todos · 3/3');assert.equal(nodes.rankingScopeAll.hidden,true);
 c.datos.actividadFresh=false;c.hsRenderRankingScope(rows,3);assert.match(nodes.rankingScopeSummary.textContent,/sin actualizar/);
 c.RANKING_PERIOD='week';c.datos.historialFresh=false;c.hsRenderRankingScope(rows,3);assert.match(nodes.rankingScopeSummary.textContent,/Histórico sin actualizar/);
});
test('explicit Show all restores the view only, keeping compact preference and refreshing both surfaces',()=>{
 const calls=[];const c=load({AGENT_SCOPE:new Set(['morfeo']),AGENT_SCOPE_MODE:'manual',filtroSoloVivos:true,rankingCompacto:true,listaCompletaCache:[],hsWriteAgentScope:(scope,mode)=>calls.push([scope,mode]),actualizaFiltroVida:()=>calls.push('life'),hsRenderAgentScope:()=>calls.push('menu'),pintaVistaFiltrada:()=>calls.push('both')},['hsShowAllAgents']);
 c.hsShowAllAgents();assert.equal(c.AGENT_SCOPE,null);assert.equal(c.AGENT_SCOPE_MODE,'all');assert.equal(c.filtroSoloVivos,false);assert.equal(c.rankingCompacto,true);assert.deepEqual(calls,[[null,'all'],'life','menu','both']);
});
test('life filter updates table and race in the same click, not only after polling',()=>{
 let click;const calls=[];const c=load({filtroSoloVivos:false,listaCache:[],document:{getElementById:()=>({addEventListener:(_,cb)=>click=cb})},actualizaFiltroVida:()=>calls.push('life'),pintaTabla:()=>calls.push('table'),listaVisible:x=>x,actualizaCarreraPodio:()=>calls.push('race')},['iniciaFiltroVida']);c.iniciaFiltroVida();calls.length=0;click();assert.equal(c.filtroSoloVivos,true);assert.deepEqual(calls,['life','table','race']);
});
