import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./highscore.html",import.meta.url),"utf8");

function functionSource(name){
  const start=source.indexOf(`function ${name}(`);
  assert.notEqual(start,-1,`falta ${name}`);
  const brace=source.indexOf("{",start);
  let depth=0,quote="",escaped=false;
  for(let index=brace;index<source.length;index++){
    const char=source[index];
    if(quote){
      if(escaped)escaped=false;
      else if(char==="\\")escaped=true;
      else if(char===quote)quote="";
      continue;
    }
    if(char==='"'||char==="'"||char==='`'){quote=char;continue;}
    if(char==="{")depth++;
    else if(char==="}"&&--depth===0)return source.slice(start,index+1);
  }
  throw new Error(`funcion ${name} incompleta`);
}

function operationsApi(data){
  const functions=["hsOpsKey","hsOpsItems"].map(functionSource).join("\n");
  return new Function("datos","claveHoraria",`${functions}\nreturn {items:hsOpsItems};`)(
    data,
    value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"")
  );
}

test("el menú avanzado presenta un centro operativo compacto para DesktopAPP y CLI",()=>{
  assert.match(source,/id="cliControl"/);
  assert.match(source,/id="cliCtlTitle">Centro operativo/);
  const start=source.indexOf('<p class="cli-ctl-help">');
  const help=source.slice(start,source.indexOf("</p>",start));
  assert.match(help,/DesktopAPP/);
  assert.match(help,/CLI/);
  assert.match(help,/proceso verificado/);
  assert.ok(help.length<300,"la ayuda debe conservarse compacta");
});

test("la fuente es el snapshot de procesos y las ranuras anunciadas, nunca el catálogo histórico",()=>{
  assert.match(source,/TG\+'\/api\/presence'/);
  assert.match(source,/payload\.control_machines\|\|\[\]/);
  assert.match(source,/row&&row\.verified&&row\.source==="process_snapshot"/);
  assert.match(source,/Number\(row\.updated\|\|0\)>=now-35/);
  assert.doesNotMatch(functionSource("hsOpsItems"),/\/fleet\/cli/);
});

test("activo, parado y desconocido son hechos distintos",()=>{
  const now=Math.floor(Date.now()/1000);
  const active={machine:"MacBookAirAzul",persona:"Smith",runtime:"Grok",host:"cli",session_id:"smith",
    pid:1325,updated:now-2,verified:1,source:"process_snapshot",attached:false,project:"Yokup",task:"Prueba real"};
  const slot={persona:"Neo",runtime:"Claude",host:"app",session_id:"desktop:claude"};
  const groups=operationsApi({
    presencia:[active,{...active,machine:"Viejo",verified:0,source:"heartbeat"}],
    controlMachines:[{machine:"MacBookAirAzul",updated:now-1,slots:[slot,{persona:"Smith",runtime:"Grok",host:"cli",session_id:"smith"}]}]
  }).items();
  assert.equal(groups.length,1);
  assert.equal(groups[0].machine,"MacBookAirAzul");
  const smith=groups[0].items.find(item=>item.persona==="Smith");
  const neo=groups[0].items.find(item=>item.persona==="Neo");
  assert.equal(smith.active,true);
  assert.equal(smith.attached,false,"detached sigue siendo un CLI autónomo activo");
  assert.equal(neo.active,false,"una ranura anunciada sin proceso está parada");
  assert.equal(operationsApi({presencia:[],controlMachines:[]}).items().length,0,
    "sin watcher el estado es desconocido, no parado");
});

test("cada fila explica qué agente, superficie, proceso y trabajo hay en cada equipo",()=>{
  const row=functionSource("hsOpsRow");
  assert.match(row,/DesktopAPP/);
  assert.match(row,/autónomo \/ detached/);
  assert.match(row,/PID /);
  assert.match(row,/item\.model/);
  assert.match(row,/item\.task\|\|item\.focus/);
  assert.match(row,/item\.project/);
  assert.match(row,/item\.declared_updated/);
  assert.match(row,/hsOpsAge\(item\.updated\)/);
});

test("arrancar y detener usan la identidad exacta y esperan confirmación real",()=>{
  const order=functionSource("hsOpsOrder"),watch=functionSource("hsOpsWatch");
  assert.match(order,/fetch\(YK\+'\/fleet\/agent\/control'/);
  assert.match(order,/action:action,machine:item\.machine,persona:item\.persona,runtime:item\.runtime,host:item\.host,session_id:item\.session_id/);
  assert.match(order,/if\(action==='stop'\)body\.pid=item\.pid/);
  assert.match(order,/action==='stop'&&!confirm\(/);
  assert.match(order,/result\.payload\.status==='already_running'/);
  assert.match(watch,/item&&item\.active===wanted/);
  assert.match(watch,/setTimeout\(function\(\)/);
  assert.match(watch,/,2000\)/);
  assert.match(order,/Date\.now\(\)\+45000/);
  assert.match(watch,/no como hecha/);
});

test("la sección y cada equipo permanecen plegables con recuento visible",()=>{
  assert.match(source,/id="cliCtlToggle" aria-expanded="false"/);
  assert.match(source,/id="cliCtlBody" hidden/);
  assert.match(source,/active\+' activos · '\+groups\.length\+' eq'/);
  assert.match(source,/data-cli-maquina=/);
  assert.match(source,/activeGroup\+'\/'\+group\.items\.length/);
});
