import test from 'node:test';import assert from 'node:assert/strict';
import {openedVia,handleDemoIncidentReport,buildReportModel,brandIdFor,decodeJpeg,fetchBrand,REPORT_TO,cleanTimeline,idIotFor,defaultTelegram,aiSummary,tplus,dur} from './src/demo-incident-report.js';
import {renderMissionPdf,winAnsi} from './src/demo-report-pdf.js';
const T0=1791400000000;
const base={id:'INC-CLI001',resource:'demo:starbucks-alsea-paseo-de-gracia:pantalla-4:manual:cli-abc',subject:'Starbucks Paseo de Gracia 103 · pantalla-4 · Reproductor colgado',stage:'cerrada',priority:'alta',assignee:'Construcciones Oria',created_at:T0-600000,resolved_at:T0-60000,closed_by:'admira.store · XpaceOS Matrix · CLI',resolution:'Reinicio remoto del reproductor; la playlist arranca de nuevo.',sla:{response_min:30,resolution_min:480,responded_at:T0-590000,response_ok:true,resolution_ok:true}};
const ctx={equipo:'pantalla-4',site:{id:'s1',name:'Starbucks Paseo de Gracia',address:'Paseo de Gracia 103 · Barcelona · 08008',city:'Barcelona',brand_key:'alsea',circuit_id:'alsea_starbucks'},brand:{name:'Alsea'},
 ci:{device_id:'itil-4',itil_code:'PDG103-PAN-04',name:'Pantalla 4',orientation:'vertical',group_name:'Individual',position:'1',lifecycle:{manufacturer:'Samsung',model:'QM43C',serial:'DEMO-SN-4',purchase_date:'2024-03-12',installed_at:'2024-03-20',installed_by:'Construcciones Oria',warranty_months:36,warranty_until:'2027-03-12',warranty:'valid',warranty_days:521,status:'operational',notes:'DEMO'}},
 history:{available:true,list:[{id:'INC-CLI001',subject:base.subject,status:'resolved',created_at:T0-600000,resolved_at:T0-60000},{id:'INC-OLD1',subject:'x · pantalla-4 · HDMI suelto',status:'resolved',created_at:T0-200*86400000,resolved_at:T0-200*86400000+3600000}],events:[{ts:T0-595000,kind:'accept',author:'Construcciones Oria',text:'Aceptada'}]}};
const req=(body,origin='https://www.admira.store',method='POST')=>new Request('https://data.yokup.com/api/demo/incident-report',{method,headers:{origin,'content-type':'application/json'},body:method==='POST'?JSON.stringify(body):undefined});
function deps(inc=base){const sent=[],tg=[],keys=new Map();return {sent,tg,keys,d:{fetchIncident:async()=>inc,loadContext:async()=>ctx,fetchBrand:async()=>null,aiSummary:async()=>null,now:()=>T0,send:async(env,raw)=>{sent.push(raw);return 'cf-1';},telegram:async(env,pdf,model)=>{tg.push({pdf,model});return {sent:true,message_id:77};},rateLimit:async(env,key,limit)=>{const n=(keys.get(key)||0)+1;keys.set(key,n);if(n>limit)throw Object.assign(Error('rate'),{status:429});}}};}
test('envía el PDF sólo a Carlos (correo y Telegram), una vez por incidencia, sólo CLI demo cerradas y desde orígenes del gemelo',async()=>{
 const t=deps();let r=await handleDemoIncidentReport(req({id:'inc-cli001',to:'otro@evil.com',chat_id:'-100123',timeline:[{at:'20:59:01',text:'Cámara a la pantalla 4'}]}),{},t.d);let j=await r.json();
 assert.equal(r.status,200);assert.equal(j.to,REPORT_TO);assert.equal(j.message_id,'cf-1');assert.deepEqual(j.telegram,{sent:true,message_id:77});assert.equal(t.sent.length,1);assert.equal(t.tg.length,1);assert.ok(j.pages>=2);
 assert.match(t.sent[0],/^To: <csilvasantin@gmail\.com>$/m);assert.doesNotMatch(t.sent[0],/evil|-100123/);assert.match(t.sent[0],/application\/pdf; name="informe-INC-CLI001\.pdf"/);
 assert.equal(r.headers.get('access-control-allow-origin'),'https://www.admira.store');
 r=await handleDemoIncidentReport(req({id:'INC-CLI001'}),{},t.d);assert.equal(r.status,409);assert.equal(t.sent.length,1);assert.equal(t.tg.length,1);
 assert.equal((await handleDemoIncidentReport(req({id:'INC-CLI001'},'https://evil.example'),{},deps().d)).status,403);
 // r4: una incidencia manual del gemelo vale si se cerró desde la CLI (id explícito); si la cerró otro, no.
 assert.equal((await handleDemoIncidentReport(req({id:'INC-CLI001'}),{},deps({...base,resource:'demo:starbucks-alsea-paseo-de-gracia:pantalla-1:manual:040c',closed_by:'Sofía P. · portal'}).d)).status,403);
 assert.equal((await handleDemoIncidentReport(req({id:'INC-CLI001'}),{},deps({...base,resource:'demo:starbucks-alsea-paseo-de-gracia:pantalla-1:manual:040c'}).d)).status,200);
 assert.equal((await handleDemoIncidentReport(req({id:'INC-CLI001'}),{},deps({...base,resource:'demo:otra-tienda:pantalla-1:manual:040c'}).d)).status,403);
 assert.equal((await handleDemoIncidentReport(req({id:'INC-CLI001'}),{},deps({...base,stage:'abierta'}).d)).status,409);
 assert.equal((await handleDemoIncidentReport(req({id:'x'}),{},deps().d)).status,400);
});
test('tope de 10 informes por hora',async()=>{const t=deps();for(let i=0;i<10;i++){t.keys.delete('demo-incident-report:INC-CLI001');assert.equal((await handleDemoIncidentReport(req({id:'INC-CLI001'}),{},t.d)).status,200);}t.keys.delete('demo-incident-report:INC-CLI001');assert.equal((await handleDemoIncidentReport(req({id:'INC-CLI001'}),{},t.d)).status,429);});
test('modelo: proyecto, ubicación, activo ITIL (garantía, fallos, MTBF, idIoT), cronología T+ y plantilla sin IA',()=>{
 const m=buildReportModel(base,ctx,{now:T0,timeline:[{at:'21:00:00',text:'CLI'}]}),rows=Object.fromEntries(m.asset.rows);
 assert.equal(m.asset.idIoT,'Starbucks_PaseodeGracia_103_Pantalla_4');assert.equal(idIotFor({project:'Starbucks',address:'Paseo de Gracia 103 · Barcelona',equipo:'pantalla-1'}),'Starbucks_PaseodeGracia_103_Pantalla_1');
 assert.equal(m.asset.failuresAll,2);assert.equal(m.asset.failures90,1);assert.match(rows['Garantía'],/EN GARANTÍA · vence 12\/03\/2027/);assert.match(rows['Nota de inventario'],/DEMO/);assert.match(m.asset.mtbf,/ d$/);
 assert.deepEqual(m.timeline.map(x=>x[2]),['Detectada','Abierta','Asignada','Iniciada','Resuelta']);assert.equal(m.timeline.at(-1)[0],tplus(540000));
 assert.equal(m.ai.label,'Plantilla');assert.equal(m.ai.recommendations.length,3);assert.equal(m.project[0][1],'Starbucks');assert.match(m.location.oneLine,/alsea-sbux-021/);
 assert.equal(dur(3600000+65000),'1 h 1 min');
});
test('PDF «mission report» válido, multipágina, con banda, telemetría y firmas; sin datos también sale',()=>{
 const pdf=new TextDecoder('latin1').decode(renderMissionPdf(buildReportModel(base,ctx,{now:T0,timeline:cleanTimeline([{at:'21:00',text:'Finalizar'}])})));
 assert.match(pdf,/^%PDF-1\.4/);assert.match(pdf,/%%EOF\n$/);assert.ok((pdf.match(/\/Type \/Page /g)||[]).length>=2);
 for(const s of ['INC-CLI001','DEMO // ADMIRA ','PDG103-PAN-04','Starbucks_PaseodeGracia_103_Pantalla_4','VALIDACI','PAG. 1/','Courier-Bold'])assert.ok(pdf.includes(s),s);
 const empty=new TextDecoder('latin1').decode(renderMissionPdf(buildReportModel(base,{equipo:'pantalla-4',history:{available:false,list:[],events:[]}},{now:T0})));assert.match(empty,/%%EOF\n$/);
 assert.equal(winAnsi('a→b ✓ (x)'),'a->b OK \\050x\\051');
});
test('Telegram sólo a un chat privado fijado en el secreto; IA con respaldo',async()=>{
 const pdf=new Uint8Array([37,80]),m={id:'INC-CLI001',headline:'h',status:'FINALIZADA',severity:'ALTA',slaVerdict:'EN PLAZO',duration:'9 min'};const calls=[];
 const env={TELEGRAM_BOT_TOKEN:'t',DEMO_REPORT_TELEGRAM_CHAT_ID:'123456789',TELEGRAM_FETCH:async(url,opt)=>{calls.push([url,opt.body.get('chat_id')]);return new Response(JSON.stringify({ok:true,result:{message_id:9}}));}};
 assert.deepEqual(await defaultTelegram(env,pdf,m),{sent:true,message_id:9});assert.equal(calls[0][1],'123456789');assert.match(calls[0][0],/sendDocument$/);
 assert.equal((await defaultTelegram({...env,DEMO_REPORT_TELEGRAM_CHAT_ID:'-1001234'},pdf,m)).reason,'chat_no_privado');
 assert.equal((await defaultTelegram({},pdf,m)).reason,'telegram_no_configurado');
 const model=buildReportModel(base,ctx,{now:T0});
 const ok=await aiSummary({AI:{run:async()=>({response:'```json {"resumen":"Resumen.","causa_raiz":"Causa.","recomendaciones":["a","b","c"],"riesgo":"medio"}```'})}},model);assert.equal(ok.summary,'Resumen.');assert.equal(ok.risk,'MEDIO');
 assert.equal(await aiSummary({AI:{run:async()=>{throw Error('x');}}},model),null);assert.equal(await aiSummary({},model),null);
});

// r3 (Carlos 21:39): marca blanca del catálogo (cualquier cliente) y fotos JPEG del gemelo dentro del PDF.
const JPG='data:image/jpeg;base64,'+'/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAJABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDlKKKKD5U//9k=';
const LUMBRE={id:'lumbre',nombre:'Lumbre Café',modo:'claro',tipografia:{titulos:"Fraunces, Georgia, 'Times New Roman', serif",texto:'Inter, sans-serif',pesoTitulos:700},colores:{claro:{primario:'#3B2318',primarioTexto:'#FFFFFF',secundario:'#5A3A28',secundarioTexto:'#FFFFFF',acento:'#E0A458',fondo:'#FFFFFF',fondoAlt:'#F6EFE7',borde:'#E2D6C8',texto:'#2B1D14',textoSuave:'#6B5647',ok:'#2F7D4F',aviso:'#B7791F',error:'#C0392B'}}};
test('marca blanca del catálogo y fotos del gemelo: tema, tipografía, logo e imágenes JPEG',async()=>{
 assert.equal(brandIdFor('','demo:starbucks-alsea-paseo-de-gracia:pantalla-4:manual:cli-x'),'starbucks');assert.equal(brandIdFor('../etc','demo:frescaria-centro:pantalla-2'),'frescaria');assert.equal(brandIdFor('Lumbre','x'),'lumbre');
 assert.equal(decodeJpeg('data:image/png;base64,iVBORw0KGgo='),null);assert.equal(decodeJpeg('data:image/jpeg;base64,AAAA'),null);const img=decodeJpeg(JPG);assert.equal(img.w,16);assert.equal(img.h,9);assert.equal(img.comps,3);
 assert.equal(await fetchBrand('../x'),null);let asked='';assert.equal((await fetchBrand('lumbre',{fetcher:async u=>{asked=u;return new Response(JSON.stringify(LUMBRE));}})).id,'lumbre');assert.match(asked,/admiranext\.com\/marcablanca\/api\/marcas\/lumbre$/);
 const m=buildReportModel(base,{...ctx,marca:LUMBRE},{now:T0,media:{logo:img,open:img,closed:img,openAt:base.created_at+5000,closedAt:base.resolved_at}});
 assert.equal(m.theme.id,'lumbre');assert.equal(m.theme.titleFont,'F5');assert.equal(m.photos.length,2);assert.match(m.classification,/LUMBRE CAF/);assert.ok(m.project.some(r=>r[0]==='Marca blanca'&&/admiranext/.test(r[1])));
 const pdf=new TextDecoder('latin1').decode(renderMissionPdf(m));
 for(const s of ['/Subtype /Image','/DCTDecode','/Im0 Do','/F5 ','Times-Bold','0.231 0.137 0.094 rg','CERRADA','ABIERTA'])assert.ok(pdf.includes(s),s);
 assert.equal((pdf.match(/\/Subtype \/Image/g)||[]).length,1,'la misma imagen se incrusta una vez');assert.match(pdf,/%%EOF\n$/);
 // El handler acepta logo y fotos del gemelo y devuelve la marca usada; un PNG o basura se ignora.
 const t=deps();t.d.fetchBrand=async id=>id==='starbucks'?{...LUMBRE,id:'starbucks',nombre:'Starbucks'}:null;
 const r=await handleDemoIncidentReport(req({id:'INC-CLI001',logo:JPG,photos:{open:JPG,closed:'data:image/png;base64,xx',open_at:base.created_at+1000}}),{},t.d);const j=await r.json();
 assert.equal(j.brand,'starbucks');assert.equal(j.photos,1);assert.equal(j.logo,true);
});
test('r4: cómo se abrió la incidencia (CLI, panel manual o automática)',()=>{assert.equal(openedVia('demo:s:pantalla-1:manual:cli-x'),'cli');assert.equal(openedVia('demo:s:pantalla-1:manual:040c'),'manual');assert.equal(openedVia('demo:s:pantalla-1'),'auto');
 const m=buildReportModel({...base,resource:'demo:starbucks-alsea-paseo-de-gracia:pantalla-1:manual:040c'},ctx,{now:T0});assert.match(m.incident.find(r=>r[0]==='Abierta')[1],/panel «Incidencia» del gemelo/);});
