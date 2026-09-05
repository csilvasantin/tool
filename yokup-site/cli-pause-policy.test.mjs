import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import control from './agent-control.js';
import identity from './yk-agent-identity.js';
const dashboard=readFileSync(new URL('./dashboard.html',import.meta.url),'utf8');
const highscore=readFileSync(new URL('./highscore.html',import.meta.url),'utf8');
function extract(source,name){const start=source.search(new RegExp('(?:async )?function '+name+'\\('));assert.ok(start>=0,name);const tail=source.slice(start),end=tail.search(/\n(?: {0,2}(?:async )?function |document\.)/);return end<0?tail:tail.slice(0,end);}
function context(source,names,extra={}){const c=vm.createContext({Map,Set,Date,Number,String,Math,URL,encodeURIComponent,decodeURIComponent,normaliza:v=>String(v??'').trim(),esc:v=>String(v??''),...extra});for(const name of names)vm.runInContext(extract(source,name),c);return c;}
const now=1788598000;
const row=(host,machine='MacMini')=>({persona:'Oraculo',machine,runtime:'Codex',host,session_id:host==='app'?'desktop:codex':'oraculo',pid:300,updated:now,source:'process_snapshot',verified:1,online:true});
const slot=host=>({persona:'Oraculo',runtime:'Codex',host,session_id:host==='app'?'desktop:codex':'oraculo'});
function model(presence=[],slots=[slot('cli'),slot('app')],updated=now){return control.inventory({presence,controlMachines:[{machine:'MacMini',updated,slots,capabilities:['cli_pause_preserve_session']}]},{identity,now});}

test('CLI paused on every machine does not manufacture closed or lose exact stop',()=>{
  for(const machine of ['MacMini','MBP14','MBP16','MBAPlata']){
    const m=control.inventory({presence:[row('cli',machine)],controlMachines:[{machine,updated:now,capabilities:['cli_pause_preserve_session']}]},{identity,now});const item=m.items[0];
    assert.equal(item.policy_paused,true);assert.equal(item.process_state,'open');
    assert.equal(item.eligible.start,false);assert.equal(item.eligible.stop,true);
    assert.equal(control.requestFor(m,item.control_key,'stop').body.pid,300);
    assert.throws(()=>control.requestFor(m,item.control_key,'start'),/cli_paused_by_carlos/);
  }
});
test('closed CLI stays blocked while APP remains startable; stale remains unknown',()=>{
  const m=model(),cli=m.items.find(r=>r.surface==='cli'),app=m.items.find(r=>r.surface==='app');
  assert.equal(cli.process_state,'closed');assert.equal(cli.eligible.start,false);
  assert.equal(app.process_state,'closed');assert.equal(app.eligible.start,true);
  assert.equal(control.requestFor(m,app.control_key,'start').body.host,'app');
  assert.ok(model([],undefined,now-60).items.every(r=>r.process_state==='unknown'));
});
test('old cached eligibility cannot bypass CLI gate individually or through batch',async()=>{
  const m=model();const cli=m.items.find(r=>r.surface==='cli');cli.eligible.start=true;
  assert.equal(control.batchPlan(m,'cli','start').count,0);
  let sent=0;const result=await control.executeOne(m,cli.control_key,'start',{confirmed:true,send:async()=>{sent++;}});
  assert.equal(result.ok,false);assert.equal(result.error,'cli_paused_by_carlos');assert.equal(sent,0);
});
test('mode and module activation fail closed for cached CLI capabilities',async()=>{
  const c=context(dashboard,['pulseCliPaused','pulseModeAllowed','automationUiFamily','automationUiReason','automationUiFamilies','automationHandle'],{
    window:{},AUTOMATION_SELECTIONS:{learning:new Map()},AUTOMATION_BUSY:false,AUTOMATION_STATE:null,AUTOMATION_ERROR:'',automationRender(){},
  });
  const cli={agent:'SmithMBAPlata',machine:'MBAPlata',host:'cli',runtime:'Grok',identity_key:'smith',available_modes:['manual','learning']};
  assert.equal(c.pulseModeAllowed(cli,'learning'),false);assert.equal(c.pulseModeAllowed(cli,'manual'),true);
  assert.equal(c.pulseModeAllowed({...cli,host:'app'},'learning'),true);
  c.AUTOMATION_STATE={items:[cli],categories:[{mode:'learning',revision:0}]};c.AUTOMATION_SELECTIONS.learning.set(c.automationUiFamily(cli),'smith');
  let writes=0;c.automationRequest=async()=>{writes++;};
  await c.automationHandle({type:'click',target:{closest:s=>s==='[data-automation-action]'?{dataset:{automationAction:'activate',mode:'learning'}}:null}});
  assert.equal(writes,0);assert.match(c.AUTOMATION_ERROR,/CLI permanece pausado/);
});
test('policy text distinguishes open, requested, confirmed closed and unreachable',()=>{
  const operations=new Map(),c=context(dashboard,['pulseCliPaused','pulsePolicyText'],{PULSE_OPERATIONS:operations});
  const item={surface:'cli',control_key:'x',process_state:'open'};
  assert.match(c.pulsePolicyText(item),/Proceso aún abierto · parada sin confirmar/);
  operations.set('x',{action:'stop',phase:'pending'});assert.match(c.pulsePolicyText(item),/Parada solicitada/);
  assert.match(c.pulsePolicyText({...item,process_state:'closed'}),/Parada confirmada/);
  operations.clear();assert.match(c.pulsePolicyText({...item,process_state:'unknown'}),/No alcanzable/);
});
test('Smith unbound task stays recorded but cannot claim running CLI; APP and history remain intact',()=>{
  const c=context(highscore,['hsWorkPolicy']);
  const task={agent:'SmithMBAPlata',state:'running',reachable:false,host:'cli',reference:'real-task',elapsed_ms:826623};
  const safe=c.hsWorkPolicy(task);assert.equal(safe.state,'assigned_stale');assert.equal(safe.activity_reason,'session_unverified');assert.equal(safe.reference,'real-task');assert.equal(safe.cli_paused,undefined);assert.equal(task.state,'running');
  const app={...task,session_surface:'app',session_state:'open',dedicated_basis:'process_birth'};
  assert.equal(c.hsWorkPolicy(app),app,'explicit bound APP wins over unrelated host');
  const cli={...app,session_surface:'cli'};assert.equal(c.hsWorkPolicy(cli).cli_paused,true);assert.equal(c.hsWorkPolicy(cli).state,'assigned_stale');
  const ended={...cli,state:'last_work',ended_at:1788597999};assert.equal(c.hsWorkPolicy(ended),ended);
});
test('operational census never turns stale or future machine inventory into confirmed closed',()=>{
  const t=Date.now()/1000,c=context(highscore,['hsOpsKey','hsOpsAge','hsOpsItems','hsOpsFind','hsOpsRow'],{claveHoraria:v=>String(v??'').toLowerCase(),datos:{presencia:[],controlMachines:[]},CLI_PENDIENTES:{}});
  for(const updated of [t-60,t+60]){
    c.datos.controlMachines=[{machine:'MacMini',updated,slots:[slot('cli')]}];const item=c.hsOpsItems()[0].items[0];
    assert.equal(item.process_state,'unknown');assert.equal(item.verified,false);assert.match(c.hsOpsRow(item),/No alcanzable · parada sin confirmar/);
  }
  c.datos.controlMachines=[{machine:'MacMini',updated:t,slots:[slot('app'),slot('cli')]}];
  let items=c.hsOpsItems()[0].items;assert.ok(items.every(r=>r.process_state==='closed'));
  assert.match(c.hsOpsRow(items.find(r=>r.host==='cli')),/Pausado por Carlos/);
  assert.match(c.hsOpsRow(items.find(r=>r.host==='app')),/▶ Arrancar/);
  c.datos.presencia=[{...row('cli'),updated:t}];assert.equal(c.hsOpsItems()[0].items.find(r=>r.host==='cli').process_state,'open');
});
test('operational and legacy command entrypoints reject CLI launch and mission before network',async()=>{
  let writes=0;const messages=[],c=context(highscore,['hsOpsOrder','hsCliOrdena','hsCliEnviaMision'],{CLI_PENDIENTES:{},hsOpsFind:()=>({...row('cli'),active:false,process_state:'closed'}),hsCliMensaje:m=>messages.push(m),fetch:()=>{writes++;}});
  c.hsOpsOrder('x','start');c.hsCliOrdena('MacMini','claude','start',true);c.hsCliEnviaMision('MacMini','claude','work');
  assert.equal(writes,0);assert.equal(messages.length,3);assert.ok(messages.every(m=>m.includes('pausado por Carlos')));
});
test('CLI pause requires a fresh same-machine safe adapter, without changing APP controls',()=>{
  for(const machines of [[],[{machine:'MBP14',updated:now,capabilities:['cli_pause_preserve_session']}],[{machine:'MacMini',updated:now-40,capabilities:['cli_pause_preserve_session']}],[{machine:'MacMini',updated:now,capabilities:[]}]]){
    const m=control.inventory({presence:[row('cli'),row('app')],controlMachines:machines},{identity,now});
    const cli=m.items.find(r=>r.surface==='cli'),app=m.items.find(r=>r.surface==='app');
    assert.equal(cli.process_state,'open');assert.equal(cli.eligible.stop,false);assert.equal(app.eligible.stop,true);
    cli.eligible.stop=true;assert.throws(()=>control.requestFor(m,cli.control_key,'stop'),/cli-pause-adapter-unavailable/);
  }
});
test('only fresh process evidence can confirm suspended CLI, while process remains open',()=>{
  const current=model([{...row('cli'),operational_state:'paused'}]).items[0];
  assert.equal(current.process_state,'open');assert.equal(current.operational_state,'paused');
  const c=context(dashboard,['pulseCliPaused','pulsePolicyText'],{PULSE_OPERATIONS:new Map()});
  assert.match(c.pulsePolicyText(current),/Pausa confirmada · proceso suspendido/);
  const stale=model([{...row('cli'),updated:now-70,operational_state:'paused'}],undefined,now-70).items[0];
  assert.equal(stale.process_state,'unknown');assert.notEqual(stale.operational_state,'paused');assert.doesNotMatch(c.pulsePolicyText(stale),/Pausa confirmada/);
});
test('held runner stays in place through the real animation loop without changing clocks or scores',()=>{
  const runner={style:{}},fill={offsetLeft:0,style:{}},classes=new Set(),attrs={'data-work-state':'assigned_stale','data-race-held':'true','data-place':'1'};
  const lane={clientWidth:200,getAttribute:k=>attrs[k],querySelector:s=>s.includes('runner')?runner:s.includes('fill')?fill:null,classList:{toggle(k,value){if(value)classes.add(k);else classes.delete(k);},remove(...keys){keys.forEach(k=>classes.delete(k));}}};
  let calls=0;const c=context(highscore,['pintaCarrera'],{document:{querySelectorAll:()=>[lane],getElementById:()=>({setAttribute(){}})},REFRESCO_MS:10000,SALIDA_CORREDOR_OFFSET_PX:12,META_CORREDOR_PX:0,RADIO_CORREDOR_PX:4,progresoCarril(){calls++;return 1;}});
  c.pintaCarrera(.5);assert.equal(runner.style.left,'12px');assert.equal(calls,0);assert.equal(classes.has('race-started'),false);assert.equal(fill.style.width,'0px');assert.equal(attrs['data-work-state'],'assigned_stale');
  assert.match(highscore,/data-race-held="true"\] \.refresh-runner \.runner-standing\{display:block!important;animation:none!important/);
});
test('verified pause ACK is terminal success without calling the process closed',async()=>{
  const m=model([row('cli')]),item=m.items.find(r=>r.surface==='cli');
  const result=await control.executeOne(m,item.control_key,'stop',{confirmed:true,send:async()=>({ok:true,status:'paused'})});
  assert.equal(result.status,'paused');
  const c=context(dashboard,['pulseOperationText','pulseOperationPhase']);assert.equal(c.pulseOperationPhase(result.status),'success');assert.equal(c.pulseOperationText({action:'stop',phase:'success',paused:true}),'Pausa confirmada');
  assert.equal(item.process_state,'open');
});
