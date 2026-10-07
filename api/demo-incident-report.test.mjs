import test from 'node:test';import assert from 'node:assert/strict';
import {handleDemoIncidentReport,buildReportPdf,REPORT_TO,cleanTimeline} from './src/demo-incident-report.js';
const base={id:'INC-CLI001',resource:'demo:starbucks-alsea-paseo-de-gracia:pantalla-4:manual:cli-abc',subject:'Starbucks Paseo de Gracia 103 · pantalla-4 · Reproductor colgado',stage:'cerrada',priority:'alta',created_at:1,resolved_at:600001,closed_by:'admira.store · XpaceOS Matrix',resolution:'Reinicio remoto',sla:{response_ok:true,resolution_ok:true}};
const req=(body,origin='https://www.admira.store',method='POST')=>new Request('https://data.yokup.com/api/demo/incident-report',{method,headers:{origin,'content-type':'application/json'},body:method==='POST'?JSON.stringify(body):undefined});
function deps(inc=base){const sent=[],keys=new Map();return {sent,keys,d:{fetchIncident:async()=>inc,now:()=>1791400000000,send:async(env,raw)=>{sent.push(raw);return 'cf-1';},rateLimit:async(env,key,limit)=>{const n=(keys.get(key)||0)+1;keys.set(key,n);if(n>limit)throw Object.assign(Error('rate'),{status:429});}}};}
test('envía el PDF sólo a Carlos, una vez por incidencia, sólo CLI demo cerradas y desde orígenes del gemelo',async()=>{
 const t=deps();let r=await handleDemoIncidentReport(req({id:'inc-cli001',to:'otro@evil.com',timeline:[{at:'20:59:01',text:'Cámara a la pantalla 4'}]}),{},t.d);let j=await r.json();
 assert.equal(r.status,200);assert.equal(j.to,REPORT_TO);assert.equal(j.message_id,'cf-1');assert.equal(t.sent.length,1);
 assert.match(t.sent[0],/^To: <csilvasantin@gmail\.com>$/m);assert.doesNotMatch(t.sent[0],/evil/);assert.match(t.sent[0],/application\/pdf; name="informe-INC-CLI001\.pdf"/);
 assert.equal(r.headers.get('access-control-allow-origin'),'https://www.admira.store');
 r=await handleDemoIncidentReport(req({id:'INC-CLI001'}),{},t.d);assert.equal(r.status,409);assert.equal(t.sent.length,1);
 assert.equal((await handleDemoIncidentReport(req({id:'INC-CLI001'},'https://evil.example'),{},deps().d)).status,403);
 assert.equal((await handleDemoIncidentReport(req({id:'INC-CLI001'}),{},deps({...base,resource:'demo:starbucks-alsea-paseo-de-gracia:pantalla-1:manual:040c'}).d)).status,403);
 assert.equal((await handleDemoIncidentReport(req({id:'INC-CLI001'}),{},deps({...base,stage:'abierta'}).d)).status,409);
 assert.equal((await handleDemoIncidentReport(req({id:'x'}),{},deps().d)).status,400);
});
test('tope de 10 informes por hora',async()=>{const t=deps();for(let i=0;i<10;i++){t.keys.delete('demo-incident-report:INC-CLI001');assert.equal((await handleDemoIncidentReport(req({id:'INC-CLI001'}),{},t.d)).status,200);}t.keys.delete('demo-incident-report:INC-CLI001');assert.equal((await handleDemoIncidentReport(req({id:'INC-CLI001'}),{},t.d)).status,429);});
test('el PDF es válido y lleva los datos clave',()=>{const pdf=new TextDecoder('latin1').decode(buildReportPdf(base,{timeline:cleanTimeline([{at:'21:00',text:'Finalizar'}])}));assert.match(pdf,/^%PDF-1\.4/);assert.match(pdf,/%%EOF\n$/);assert.match(pdf,/INC-CLI001/);assert.match(pdf,/Reinicio remoto/);assert.match(pdf,/Finalizar/);});
