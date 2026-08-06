import test from "node:test";
import assert from "node:assert/strict";
import worker from "./src/index.js";

function harness() {
  const state={writes:[],ticket:{id:"FLT-77",assignee:"OraculoMacMini",loc:"Mac Mini",screen:"Encargo #77",created_at:Date.now()-1000,status:"open"}};
  const DB={
    async exec(){},
    prepare(sql){
      return {
        bind(...args){
          return {
            async first(){
              if(sql.includes("SELECT id,assignee,loc,screen,created_at,status FROM tickets"))return {...state.ticket};
              return null;
            },
            async all(){return{results:[]};},
            async run(){
              if(sql.includes("live_surface=?,live_context=?")){
                state.writes.push({image:args[0],captured_at:args[1],kind:args[2],surface:args[3],context:args[4]});
                state.ticket.status="in_progress";
              }
              return{meta:{changes:1}};
            }
          }
        }
      };
    }
  };
  const env={DB,MEDIA:{async head(){return{httpMetadata:{contentType:"image/png"}};}}};
  return{env,state};
}

function request(overrides={}){
  return new Request("https://yokup.test/fleet/progress",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
    mission:"FLT-77",owner:"SubOraculoMacMini",image:"https://yokup.test/media/fleet/process.png",
    captured_at:Date.now(),evidence_kind:"process",...overrides
  })});
}

for(const [surface,context] of [["desktop","request"],["cli","command_output"]]){
  test(`acepta y persiste proceso ${surface}/${context}`,async()=>{
    const {env,state}=harness(),response=await worker.fetch(request({capture_surface:surface,capture_context:context}),env,{});
    const body=await response.json();
    assert.equal(response.status,200,JSON.stringify(body));
    assert.equal(body.evidence_updated,true);
    assert.equal(body.capture_surface,surface);
    assert.equal(body.capture_context,context);
    assert.deepEqual(state.writes.map(x=>[x.kind,x.surface,x.context]),[["process",surface,context]]);
  });
}

test("rechaza process sin declaración de procedencia antes de escribir",async()=>{
  const {env,state}=harness(),response=await worker.fetch(request(),env,{}),body=await response.json();
  assert.equal(response.status,400);
  assert.equal(body.code,"process_provenance_missing");
  assert.deepEqual(body.missing,["capture_surface","capture_context"]);
  assert.match(body.error,/exige capture_surface y capture_context/);
  assert.equal(body.applied,false);
  assert.deepEqual(state.writes,[]);
});

for(const surface of ["web","result_page","browser"]){
  test(`rechaza superficie ${surface} como proceso`,async()=>{
    const {env,state}=harness(),response=await worker.fetch(request({capture_surface:surface,capture_context:"request"}),env,{}),body=await response.json();
    assert.equal(response.status,400);
    assert.equal(body.code,"process_surface_invalid");
    assert.match(body.error,/web\/result_page no son proceso/);
    assert.deepEqual(state.writes,[]);
  });
}

for(const [surface,context] of [["desktop","command_output"],["cli","request"],["cli","result_page"]]){
  test(`rechaza pareja contradictoria ${surface}/${context}`,async()=>{
    const {env,state}=harness(),response=await worker.fetch(request({capture_surface:surface,capture_context:context}),env,{}),body=await response.json();
    assert.equal(response.status,400);
    assert.equal(body.code,"process_context_invalid");
    assert.equal(body.field,"capture_context");
    assert.deepEqual(state.writes,[]);
  });
}

test("final-fallback conserva compatibilidad sin procedencia de proceso",async()=>{
  const {env,state}=harness(),response=await worker.fetch(request({evidence_kind:"final-fallback",degraded:true}),env,{}),body=await response.json();
  assert.equal(response.status,200,JSON.stringify(body));
  assert.equal(body.capture_surface,null);
  assert.equal(body.capture_context,null);
  assert.deepEqual(state.writes.map(x=>[x.kind,x.surface,x.context]),[["final-fallback",null,null]]);
});
