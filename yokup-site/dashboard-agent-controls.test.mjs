import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import control from "./agent-control.js";
import identity from "./yk-agent-identity.js";
import detail from "./agent-detail.js";

const source=await readFile(new URL("./dashboard.html",import.meta.url),"utf8");

test("el Dashboard consume el contrato seguro y conserva detenidos del censo",()=>{
  assert.match(source,/src="\/agent-control\.js\?v=/);
  assert.match(source,/YkAgentControl\.inventory\(\{presence:d\.presence\|\|\[\],controlMachines:PROJECT_CONTROL_MACHINES\}/);
  const model=control.inventory({presence:[],controlMachines:[{machine:"MacMini",slots:[{persona:"Oraculo",runtime:"Codex",host:"cli",session_id:"oraculo"}]}]},
    {identity,detailUrl:detail.detailUrl,now:2_000_000_000_000});
  assert.equal(model.items.length,1);assert.equal(model.items[0].state,"stopped");assert.equal(model.items[0].eligible.start,true);
  assert.equal(Object.hasOwn(model.items[0],"session_id"),false);assert.equal(Object.hasOwn(model.items[0],"pid"),false);
  assert.equal(model.targets.get(model.items[0].control_key).session_id,"oraculo");
  assert.match(source,/data-control-key="\$\{esc\(item&&item\.control_key\|\|'\'\)\}"/);
});

test("cada superficie ofrece controles masivos y cada tarjeta un único control",()=>{
  for(const label of ["Arrancar todos los CLI","Parar todos los CLI","Arrancar todos Desktop App","Parar todos Desktop App"])
    assert.match(source,new RegExp(label));
  assert.match(source,/function pulseControlButton\(item\)/);
  assert.match(source,/data-pulse-action=/);
  assert.match(source,/data-pulse-batch=/);
  assert.match(source,/<article class="ag"[^>]*>\$\{main\}<div class="agent-control-row">/);
  assert.match(source,/event\.preventDefault\(\);event\.stopPropagation\(\)/);
});

test("toda orden exige confirmación y la ejecución usa transporte inyectado",async()=>{
  assert.match(source,/if\(!window\.confirm\(confirmation\)\)return/);
  assert.match(source,/YkAgentControl\.executeOne\(PULSE_CONTROL_MODEL,controlKey,action,options\)/);
  assert.match(source,/YkAgentControl\.executeBatch\(PULSE_CONTROL_MODEL,plan,options\)/);
  const fn=source.match(/async function pulseSendControl\(request\)\{[\s\S]*?\n\}/)?.[0];assert.ok(fn);
  const calls=[],context={fetch:async(...args)=>{calls.push(args);return {ok:true,json:async()=>({ok:true,status:"accepted",command_id:"mock-1"})};}};
  vm.runInNewContext(`${fn}\nthis.send=pulseSendControl;`,context);
  const result=await context.send({endpoint:"/fleet/agent/control",method:"POST",body:{action:"start",machine:"MacMini"}});
  assert.equal(result.command_id,"mock-1");assert.equal(calls.length,1);assert.equal(calls[0][0],"/fleet/agent/control");
  assert.equal(calls[0][1].credentials,"include");assert.equal(JSON.parse(calls[0][1].body).action,"start");
});

test("el resumen parcial es accesible y distingue fallos",()=>{
  assert.match(source,/id="pulseControlStatus" role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(source,/result\.succeeded\+"\/"\+result\.total\+" órdenes aceptadas"/);
  assert.match(source,/result\.failed\?" · "\+result\.failed\+" fallidas"/);
  assert.match(source,/error:result\.failed>0/);
});

test("densidad y visibilidad se controlan por grupo o globalmente y persisten",()=>{
  assert.match(source,/PULSE_VIEW_KEY="yk\.dashboard\.silicon-fleet\.view\.v1"/);
  assert.match(source,/localStorage\.getItem\(PULSE_VIEW_KEY\)/);
  assert.match(source,/localStorage\.setItem\(PULSE_VIEW_KEY,JSON\.stringify\(PULSE_VIEW\)\)/);
  for(const label of ["Compactar","Ampliar","Ocultar","Mostrar"])assert.match(source,new RegExp(label));
  assert.match(source,/aria-expanded="\$\{hidden\?'false':'true'\}"/);
  assert.match(source,/data-pulse-focus="view:/);
});

test("teclado, foco y móvil conservan controles táctiles inequívocos",()=>{
  assert.match(source,/type="button" class="pulse-btn/);
  assert.match(source,/data-pulse-focus="control:/);
  assert.match(source,/box\.querySelectorAll\("\[data-pulse-focus\]"\)/);
  assert.match(source,/next\.focus\(\{preventScroll:true\}\)/);
  assert.match(source,/@media\(max-width:760px\)[^{]*\{[\s\S]*?\.pulse-btn\{min-height:44px/);
});

test("la tarjeta refleja pendiente, ejecución, éxito y error sin inventar el estado final",()=>{
  const fn=source.match(/function pulseOperationPhase\(status\)\{[\s\S]*?\n\}/)?.[0];assert.ok(fn);
  const context={};vm.runInNewContext(`${fn}\nthis.phase=pulseOperationPhase;`,context);
  assert.equal(context.phase("queued"),"pending");assert.equal(context.phase("accepted"),"pending");
  assert.equal(context.phase("running"),"running");assert.equal(context.phase("stopping"),"running");
  assert.equal(context.phase("done"),"success");assert.equal(context.phase("stopped"),"success");
  assert.equal(context.phase("failed"),"error");assert.equal(context.phase("rejected"),"error");
  assert.match(source,/data-control-state="\$\{esc\(operation&&operation\.phase\|\|'idle'\)\}"/);
  assert.match(source,/Arranque pendiente|Parada pendiente/);
  assert.match(source,/Reintentar /);
});

test("las órdenes aceptadas se consultan por GET y los fallos liberan el reintento",async()=>{
  const sanitize=source.match(/function pulsePublicError\(value\)\{[\s\S]*?\n\}/)?.[0],fn=source.match(/async function pulseReadControl\(commandId\)\{[\s\S]*?\n\}/)?.[0];assert.ok(sanitize&&fn);
  const calls=[],context={encodeURIComponent,fetch:async(...args)=>{calls.push(args);return {ok:true,json:async()=>({ok:true,status:"running",command_id:"mock-1"})};}};
  vm.runInNewContext(`${sanitize}\n${fn}\nthis.read=pulseReadControl;`,context);
  const result=await context.read("mock-1");assert.equal(result.status,"running");
  assert.equal(calls[0][0],"/fleet/agent/control?id=mock-1");assert.equal(calls[0][1].credentials,"include");
  assert.match(source,/void pulsePollOperation\(result\.control_key,result\.action,operation\.command_id\)/);
  assert.match(source,/PULSE_CONTROL_LEDGER\.delete\(String\(action\|\|""\)\.toLowerCase\(\)\+":"\+controlKey\)/);
  assert.match(source,/if\(phase==="error"\)\{pulseForgetFailed/);
});

test("un error remoto con secreto o ruta falla cerrado antes de estado y DOM",async()=>{
  const phase=source.match(/function pulseOperationPhase\(status\)\{[\s\S]*?\n\}/)?.[0],sanitize=source.match(/function pulsePublicError\(value\)\{[\s\S]*?\n\}/)?.[0],forget=source.match(/function pulseForgetFailed\(action,controlKey\)\{[^\n]+/)?.[0],track=source.match(/function pulseTrackResult\(result\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(phase&&sanitize&&forget&&track);
  const operations=new Map(),ledger=new Map([["stop:control:abc",{ok:false}]]),context={PULSE_OPERATIONS:operations,PULSE_CONTROL_LEDGER:ledger,setTimeout(){},pulse(){},pulsePollOperation(){}};
  vm.runInNewContext(`${phase}\n${sanitize}\n${forget}\n${track}\nthis.track=pulseTrackResult;`,context);
  const remote="token=SUPER_SECRET /Users/private/key.pem";
  context.track({control_key:"control:abc",action:"stop",status:"failed",ok:false,error:remote});
  const operation=operations.get("control:abc"),markup=`<span>${operation.error}</span>`;
  assert.equal(operation.error,"control-failed");assert.doesNotMatch(markup,/SUPER_SECRET|Users|key\.pem/);assert.equal(ledger.has("stop:control:abc"),false);

  const read=source.match(/async function pulseReadControl\(commandId\)\{[\s\S]*?\n\}/)?.[0],readContext={encodeURIComponent,fetch:async()=>({ok:false,json:async()=>({error:remote})})};
  vm.runInNewContext(`${sanitize}\n${read}\nthis.read=pulseReadControl;`,readContext);
  await assert.rejects(()=>readContext.read("mock-2"),error=>error.message==="control-failed"&&!/SUPER_SECRET|Users/.test(error.message));
});
