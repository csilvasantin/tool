import test from "node:test";
import assert from "node:assert/strict";
import control from "./agent-control.js";
import identity from "./yk-agent-identity.js";
import detail from "./agent-detail.js";

const NOW=10_000;
const slot=(persona,runtime,host,session_id,extra={})=>({persona,runtime,host,session_id,...extra});
const machine=(name,slots)=>({machine:name,slots});
const live=(persona,runtime,host,session_id,pid,extra={})=>({persona,machine:"MacMini",runtime,host,session_id,pid,
  updated:NOW-2,verified:1,source:"process_snapshot",online:true,...extra});
const build=(presence,controlMachines)=>control.inventory({presence,controlMachines},{identity,detailUrl:detail.detailUrl,now:NOW});

test("fusiona activos y configurados detenidos sin perder el enlace público",()=>{
  const model=build([
    live("Oraculo","Codex","cli","oraculo",101),
  ],[machine("MacMini",[
    slot("Oraculo","Codex","cli","oraculo"),
    slot("Neo","Claude","app","desktop:claude"),
  ])]);
  const active=model.items.find(item=>item.agent==="OraculoMacMini"),stopped=model.items.find(item=>item.agent==="NeoMacMini");
  assert.equal(active.state,"active");assert.deepEqual(active.eligible,{start:false,stop:true});
  assert.equal(stopped.state,"stopped");assert.deepEqual(stopped.eligible,{start:true,stop:false});
  assert.equal(stopped.detail_url,"/agentDetail?agent=Neo&machine=MacMini&runtime=Claude&surface=app");
  assert.deepEqual(model.counts,{total:2,active:1,stopped:1,unknown:0,ambiguous:0,startable:1,stoppable:1});
});

test("unknown, no verificado, obsoleto y ambiguo siguen visibles pero nunca son elegibles",()=>{
  const model=build([
    live("Smith","Grok","","smith",201),
    live("Neo","Claude","app","desktop:claude",202,{verified:0}),
    live("Morfeo","Claude","cli","morfeo",203,{updated:NOW-40}),
    live("Trinity","Codex","cli","one",204),live("Trinity","Codex","cli","two",205),
  ],[machine("MacMini",[
    slot("Neo","Claude","app","desktop:claude"),slot("Morfeo","Claude","cli","morfeo")
  ])]);
  const unsafe=model.items.filter(item=>["unknown","ambiguous"].includes(item.state));
  assert.equal(unsafe.length,4);
  assert.ok(unsafe.every(item=>item.eligible.start===false&&item.eligible.stop===false));
  assert.equal(model.items.find(item=>item.agent==="SmithMacMini").reason,"unknown-surface");
  assert.equal(model.items.find(item=>item.agent==="TrinityMacMini").reason,"ambiguous-target");
});

test("deduplica aliases y no expone session_id ni PID en el modelo público",()=>{
  const model=build([
    live("Oráculo","Codex","app","desktop:codex",301),
    live("OraculoMacMini","Codex","app","desktop:codex",301,{updated:NOW-1}),
  ],[machine("admira-macmini",[
    slot("Oraculo","Codex","app","desktop:codex"),slot("Oráculo","Codex","app","desktop:codex")
  ])]);
  assert.equal(model.items.length,1);
  assert.equal(model.items[0].state,"active");
  const publicJson=JSON.stringify({items:model.items,counts:model.counts});
  assert.doesNotMatch(publicJson,/desktop:codex|"pid"|session_id|301/);
  assert.match(model.items[0].control_key,/^control:[a-z0-9]+$/);
});

test("agrupa cada familia por nombre base y después por máquina sin mezclar CLI y App",()=>{
  const model=build([
    live("Oraculo","Codex","cli","oraculo-16",311,{machine:"MacBook Pro 16"}),
    live("Neo","Claude","cli","neo-mini",312),
    live("OráculoMacMini","Codex","cli","oraculo-mini",313),
    live("SubOraculo","Codex","cli","sub-oraculo-14",314,{machine:"MacBookPro14"}),
    live("Neo","Claude","app","desktop:claude",315,{machine:"MacBook Pro 16"}),
    live("Oraculo","Codex","app","desktop:codex",316),
  ],[]);
  const cli=model.items.filter(item=>item.surface==="cli");
  const app=model.items.filter(item=>item.surface==="app");
  assert.deepEqual(cli.map(item=>item.agent),[
    "NeoMacMini","OraculoMacMini","SubOraculoMBP14","OraculoMBP16"
  ]);
  assert.deepEqual(cli.map(item=>item.family_key),["neo","oraculo","oraculo","oraculo"]);
  assert.deepEqual(app.map(item=>item.agent),["NeoMBP16","OraculoMacMini"]);
  assert.deepEqual(model.items.map(item=>item.surface),["cli","cli","cli","cli","app","app"]);
});

test("requestFor usa el endpoint unificado y recupera el target exacto sólo al ejecutar",()=>{
  const model=build([live("Oraculo","Codex","cli","oraculo",401)],[]),item=model.items[0];
  const request=control.requestFor(model,item.control_key,"stop");
  assert.equal(request.endpoint,"/fleet/agent/control");assert.equal(request.method,"POST");
  assert.deepEqual(request.body,{action:"stop",machine:"MacMini",persona:"Oraculo",runtime:"Codex",host:"cli",session_id:"oraculo",pid:401});
  assert.throws(()=>control.requestFor(model,item.control_key,"start"),/target-not-eligible/);
});

test("la ejecución individual exige confirmación y el ledger evita duplicar la orden",async()=>{
  const model=build([], [machine("MacMini",[slot("Neo","Claude","cli","neo")])]),item=model.items[0],ledger=new Map();
  let sends=0;const send=async()=>{sends++;return{ok:true,status:"accepted",command_id:"cmd-1"};};
  const cancelled=await control.executeOne(model,item.control_key,"start",{confirmed:false,send,ledger});
  assert.equal(cancelled.error,"confirmation-required");assert.equal(sends,0);
  const first=await control.executeOne(model,item.control_key,"start",{confirmed:true,send,ledger});
  const retry=await control.executeOne(model,item.control_key,"start",{confirmed:true,send,ledger});
  assert.equal(first.ok,true);assert.equal(first.status,"accepted");assert.equal(sends,1);
  assert.equal(retry.reused,true);assert.equal(retry.command_id,"cmd-1");
});

test("el plan masivo toma sólo elegibles de su grupo, excluye unknown y se acota a veinte",()=>{
  const cli=Array.from({length:23},(_,index)=>slot("Agent"+index,"Codex","cli","session"+index));
  const model=build([live("Unknown","Codex","","unknown",501)], [machine("MacMini",[
    ...cli,slot("Desktop","Codex","app","desktop:codex")
  ])]);
  const plan=control.batchPlan(model,"cli","start");
  assert.equal(plan.ok,true);assert.equal(plan.count,20);assert.equal(plan.truncated,true);
  assert.ok(plan.targets.every(key=>model.by_key.get(key).surface==="cli"&&model.by_key.get(key).eligible.start));
  assert.equal(control.batchPlan(model,"unknown","start").ok,false);
  assert.equal(control.limits.max_batch,20);assert.equal(control.limits.max_concurrency,4);
});

test("el batch conserva éxito parcial, error por agente, concurrencia acotada e idempotencia",async()=>{
  const model=build([], [machine("MacMini",[
    slot("Neo","Claude","cli","neo"),slot("Morfeo","Claude","cli","morfeo"),slot("Trinity","Codex","cli","trinity")
  ])]),plan=control.batchPlan(model,"cli","start"),ledger=new Map();
  let sends=0,inFlight=0,maxInFlight=0;
  const send=async request=>{sends++;inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);await Promise.resolve();inFlight--;
    if(request.body.persona==="Morfeo")throw new Error("upstream:error-with-secret?token=x");
    return {ok:true,status:"accepted",command_id:"cmd-"+request.body.persona.toLowerCase()};};
  const result=await control.executeBatch(model,plan,{confirmed:true,send,ledger,concurrency:99});
  assert.equal(result.ok,false);assert.equal(result.partial,true);assert.equal(result.total,3);
  assert.equal(result.succeeded,2);assert.equal(result.failed,1);assert.ok(maxInFlight<=4);
  assert.equal(result.results.find(row=>!row.ok).error,"transport-failed");
  assert.doesNotMatch(JSON.stringify(result),/secret|token=x/);
  const repeat=await control.executeBatch(model,plan,{confirmed:true,send,ledger,concurrency:2});
  assert.equal(sends,3);assert.ok(repeat.results.every(row=>row.reused===true));
});

test("cargar el módulo o crear un plan no ejecuta ningún transporte",()=>{
  let sends=0;const model=build([], [machine("MacMini",[slot("Neo","Claude","cli","neo")])]);
  const plan=control.batchPlan(model,"cli","start",{send:()=>sends++});
  assert.equal(plan.count,1);assert.equal(sends,0);
});

test("estado, command_id y error del transporte se reducen al vocabulario público",async()=>{
  const model=build([], [machine("MacMini",[slot("Neo","Claude","cli","neo")])]),item=model.items[0];
  const result=await control.executeOne(model,item.control_key,"start",{confirmed:true,send:async()=>({
    ok:false,status:"token=estado-secreto",command_id:"token con espacios",error:"api_key=supersecreto"
  })});
  assert.deepEqual(result,{control_key:item.control_key,action:"start",status:"rejected",ok:false,command_id:null,error:"control-rejected"});
  assert.doesNotMatch(JSON.stringify(result),/secreto|api_key|token con espacios/);
});
