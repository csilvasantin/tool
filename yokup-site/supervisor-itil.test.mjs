import test from "node:test";
import assert from "node:assert/strict";
import {attentionReasons,filterInventory,observationFreshness,inventoryCsv} from "./yk-supervisor-itil-model.js";
test("una lectura caducada o sin fecha nunca es estado reciente",()=>{
  const now=Date.now();assert.equal(observationFreshness(now-91000,now).fresh,false);
  assert.equal(observationFreshness(null,now).fresh,false);assert.equal(observationFreshness(now+60000,now).fresh,false);
  assert.equal(observationFreshness(now-5000,now).fresh,true);
});
test("filtros cruzan identidad, tipo y señales ITIL sin inferir conexión",()=>{
  const cis=[{name:"Cámara TPV",code:"PDG103-TPV-01",category:"tpv",warranty:"expired"},{name:"Pantalla",code:"PDG103-PAN-01",category:"pantalla",status:"operational"}];
  assert.equal(filterInventory(cis,{search:"camara",category:"tpv",attention:true}).length,1);
  assert.equal(filterInventory(cis,{search:"PDG103",category:"pantalla",attention:true}).length,0);
  assert.equal(attentionReasons(cis[1]).length,0);
});
test("CSV conserva procedencia y neutraliza fórmulas en campos de inventario",()=>{
  const csv=inventoryCsv([{name:'=HYPERLINK("bad")',code:"AA-BB",network:{source:"simulated"}}],{xpacio:{id:"store"},generated_at:"2026-10-15T18:00:00Z"});
  assert.match(csv,/sin telemetría|no telemetría/);assert.match(csv,/'=HYPERLINK/);assert.match(csv,/simulated/);assert.match(csv,/2026-10-15T18:00:00Z/);
});
