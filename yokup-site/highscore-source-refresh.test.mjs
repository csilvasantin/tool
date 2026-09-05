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
 const c=load({refrescando:false,datos:{},AGENT_SCOPE_MODE:'manual',AGENT_SCOPE:manual,listaCache:[],listaCompletaCache:[],fallos:[],window:{},performance:{now:()=>100},document:{getElementById:()=>({textContent:''})},seguroYokup:(route)=>Promise.resolve(healthy?(routes[route]??null):null),seguro:()=>Promise.resolve(null),hsRefreshWork:()=>{const payload=healthy?routes["/highscore/active-work"]:null;c.hsApplyWorkSnapshot(payload);return Promise.resolve(payload);},hsBeginPresenceRequest:()=>1,hsAcceptPresenceRequest:()=>true,claveDia:()=>daily.day,guardaActividadDiaria:noop,hsWriteAgentScope:()=>writes++,normaliza:x=>String(x||''),calcula:()=>[],aplicaAgentScope:x=>x,hsRenderAgentScope:noop,pintaRecordDiario:noop,pintaPodio:noop,pintaTabla:noop,listaVisible:x=>x,pintaFormula:noop,actualizaCarreraPodio:noop},['hsApplyWorkSnapshot','actualizaMarcador']);
 await c.actualizaMarcador();assert.equal(c.datos.trabajosAvailable,true);assert.equal(c.datos.actividadFresh,true);assert.equal(c.datos.historialFresh,true);
 let releaseDaily;const originalFetch=c.seguroYokup;
 c.seguroYokup=route=>route==='/highscore/daily'?new Promise(resolve=>releaseDaily=resolve):originalFetch(route);
 const heavyRefresh=c.actualizaMarcador();
 c.hsApplyWorkSnapshot({ok:true,participants:[{agent:'NewerWork'}],generated_at:2000});
 releaseDaily(daily);await heavyRefresh;assert.equal(c.datos.trabajos[0].agent,'NewerWork','finishing the slower score refresh cannot apply the old work payload again');
 c.seguroYokup=originalFetch;
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

await import('./yk-agent-identity.js');
test('observations require fresh explicit open evidence and exact scope; no invented busy or cross-machine match',()=>{
 const c=load({window:{ykAgentIdentity:globalThis.ykAgentIdentity},normaliza:v=>String(v||'')},['claveAgenteCarrera','hsWorkIdentity','hsVisibleWorkObservations']);
 const now=1750000000000;const row={agent:'Morfeo',machine:'MacMini',host:'app',runtime:'Claude',process_state:'open',activity_state:'unverified',reason:'no_linked_work',observed_at:now};
 assert.equal(c.hsVisibleWorkObservations([row],now,null).length,1);
 assert.equal(c.hsVisibleWorkObservations([row,row],now,null).length,1);
 assert.equal(c.hsVisibleWorkObservations([row],now,new Set(['morfeombp14'])).length,0);
 assert.equal(c.hsVisibleWorkObservations([row],now+30001,null).length,0);
 for(const patch of [{activity_state:'busy'},{observed_at:0},{observed_at:now+5001},{machine:''},{process_state:'unknown'},{host:'unknown'}])assert.equal(c.hsVisibleWorkObservations([{...row,...patch}],now,null).length,0);
});
test('light polling ignores animation pause, coalesces requests, and late timed-out responses cannot overwrite newer work',async()=>{
 const requests=[],timers=new Map(),paints=[];let id=0;
 const c=load({datos:{},document:{hidden:false},carreraPausada:true,WORK_TIMEOUT_MS:8000,WORK_POLL_MS:20000,workRequestSequence:0,workRequest:null,YK:'https://api.test',AbortController,performance:{now:()=>100},normaliza:v=>String(v||''),setTimeout:(cb,ms)=>{timers.set(++id,{cb,ms});return id;},clearTimeout:id=>timers.delete(id),fetch:(_url,options)=>new Promise(resolve=>requests.push({resolve,options})),hsPaintWorkUpdate:()=>paints.push(c.datos.trabajos[0]?.agent||'unavailable')},['hsApplyWorkSnapshot','hsRefreshWork','hsPollWork']);
 const old=c.hsPollWork();assert.equal(requests.length,1);assert.equal(c.hsPollWork(),old,'same in-flight request');assert.equal([...timers.values()][0].ms,8000);
 [...timers.values()][0].cb();await old;assert.equal(c.datos.trabajosAvailable,false);assert.equal(requests[0].options.signal.aborted,true);
 const fresh=c.hsPollWork();requests[1].resolve({ok:true,json:async()=>({ok:true,participants:[{agent:'MorfeoMacMini'}],observations:[],generated_at:2000})});await fresh;assert.equal(c.datos.trabajos[0].agent,'MorfeoMacMini');
 requests[0].resolve({ok:true,json:async()=>({ok:true,participants:[{agent:'OLD'}],generated_at:1000})});await Promise.resolve();await Promise.resolve();assert.equal(c.datos.trabajos[0].agent,'MorfeoMacMini');assert.deepEqual(paints,['unavailable','MorfeoMacMini']);
 c.document.hidden=true;await c.hsPollWork();assert.equal(requests.length,2);
 assert.match(html,/setInterval\(hsPollWork, WORK_POLL_MS\)/);assert.match(html,/visibilitychange[^\n]*hsPollWork\(\)/);
});
