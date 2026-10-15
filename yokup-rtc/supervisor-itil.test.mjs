import test from "node:test";
import assert from "node:assert/strict";
import { handleSupervisorItil } from "./src/supervisor-itil.js";

const ci = { itil_code:"PDG103-TPV-01", name:"TPV", category:"tpv", managed_by:"itil", open_incidents:2,
  lifecycle:{ status:"operational", warranty:"valid", serial:"PRIVATE", invoice_ref:"PRIVATE" },
  network:null, updated_by:"private@example.com" };
const json = (body, status=200) => Response.json(body,{status});
function invoke({ method="GET", access={allowed:true,canChangeProject:true}, session={email:"supervisor@example.com"}, store="alsea-sbux-021", payload, status=200 }={}) {
  const calls=[];
  const env={ INCIDENT_DESK:{fetch:async req=>{ calls.push(req.url); return json(payload || {ok:true,site:{name:"Starbucks"},xpacio:{admira_store_id:store},cis:[ci]},status); }} };
  return handleSupervisorItil(new Request("https://api.admira.app/supervisor/itil?xpacio="+encodeURIComponent(store),{method}),env,{access,session,json}).then(async r=>({status:r.status,body:await r.json(),headers:r.headers,calls}));
}
test("lectura privilegiada conserva códigos y elimina datos privados",async()=>{
  const r=await invoke(); assert.equal(r.status,200); assert.equal(r.body.cis[0].code,"PDG103-TPV-01");
  assert.equal(r.body.cis[0].open_incidents,2); assert.doesNotMatch(JSON.stringify(r.body),/PRIVATE|private@example/);
  assert.equal(r.headers.get("cache-control"),"no-store"); assert.equal(r.calls.length,1);
});
test("sesión ordinaria o directorio incompleto falla sin consultar inventario",async()=>{
  for(const access of [{allowed:true,canChangeProject:false},{allowed:false,canChangeProject:true},null]){
    const r=await invoke({access});assert.equal(r.status,403);assert.equal(r.calls.length,0);
  }
});
test("entrada oficial de agentes admite sólo la lectura saneada",async()=>{
  const r=await invoke({session:{email:"agentes@silicio.admiranext.com"},access:null});assert.equal(r.status,200);
  assert.equal((await invoke({method:"POST",session:{email:"agentes@silicio.admiranext.com"}})).status,405);
});
test("rechaza identificador inválido y fallo del maestro; no inventa inventario",async()=>{
  const invalid=await invoke({store:"../private"});assert.equal(invalid.status,400);assert.equal(invalid.calls.length,0);
  assert.equal((await invoke({status:404,payload:{ok:false}})).status,404);
  assert.equal((await invoke({payload:{ok:true,xpacio:{admira_store_id:"other"},cis:[ci]}})).status,502);
});
test("elimina equipos retirados y conserva sin dato en el estado desconocido",async()=>{
  const r=await invoke({payload:{ok:true,xpacio:{admira_store_id:"alsea-sbux-021"},cis:[{...ci,lifecycle:{status:"retired"}},{...ci,lifecycle:{}}]}});
  assert.equal(r.body.cis.length,1);assert.equal(r.body.cis[0].status,"unknown");
});
