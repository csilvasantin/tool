import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import groups from './presence-groups.js';
import identity from './yk-agent-identity.js';

const source=await readFile(new URL('./dashboard.html',import.meta.url),'utf8');
const app={control_key:'app-control',agent:'MorfeoMacMini',persona:'Morfeo',machine:'MacMini',runtime:'Claude',host:'app',surface:'app'};
const cli={...app,control_key:'cli-control',host:'cli',surface:'cli'};
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const response=payload=>({ok:true,json:async()=>payload});
function setup(fetcher=async()=>response({ok:true,items:[]})) {
  const calls=[];
  const context={window:{YkPresenceGroups:groups,ykAgentIdentity:identity},YkPresenceGroups:groups,esc:escape,
    document:{getElementById:()=>null},localStorage:{getItem:()=>null},pulseRender(){},PROJECTS_API:'https://api.yokup.com',
    AbortSignal,fetch:(...args)=>{calls.push(args);return fetcher(...args);}};
  const start=source.indexOf('const PULSE_VIEW_KEY='),end=source.indexOf('function pulseRender()',start);
  vm.runInNewContext(source.slice(start,end)+`
    this.api={key:pulseModeKey,value:pulseModeValue,summary:pulseModeSummary,markup:pulseModeMarkup,
      load:pulseLoadModes,change:pulseHandleMode,
      configure(items,records=[]){PULSE_CONTROL_MODEL={by_key:new Map(items.map(i=>[i.control_key,i]))};
        PULSE_MODE_LOADED=true;PULSE_MODE_ERROR=false;records.forEach(r=>PULSE_MODES.set(pulseModeKey(r),r));},
      record(item){return PULSE_MODES.get(pulseModeKey(item));},error(item){return PULSE_MODE_ERRORS.get(pulseModeKey(item));}
    };`,context);
  return {api:context.api,calls};
}
function change(item,value){return {target:{closest:()=>({dataset:{pulseMode:item.control_key},value})}};}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}

test('el selector renderizado no envía órdenes y nace bloqueado hasta leer el modo persistente',()=>{
  const {api,calls}=setup();const html=api.markup(app);
  assert.match(html,/<option value="manual" selected>/);assert.match(html,/ disabled/);assert.match(html,/Cargando modo guardado/);
  assert.equal(calls.length,0);assert.equal((html.match(/<option /g)||[]).length,3);
});
test('GET conserva configuración por superficie; falta de registro equivale a Manual sin activar nada',async()=>{
  const record={...app,mode:'learning',project_id:'yokup'};
  const {api,calls}=setup(async()=>response({ok:true,items:[record]}));await api.load();
  assert.match(api.markup(app),/<option value="learning" selected>/);
  assert.match(api.markup(cli),/<option value="manual" selected>/);
  assert.equal(calls.length,1);assert.equal(calls[0][1].method,undefined);assert.equal(calls[0][1].credentials,'include');
});
test('la clave canónica une aliases de máquina pero mantiene CLI y app separados',()=>{
  const {api}=setup();assert.equal(api.key(app),api.key({...app,machine:'admira-macmini',persona:'MorfeoMacMini'}));
  assert.notEqual(api.key(app),api.key(cli));assert.notEqual(api.key(app),api.key({...app,runtime:'Codex'}));
});
test('un GET fallido nunca desbloquea un Manual ficticio ni autoriza un cambio',async()=>{
  const {api,calls}=setup(async()=>({ok:false,json:async()=>({ok:false,error:'unauthorized'})}));await api.load();
  assert.match(api.markup(app),/ disabled/);assert.match(api.markup(app),/No se pudo leer/);
  await api.change(change(app,'training'));assert.equal(calls.length,1);
});
test('solo el agente y superficie seleccionados se guardan, sin inventar proyecto del filtro',async()=>{
  const {api,calls}=setup(async(url,options)=>response({ok:true,item:{...app,...JSON.parse(options.body),project_id:'principal-servidor'}}));
  api.configure([app,cli]);await api.change(change(app,'training'));
  assert.equal(calls.length,1);assert.equal(calls[0][0],'https://api.yokup.com/fleet/agent/mode');
  assert.deepEqual(JSON.parse(calls[0][1].body),{persona:'Morfeo',machine:'MacMini',runtime:'Claude',host:'app',mode:'training'});
  assert.equal(api.record(app).mode,'training');assert.equal(api.record(cli),undefined);
  assert.match(api.markup(app),/principal-servidor/);
});
test('guardar mantiene el modo anterior mientras espera confirmación y bloquea duplicados',async()=>{
  const pending=deferred(),{api,calls}=setup(()=>pending.promise);
  api.configure([app],[{...app,mode:'manual'}]);const write=api.change(change(app,'learning'));
  assert.equal(api.record(app).mode,'manual');assert.match(api.markup(app),/Guardando modo/);assert.match(api.markup(app),/ disabled/);
  await api.change(change(app,'training'));assert.equal(calls.length,1);
  pending.resolve(response({ok:true,item:{...app,mode:'learning',project_id:'yokup'}}));await write;
  assert.equal(api.record(app).mode,'learning');
});
test('un fallo POST conserva el modo y traduce el código sin mostrar el error privado',async()=>{
  const {api}=setup(async()=>({ok:false,json:async()=>({ok:false,code:'project_required',error:'PRIVATE_DETAIL'})}));
  api.configure([app],[{...app,mode:'manual'}]);await api.change(change(app,'learning'));
  assert.equal(api.record(app).mode,'manual');assert.match(api.error(app),/proyecto principal/);assert.doesNotMatch(api.markup(app),/PRIVATE_DETAIL/);
});
test('una respuesta de otra superficie no se acepta como guardado de la elegida',async()=>{
  const {api}=setup(async()=>response({ok:true,item:{...cli,mode:'learning'}}));
  api.configure([app],[{...app,mode:'manual'}]);await api.change(change(app,'learning'));
  assert.equal(api.record(app).mode,'manual');assert.match(api.error(app),/No se pudo confirmar/);
});
test('un GET antiguo no deshace el modo recién confirmado por POST',async()=>{
  const old=deferred(),{api}=setup((url,options)=>options.method==='POST'?Promise.resolve(response({ok:true,item:{...app,mode:'training',project_id:'yokup'}})):old.promise);
  api.configure([app],[{...app,mode:'manual'}]);const read=api.load(true);
  await api.change(change(app,'training'));old.resolve(response({ok:true,items:[{...app,mode:'manual'}]}));await read;
  assert.equal(api.record(app).mode,'training');
});
test('Manual desactiva solo la superficie elegida y una selección sin cambio no reprograma',async()=>{
  const {api,calls}=setup(async()=>response({ok:true,item:{...app,mode:'manual'}}));
  api.configure([app,cli],[{...app,mode:'learning'},{...cli,mode:'training'}]);
  await api.change(change(app,'learning'));assert.equal(calls.length,0);
  await api.change(change(app,'manual'));assert.equal(api.record(app).mode,'manual');assert.equal(api.record(cli).mode,'training');assert.equal(calls.length,1);
});
test('notas muestran proyecto, bloqueo y próxima hora sin afirmar entrega completada antes de tiempo',()=>{
  const {api}=setup();const summary=api.summary({mode:'learning',project_name:'Yokup',status:'awaiting_delivery',reason:'previous_run_pending',next_run:2_000_000_000_000});
  assert.match(summary,/Yokup/);assert.match(summary,/Pendiente de entrega/);assert.match(summary,/próxima/);assert.doesNotMatch(summary,/Entrega verificada/);
  assert.match(api.summary({mode:'training',project_id:'yokup',status:'skipped',reason:'human_active'}),/ordenador en uso/);
});
test('un fallo de GET anterior al guardado tampoco invalida el modo confirmado',async()=>{
  const old=deferred(),{api}=setup((url,options)=>options.method==='POST'?Promise.resolve(response({ok:true,item:{...app,mode:'training',project_id:'yokup'}})):old.promise);
  api.configure([app],[{...app,mode:'manual'}]);const read=api.load(true);await api.change(change(app,'training'));
  old.resolve({ok:false,json:async()=>({ok:false,error:'unavailable'})});await read;
  assert.equal(api.record(app).mode,'training');assert.doesNotMatch(api.markup(app),/ disabled/);
});
test('última ejecución y consumidor ausente se muestran sin afirmar una cápsula entregada',()=>{
  const {api}=setup();const summary=api.summary({mode:'learning',project_name:'Yokup',status:'unavailable',reason:'consumer_unavailable',last_run:{status:'failed',updated_at:2_000_000_000_000}});
  assert.match(summary,/ejecutor no disponible en este ordenador/);assert.match(summary,/última/);assert.match(summary,/No completado/);assert.doesNotMatch(summary,/Entrega verificada/);
});

test('la cadencia de Training es horaria y no impone ni promete un cupo de entregas diarias',()=>{
  const {api}=setup(),summary=api.summary({mode:'training',project_id:'yokup',status:'scheduled'});
  assert.match(summary,/cada hora/);assert.doesNotMatch(summary,/24|cupo|entregas diarias/);
});

test('sin consumidor compatible Learning y Training quedan inactivos, pero Manual sigue permitido',async()=>{
  const {api,calls}=setup(async()=>response({ok:true,item:{...cli,mode:'manual',available_modes:['manual'],support_reason:'consumer_unavailable'}}));
  api.configure([cli],[{...cli,mode:'learning',available_modes:['manual'],support_reason:'consumer_unavailable'}]);
  const html=api.markup(cli);assert.match(html,/<option value="learning" selected disabled>/);assert.match(html,/<option value="training" disabled>/);assert.match(html,/Ejecutor no disponible/);
  await api.change(change(cli,'training'));assert.equal(calls.length,0);
  await api.change(change(cli,'manual'));assert.equal(calls.length,1);assert.equal(api.record(cli).mode,'manual');
});

test('aviso sin telemetría y opciones usan el mismo registro y se recuperan juntos',async()=>{
  let record={...app,mode:'manual',available_modes:['manual'],support_reason:'telemetry_unavailable'};
  const {api,calls}=setup(async()=>response({ok:true,items:[record]}));
  await api.load(true);
  let html=api.markup(app);
  assert.match(html,/Sin señal reciente del ordenador/);
  assert.match(html,/<option value="learning" disabled>/);
  assert.match(html,/<option value="training" disabled>/);
  assert.match(html,/<option value="manual" selected>/);
  await api.change(change(app,'learning'));assert.equal(calls.length,1);
  record={...record,available_modes:['manual','learning','training'],support_reason:''};
  await api.load(true);html=api.markup(app);
  assert.doesNotMatch(html,/Sin señal reciente|No se puede activar/);
  assert.match(html,/<option value="learning">/);
  assert.match(html,/<option value="training">/);
});
