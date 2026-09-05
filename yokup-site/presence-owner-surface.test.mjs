import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import identity from './yk-agent-identity.js';
const source=readFileSync(new URL('./dashboard.html',import.meta.url),'utf8');
const extract=name=>{const at=source.indexOf('function '+name+'(');const end=source.indexOf('\nfunction ',at+1);return source.slice(at,end);};
const ctx=vm.createContext({window:{ykAgentIdentity:identity},ykAgentIdentity:identity,AGENT_FRESH_SECONDS:240,paTeamKey:x=>identity.suffix(x)});
vm.runInContext(['paPresencePersona','paFreshPresence','paVerifiedPresence'].map(extract).join('\n'),ctx);
const now=1788590000;
const row={persona:'Trinity',machine:'MacMini',runtime:'Codex',host:'cli',updated:now,model:'private-cli-model',focus:'CLI work'};
const reporter=persona=>({reporter:{persona,machine:'MacMini'},ts:now*1000});
test('reporter Oraculo no toma primer Claude/Trinity como dueño o proceso verificado',()=>{
 const result=ctx.paVerifiedPresence([row,{...row,persona:'Morfeo',runtime:'Claude'}],[reporter('Oraculo')],now);
 assert.equal(result.some(x=>x.persona==='Oraculo'),false);
 assert.equal(result.every(x=>x.verified===false&&x.model===''),true);
});
test('reporter exacto sólo acredita declaración; no verifica proceso ni presta modelo',()=>{
 const result=ctx.paVerifiedPresence([row],[reporter('Trinity')],now);
 assert.equal(result.length,1);assert.equal(result[0].persona,'Trinity');assert.equal(result[0].host,'cli');
 assert.equal(result[0].verified,false);assert.equal(result[0].model,'');assert.equal(result[0].source,'browser_heartbeat');
});
test('snapshot exacto mantiene dueño y modelo; viejo/falso/futuro no conserva verificación',()=>{
 const app={...row,persona:'Oraculo',host:'app',pid:123,verified:1,source:'process_snapshot',model:'actual-model'};
 assert.equal(ctx.paVerifiedPresence([app],[reporter('Trinity')],now)[0].model,'actual-model');
 for(const patch of [{verified:0},{updated:now-31},{updated:now+6},{pid:0},{online:false}]){
  const result=ctx.paVerifiedPresence([{...app,...patch}],[],now);
  assert.equal(result.every(x=>x.verified===false&&x.model===''),true,JSON.stringify(patch));
 }
 assert.equal(ctx.paPresencePersona({runtime:'Codex',account:'gmail',host:'cli'}),'');
});

const hs=readFileSync(new URL('./highscore.html',import.meta.url),'utf8');
const hsFn=name=>hs.match(new RegExp('  function '+name+'\\([^]*?\\n  }'))[0];
function rankingModels(rows){
 const map=new Map();const start=hs.indexOf('    datos.presencia.forEach(function (p) {');
 const end=hs.indexOf('    // Actividad AHORA',start);
 const context=vm.createContext({datos:{presencia:rows,controlMachines:[{machine:'MacMini',updated:now,slots:[{persona:'Oraculo',runtime:'Codex',host:'app',model:'wrong-slot'}]}]},
  ahora:now,FRESCO_SEG:240,id:null,Date:{now:()=>now*1000},normaliza:x=>String(x||'').trim(),
  datosId:persona=>({base:persona}),marcaProyecto:()=>{},
  fila:(persona,machine)=>{const key=persona+'|'+machine;if(!map.has(key))map.set(key,{maquinas:[],maquinasVivas:[],runtime:'',runtimePeso:0,runtimeAt:0});return map.get(key);}});
 vm.runInContext(['adoptaRuntimeCandidato','adoptaRuntime','modeloLegible'].map(hsFn).join('\n')+'\n'+hs.slice(start,end),context);
 return map;
}
test('Highscore mantiene APP sin modelo y CLI real; heartbeat/slot/futuro no rellenan LLM',()=>{
 const app={persona:'Oraculo',machine:'MacMini',runtime:'Codex',host:'app',pid:123,verified:1,source:'process_snapshot',updated:now,model:''};
 const cli={...app,persona:'Trinity',host:'cli',pid:456,model:'GPT-5.6'};
 const map=rankingModels([app,cli]);assert.equal(map.get('Oraculo|MacMini').modelo,'');assert.equal(map.get('Trinity|MacMini').modelo,'GPT-5.6');
 for(const patch of [{verified:0},{source:'heartbeat'},{updated:now-31},{updated:now+6},{online:0},{process_state:'closed'},{process_state:'unknown'},{cli_paused:true}]){
  const result=rankingModels([{...app,model:'GPT-5.6',...patch}]);
  assert.equal(result.get('Oraculo|MacMini').modelo,'',JSON.stringify(patch));
 }
});

test('APP actual gana al CLI pausado y a ranuras registradas en cualquier orden',()=>{
 const app={persona:'Oraculo',machine:'MacMini',runtime:'Codex',host:'app',pid:123,verified:1,source:'process_snapshot',updated:now};
 const cli={...app,host:'cli',pid:456,cli_paused:true,model:'Modelo CLI'};
 for(const rows of [[app,cli],[cli,app]]){
  const row=rankingModels(rows).get('Oraculo|MacMini');
  assert.equal(row.via,'app');assert.equal(row.runtimePeso,120);assert.equal(row.runtimeAt,now);
 }
 const row=rankingModels([cli]).get('Oraculo|MacMini');assert.ok(row.runtimePeso<100,'un CLI pausado no es ejecución vigente');
});
