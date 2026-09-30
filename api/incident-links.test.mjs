// Incidencias unificadas (FLT-101298): el portal/Desk (B) ↔ la bandeja Yokup (A, yokup-rtc) por service binding.
// El binding RTC se simula con un fetch inyectado que hace de yokup-rtc.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup,call,account} from './test-fixture.mjs';
import {handleRetailer} from './src/retailer-portal.js';
import {intakeIncident} from './src/incident-desk.js';
import {dispatchNotifications} from './src/installer-portal.js';
import {syncIncidentLinks,handleIncidentLinksInternal,payloadFor,RTC_SYNC_URL} from './src/incident-links.js';
import worker from './src/index.js';
const ORIGIN='https://www.yokup.com';
async function retail(env,path,body,cookie,principal){
 const r=await handleRetailer(new Request('https://data.yokup.com/api/retailer'+path,{method:body?'POST':'GET',headers:{Origin:ORIGIN,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined}),env,principal);
 return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
async function shop(env){
 const email=crypto.randomUUID()+'@example.test',a=await retail(env,'/register',{name:'Comercio de prueba',email,password:'retailer-test-password'});
 const site=await retail(env,'/sites',{name:'Estanco local',kind:'tobacco',country:'ES',city:'Barcelona',address:'Dirección privada 99',latitude:41.3874,longitude:2.1686},a.cookie);
 const device=await retail(env,'/devices',{site_id:site.body.id,name:'Hilo musical',skill:'audio'},a.cookie);
 return {cookie:a.cookie,email,site:site.body.id,device:device.body.id};
}
const report=(device,extra={})=>({device_id:device,title:'No suena el hilo musical',description:'El equipo dejó de reproducir música esta mañana.',priority:'urgent',request_key:crypto.randomUUID(),...extra});
// yokup-rtc simulado: un ticket por incidencia del portal (o el que ya traía), y registro de lo recibido.
function fakeRtc(){
 const tickets=new Map(),calls=[];let down=false;
 const rtc={calls,tickets,set down(v){down=v;},async fetch(request){
  if(down)throw new Error('connection refused');
  assert.equal(request.url,RTC_SYNC_URL);assert.equal(request.headers.get('cf-connecting-ip'),null);
  const p=await request.json();calls.push(p);
  const id=p.rtc_ticket_id||tickets.get(p.portal_incident_id)||'INC-'+String(tickets.size+1).padStart(4,'0');tickets.set(p.portal_incident_id,id);
  return Response.json({ok:true,ticket_id:id,status:{open:'open',assigned:'in_progress',resolved:'resolved',rated:'resolved'}[p.state]});
 }};
 return rtc;
}
const internal=(body,{host='yokup-api.internal',headers={}}={})=>new Request('https://'+host+'/internal/incident-links/rtc-status',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
const link=(db,id)=>db.prepare('SELECT * FROM incident_links WHERE installer_incident_id=?').get(id);

test('una incidencia del portal se refleja en la bandeja Yokup y su ciclo de campo viaja sin datos privados',async()=>{
 const {env,db}=setup(),rtc=fakeRtc();env.RTC=rtc;const s=await shop(env);
 const opened=await retail(env,'/incidents',report(s.device),s.cookie);assert.equal(opened.status,201);const id=opened.body.id;
 assert.deepEqual(await syncIncidentLinks(env),{pushed:1,failed:0});
 const p=rtc.calls[0];assert.equal(p.portal_incident_id,id);assert.equal(p.origin,'portal');assert.equal(p.state,'open');assert.equal(p.priority,'urgent');
 assert.deepEqual(p.site,{name:'Estanco local',establishment:'yokup-'+s.site});assert.equal(p.portal_url,'https://www.yokup.com/retailer/incidencia?id='+encodeURIComponent(id));
 const raw=JSON.stringify(p);for(const secret of [s.email,'Dirección privada 99','41.3874','password','retailer_id'])assert.ok(!raw.includes(secret),'no viaja: '+secret);
 assert.equal(link(db,id).rtc_ticket_id,'INC-0001');assert.equal(link(db,id).last_synced_state,'open');
 // Idempotente: sin cambios no se vuelve a empujar.
 assert.deepEqual(await syncIncidentLinks(env),{pushed:0,failed:0});assert.equal(rtc.calls.length,1);
 // Técnico acepta → assigned; resuelve con evidencia → resolved; el comercio valora mal → rated + revisión hija enlazada.
 const tech=await call(env,'/register',account({skills:['audio']}));await dispatchNotifications(env);
 assert.equal((await call(env,'/incidents/'+id+'/accept',{},tech.cookie)).status,200);await syncIncidentLinks(env);
 assert.equal(rtc.calls.at(-1).state,'assigned');assert.equal(rtc.calls.at(-1).technician_name,'Test Installer');assert.equal(rtc.calls.at(-1).rtc_ticket_id,'INC-0001');
 assert.equal((await call(env,'/incidents/'+id+'/resolve',{resolution:'Amplificador revisado, cable sustituido y audio comprobado.',evidence_url:'https://evidencia.test/cierre.jpg'},tech.cookie)).status,200);
 await syncIncidentLinks(env);assert.equal(rtc.calls.at(-1).state,'resolved');assert.equal(rtc.calls.at(-1).evidence_url,'https://evidencia.test/cierre.jpg');
 const rated=await retail(env,'/incidents/'+id+'/rating',{stars:2,satisfied:false,comment:'Sigue sin sonar en la sala del fondo.'},s.cookie);assert.equal(rated.status,201);
 assert.deepEqual(await syncIncidentLinks(env),{pushed:2,failed:0});
 const parent=rtc.calls.find(c=>c.portal_incident_id===id&&c.state==='rated'),child=rtc.calls.find(c=>c.portal_incident_id===rated.body.followup_id);
 assert.deepEqual(parent.rating,{stars:2,satisfied:false});assert.equal(parent.followup_id,rated.body.followup_id);assert.ok(!JSON.stringify(parent).includes('sala del fondo'),'el comentario se queda en el portal');
 assert.equal(child.parent_portal_incident_id,id);assert.equal(child.state,'open');assert.equal(child.origin,'portal');
 // La ficha del portal enseña el nº de ticket de Yokup.
 assert.equal((await retail(env,'/incidents/'+encodeURIComponent(id),undefined,s.cookie)).body.incident.yokup_ticket,'INC-0001');
});

test('si yokup-rtc no responde se reintenta con espera; sin binding no se intenta nada',async()=>{
 const {env,db}=setup(),rtc=fakeRtc(),s=await shop(env),now=Date.now();
 const id=(await retail(env,'/incidents',report(s.device),s.cookie)).body.id;
 assert.equal((await syncIncidentLinks(env,now)).skipped,'rtc_binding_missing');
 env.RTC=rtc;rtc.down=true;
 assert.deepEqual(await syncIncidentLinks(env,now),{pushed:0,failed:1});
 assert.equal(link(db,id).attempts,1);assert.equal(link(db,id).last_error,'rtc_unreachable');assert.equal(link(db,id).next_attempt_at,now+60000);
 rtc.down=false;assert.deepEqual(await syncIncidentLinks(env,now+30000),{pushed:0,failed:0});assert.equal(rtc.calls.length,0);
 assert.deepEqual(await syncIncidentLinks(env,now+61000),{pushed:1,failed:0});assert.equal(link(db,id).attempts,0);assert.equal(link(db,id).last_error,null);
 // Rechazo de A (400) también espera, y la espera crece.
 db.exec("UPDATE incident_links SET last_synced_state=NULL");env.RTC={fetch:async()=>Response.json({ok:false,error:'bad'},{status:400})};
 await syncIncidentLinks(env,now+62000);await syncIncidentLinks(env,now+62000+60001);
 assert.equal(link(db,id).attempts,2);assert.match(link(db,id).last_error,/^rtc_rejected_400/);assert.equal(link(db,id).next_attempt_at,now+62000+60001+120000);
});

test('ruta interna solo por el binding; A cierra lo que nadie ha aceptado y no puede cerrar lo que lleva un técnico',async()=>{
 const {env,db}=setup(),rtc=fakeRtc();env.RTC=rtc;const s=await shop(env),s2=await shop(env);
 const free=(await retail(env,'/incidents',report(s.device),s.cookie)).body.id,taken=(await retail(env,'/incidents',report(s2.device),s2.cookie)).body.id;
 await syncIncidentLinks(env);const ticket=link(db,free).rtc_ticket_id;
 const body={portal_incident_id:free,rtc_ticket_id:ticket,status:'cancelled',by:'Carlos',note:'Duplicada con otra avería.'};
 // Tráfico público: otro host o cabeceras del borde → 404, también a través del worker completo.
 for(const req of [internal(body,{host:'data.yokup.com'}),internal(body,{headers:{'CF-Connecting-IP':'203.0.113.9'}}),internal(body,{headers:{'CF-Ray':'abc-MAD'}})])assert.equal((await handleIncidentLinksInternal(req,env)).status,404);
 assert.equal((await worker.fetch(internal(body,{host:'data.yokup.com'}),env,{waitUntil(){}})).status,404);
 assert.equal((await handleIncidentLinksInternal(internal({...body,rtc_ticket_id:'INC-9999'}),env)).status,404);
 const r=await (await worker.fetch(internal(body),env,{waitUntil(){}})).json();
 assert.equal(r.applied,true);assert.equal(r.state,'resolved');
 const inc=db.prepare('SELECT * FROM installer_incidents WHERE id=?').get(free);assert.equal(inc.status,'resolved');assert.equal(inc.resolution,`Cancelada desde Yokup (ticket ${ticket}): Duplicada con otra avería.`);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM incident_timeline WHERE incident_id=? AND kind='cerrada_yokup'").get(free).n,1);
 // Anti-bucle: el cierre que vino de A queda acordado y no se le devuelve.
 assert.equal(link(db,free).last_synced_state,'resolved');const before=rtc.calls.length;await syncIncidentLinks(env);
 assert.equal(rtc.calls.filter(c=>c.portal_incident_id===free).length,1);assert.equal(rtc.calls.length,before);
 // Repetir el cierre no hace nada nuevo.
 assert.equal((await (await handleIncidentLinksInternal(internal(body),env)).json()).applied,false);
 // Con técnico asignado, A no cierra: responde 'assigned' y el técnico lo cerrará con evidencia.
 const tech=await call(env,'/register',account({skills:['audio']}));await dispatchNotifications(env);assert.equal((await call(env,'/incidents/'+taken+'/accept',{},tech.cookie)).status,200);
 const refused=await (await handleIncidentLinksInternal(internal({portal_incident_id:taken,rtc_ticket_id:link(db,taken).rtc_ticket_id,status:'resolved'}),env)).json();
 assert.equal(refused.applied,false);assert.equal(refused.state,'assigned');assert.equal(refused.technician_name,'Test Installer');
 assert.equal(db.prepare('SELECT status FROM installer_incidents WHERE id=?').get(taken).status,'assigned');
 assert.equal(link(db,taken).last_synced_state,'assigned');
});

test('las escrituras del portal disparan la sincronización tras responder (ctx.waitUntil)',async()=>{
 const {env}=setup(),rtc=fakeRtc();env.RTC=rtc;const s=await shop(env),pending=[];
 const res=await worker.fetch(new Request('https://data.yokup.com/api/retailer/incidents',{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json',Cookie:s.cookie},body:JSON.stringify(report(s.device))}),env,{waitUntil:p=>pending.push(p)});
 assert.equal(res.status,201);await Promise.all(pending);
 assert.equal(rtc.calls.length,1);assert.equal(rtc.calls[0].portal_incident_id,(await res.json()).id);
 pending.length=0;await worker.fetch(new Request('https://data.yokup.com/api/retailer/dashboard',{headers:{Cookie:s.cookie}}),env,{waitUntil:p=>pending.push(p)});assert.equal(pending.length,0,'una lectura no sincroniza');
});

function xpacio(db){
 const now=Date.now(),retailer=crypto.randomUUID(),site=crypto.randomUUID();
 db.prepare("INSERT INTO retailer_accounts(id,email,name,password_hash,salt,created_at) VALUES(?,?,?,'!xpacio-brand-sin-acceso','-',?)").run(retailer,'marca+alsea@cuentas.yokup.com','Alsea',now);
 db.prepare("INSERT INTO retailer_sites VALUES(?,?,?,?,?,?,?,?,?,?)").run(site,retailer,'Starbucks Paseo de Gracia','hospitality','ES','Barcelona','Passeig de Gràcia 1',41.39,2.165,now);
 db.prepare("INSERT INTO admira_xpacio_sites(site_id,admira_store_id,circuit_id,brand_key,twin_url,catalog_hash,first_seen_at,last_synced_at) VALUES(?,?,?,?,?,?,?,?)").run(site,'alsea-sbux-021','alsea_starbucks','alsea','https://twin.test/021','h',now,now);
 db.prepare("INSERT INTO installer_devices(id,name,latitude,longitude,address,skill,last_seen,monitoring) VALUES('xpacio-1','Pantalla escaparate',41.39,2.165,'Passeig de Gràcia 1','screen',?,0)").run(now);
 db.prepare("INSERT INTO retailer_device_links(device_id,site_id,circuit_id,admira_store_id,admira_device_id,linked_at,created_at) VALUES('xpacio-1',?,'alsea_starbucks','alsea-sbux-021','alsea-sbux-021:pantalla-escaparate',?,?)").run(site,now,now);
 db.prepare("INSERT INTO admira_xpacio_devices(device_id,admira_store_id,surface_key,surface_name) VALUES('xpacio-1','alsea-sbux-021','pantalla-escaparate','Pantalla escaparate')").run();
 return {retailer,site,principal:{id:retailer,email:'marca+alsea@cuentas.yokup.com',name:'Alsea',access:{delegated:true,role:'manager',actor_email:'ops@yokup.test'}}};
}
const screenDown=(ticket,screen,extra={})=>({external_id:'rtc:'+ticket,channel:'campo',title:'Pantalla sin señal de emisión',description:'Player sin señal.',device:{id:'player:'+screen,name:screen,skill:'player'},admira:{store_id:'alsea-sbux-021',device_id:screen},...extra});

test('una caída de pantalla del censo cae en el equipo del comercio, la ve su portal y queda enlazada a su ticket',async()=>{
 const {env,db}=setup(),rtc=fakeRtc();env.RTC=rtc;const x=xpacio(db);
 // Superficie conocida del Xpacio (mismo slug): sin coordenadas en el encargo, usa las del establecimiento.
 const a=await intakeIncident(env,screenDown('INC-AAA1','pantalla-escaparate'));assert.equal(a.ok,true);
 assert.equal(db.prepare('SELECT device_id FROM installer_incidents WHERE id=?').get(a.id).device_id,'xpacio-1');
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM installer_devices WHERE id='player:pantalla-escaparate'").get().n,0,'no inventa equipo sintético');
 assert.deepEqual({o:link(db,a.id).origin,t:link(db,a.id).rtc_ticket_id},{o:'rtc',t:'INC-AAA1'});
 // Player del censo que el Xpacio aún no tenía: pasa a ser equipo de ese establecimiento.
 const b=await intakeIncident(env,screenDown('INC-BBB2','tcl-terminator'));
 const dev=db.prepare("SELECT d.latitude,l.site_id,l.admira_device_id FROM installer_devices d JOIN retailer_device_links l ON l.device_id=d.id WHERE d.id='player:tcl-terminator'").get();
 assert.deepEqual({...dev},{latitude:41.39,site_id:x.site,admira_device_id:'tcl-terminator'});
 // Sin comercio ni coordenadas sigue siendo un error, como antes.
 await assert.rejects(intakeIncident(env,screenDown('INC-CCC3','p-1',{admira:{store_id:'otra-tienda',device_id:'p-1'}})),/latitude/);
 // Repetir el alta no duplica nada.
 assert.equal((await intakeIncident(env,screenDown('INC-AAA1','pantalla-escaparate'))).duplicate,true);
 // El comercio (cuenta de marca, «Ver como») las ve con su nº de ticket de Yokup.
 const list=(await retail(env,'/incidents',undefined,undefined,x.principal)).body.incidents;
 assert.deepEqual(list.map(i=>i.yokup_ticket).sort(),['INC-AAA1','INC-BBB2']);
 // Y la sincronización enlaza (no crea) en A, con el establecimiento del censo como proyecto.
 await syncIncidentLinks(env);const p=rtc.calls.find(c=>c.portal_incident_id===a.id);
 assert.equal(p.origin,'rtc');assert.equal(p.rtc_ticket_id,'INC-AAA1');assert.equal(p.site.establishment,'alsea-sbux-021');assert.equal(p.site.name,'Starbucks Paseo de Gracia');
});

test('si el comercio ya la había comunicado, la caída del censo se enlaza a la suya sin abrir otra',async()=>{
 const {env,db}=setup();const x=xpacio(db);
 const own=await retail(env,'/incidents',report('xpacio-1',{title:'La pantalla del escaparate está negra'}),undefined,x.principal);assert.equal(own.status,201);
 const r=await intakeIncident(env,screenDown('INC-DDD4','pantalla-escaparate'));
 assert.equal(r.duplicate,true);assert.equal(r.id,own.body.id);assert.equal(link(db,own.body.id).rtc_ticket_id,'INC-DDD4');
 // Un enlace ya hecho no se roba.
 const again=await intakeIncident(env,screenDown('INC-EEE5','pantalla-escaparate'));assert.equal(again.id,own.body.id);assert.equal(link(db,own.body.id).rtc_ticket_id,'INC-DDD4');
});

test('conciliación: adopta altas del Desk previas por su rastro y no vuelca el histórico resuelto',async()=>{
 const {env,db}=setup(),rtc=fakeRtc();env.RTC=rtc;const s=await shop(env),now=Date.now();
 // Alta del Desk anterior al puente (sin fila de enlace): se reconoce por «automática · rtc:<ticket>».
 await intakeIncident(env,{external_id:'rtc:SVC-OLD1',channel:'campo',title:'Player caído',device:{id:'player:viejo',name:'viejo',skill:'player',latitude:41,longitude:2}});
 const desk=db.prepare("SELECT id FROM installer_incidents WHERE device_id='player:viejo'").get().id;db.exec(`DELETE FROM incident_links WHERE installer_incident_id='${desk}'`);
 // Incidencia del comercio resuelta hace una semana: no entra en la bandeja.
 db.prepare("INSERT INTO installer_incidents(id,device_id,title,reason,status,created_at,resolved_at,channel) VALUES('retail-old',?,'Vieja','retailer','resolved',?,?,'campo')").run(s.device,now-8*86400000,now-7*86400000);
 await syncIncidentLinks(env,now);
 assert.equal(link(db,desk).origin,'rtc');assert.equal(link(db,desk).rtc_ticket_id,'SVC-OLD1');assert.equal(link(db,'retail-old'),undefined);
 const p=rtc.calls.find(c=>c.portal_incident_id===desk);assert.equal(p.site,null);assert.equal(p.portal_url,null,'sin comercio no hay ficha de portal');
});

test('payloadFor limpia la marca de origen de la descripción y descarta evidencias que no son https',()=>{
 const p=payloadFor({installer_incident_id:'retail-1',origin:'portal',state:'resolved',title:'T',description:'[Origen: xpaceos] Pantalla negra',evidence_url:'http://inseguro.test/x',site_id:null});
 assert.equal(p.description,'Pantalla negra');assert.equal(p.evidence_url,null);assert.equal(p.rating,null);
});
