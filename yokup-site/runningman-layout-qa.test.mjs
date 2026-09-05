import test from 'node:test';
import workClock from './highscore-work-clock.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {installRaceView} from './highscore-race-test-support.mjs';
const html=fs.readFileSync(new URL('./highscore.html',import.meta.url),'utf8');
const identityContext={};vm.runInNewContext(fs.readFileSync(new URL('./yk-agent-identity.js',import.meta.url),'utf8'),identityContext);
const raceContext={module:{exports:{}},exports:{}};vm.runInNewContext(fs.readFileSync(new URL('./highscore-race.js',import.meta.url),'utf8'),raceContext);
function render(){
 const now=Date.parse('2026-09-05T06:00:00Z');
 const targets=[{agent:'OraculoMacMini',surface:'app'},{agent:'OraculoMBP14',surface:'cli'}];
 const rows=targets.map((x,i)=>({agente:x.agent,proyecto:'Yokup',posicion:i+1,total:20,vivo:true,maquinas:[],maquinasVivas:[]}));
 const works=targets.map(x=>({family_key:x.agent.toLowerCase(),agent:x.agent,executor:'Infra'+x.agent,kind:'task',title:'Verificación independiente',project_id:'yokup',project_name:'Yokup',detail_url:'/misiones',work_started_at:now-60000,work_progress_at:now,elapsed_ms:60000,state:'running',session_surface:x.surface}));
 const nodes={refreshLanes:{innerHTML:''},refreshRace:{setAttribute(){},classList:{toggle(){}}}};
 const ctx=vm.createContext({listaCache:rows,listaCompletaCache:rows,datos:{trabajos:works,trabajosAvailable:true,trabajosMode:'active',trabajosGeneratedAt:now,trabajosClientAt:0},document:{getElementById:id=>nodes[id]},normaliza:v=>String(v??'').trim(),esc:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),window:{ykAgentIdentity:identityContext.ykAgentIdentity},YkHighscoreRace:raceContext.module.exports,YkWorkClock:workClock,Number,String,Math,Date,Intl,performance:{now:()=>0}});
 installRaceView(html,ctx);
 const start=html.indexOf('function claveAgenteCarrera('),end=html.indexOf('\n\n  function pintaFormula',start);
 vm.runInContext(html.slice(start,end)+'\nactualizaCarreraPodio();',ctx);
 return nodes.refreshLanes.innerHTML;
}
test('runningman abrevia únicamente presentación y conserva carriles por equipo',()=>{
 const markup=render(),names=[...markup.matchAll(/<span\b[^>]*data-race-role="agent"[^>]*>([^<]*)<\/span>/g)].map(x=>x[1]);
 assert.deepEqual(names,['Oraculo','Oraculo']);
 const keys=[...markup.matchAll(/data-agent-key="([^"]+)"/g)].map(x=>x[1]);assert.equal(new Set(keys).size,2);assert.ok(keys.includes('oraculomacmini'));assert.ok(keys.includes('oraculombp14'));
 assert.doesNotMatch(markup,/class="refresh-agent-machine"/,'el ordenador no consume una fila visible');
 assert.equal((markup.match(/data-race-role="project"/g)||[]).length,2,'proyectos conservados');
 assert.equal((markup.match(/data-race-time="duration"/g)||[]).length,2,'tiempo de trabajo conservado');
});
test('hover y foco describen la máquina e interfaz exactas sin transferir superficies',()=>{
 const markup=render(),tags=[...markup.matchAll(/<span\b[^>]*data-race-role="agent"[^>]*>/g)].map(x=>x[0]);
 assert.equal(tags.length,2);
 assert.match(tags[0],/title="[^"]*MacMini[^\"]*APP/);assert.doesNotMatch(tags[0],/title="[^\"]*CLI/);
 assert.match(tags[1],/title="[^"]*MBP14[^\"]*CLI/);assert.doesNotMatch(tags[1],/title="[^\"]*APP/);
 for(const t of tags){assert.match(t,/tabindex="0"/);assert.match(t,/aria-label="[^"]+"/);}
});

const control=(await import('./agent-control.js')).default;
const agentIdentity=(await import('./yk-agent-identity.js')).default;
test('APP MBP14 sin cobertura de procesos nunca cuentan como cerradas',()=>{
 const now=1788588047,presence=['Neo','Trinity'].map((persona,i)=>({persona,machine:'MacBookProNegro14',runtime:i?'Codex':'Claude',host:'app',updated:now,verified:0,source:'heartbeat'}));
 const inventory=control.inventory({presence,controlMachines:[]},{identity:agentIdentity,now});
 const cards=control.groupCards(inventory.items,{identity:agentIdentity});
 assert.equal(cards.items.length,2);assert.equal(cards.counts.closed,0);assert.equal(cards.counts.open,0);assert.equal(cards.counts.unknown,2);
 assert.ok(cards.items.every(x=>!x.eligible.stop));
});
test('snapshots APP MBP14 exactos hacen visibles ambas aplicaciones sin mezclar interfaces',()=>{
 const now=1788588047,slots=[{persona:'Neo',runtime:'Claude',host:'app',session_id:'desktop:claude'},{persona:'Trinity',runtime:'Codex',host:'app',session_id:'desktop:codex'}];
 const presence=slots.map((x,i)=>({...x,machine:'MacBookProNegro14',updated:now,verified:1,source:'process_snapshot',pid:500+i}));
 const fresh=control.inventory({presence,controlMachines:[{machine:'MacBookProNegro14',updated:now,slots}]},{identity:agentIdentity,now});
 const cards=control.groupCards(fresh.items,{identity:agentIdentity});assert.equal(cards.counts.open,2);assert.equal(cards.counts.closed,0);assert.equal(cards.counts.unknown,0);
 for(const target of fresh.items){assert.equal(target.surface,'app');assert.equal(target.process_state,'open');assert.equal(target.eligible.stop,true);}
 const stale=control.inventory({presence,controlMachines:[{machine:'MacBookProNegro14',updated:now,slots}]},{identity:agentIdentity,now:now+600});
 const expired=control.groupCards(stale.items,{identity:agentIdentity});assert.equal(expired.counts.closed,0);assert.equal(expired.counts.open,0);assert.equal(expired.counts.unknown,2);
});
