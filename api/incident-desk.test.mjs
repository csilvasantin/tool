import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup,call,account} from './test-fixture.mjs';
import {handleRetailer} from './src/retailer-portal.js';
import {dispatchNotifications} from './src/installer-portal.js';
import {sweepDesk,handleDesk,sendPushAlerts,clocks,effectiveRadius} from './src/incident-desk.js';

// Yokup Desk (FLT-100938 · FLT-100940): despacho dual, relojes, candado de cierre, push y KB.
const EV = 'https://evidencia.test/cierre.jpg';
async function retail(env,path,body,cookie,method=body?'POST':'GET'){
 const r=await handleRetailer(new Request('https://data.yokup.com/api/retailer'+path,{method,headers:{Origin:'https://www.yokup.com','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined}),env);
 return {status:r.status,body:await r.json()};
}
// El helper de registro del comercio devuelve la cookie en la cabecera: la recogemos aquí.
async function retailer(env,skill='audio'){
 const reg=await handleRetailer(new Request('https://data.yokup.com/api/retailer/register',{method:'POST',headers:{Origin:'https://www.yokup.com','Content-Type':'application/json'},body:JSON.stringify({name:'Comercio',email:crypto.randomUUID()+'@example.test',password:'retailer-test-password'})}),env);
 const cookie=reg.headers.get('set-cookie').split(';')[0];
 const site=await retail(env,'/sites',{name:'Estanco',kind:'tobacco',country:'ES',city:'Barcelona',address:'Calle de prueba 1',latitude:41.3874,longitude:2.1686},cookie);
 const device=await retail(env,'/devices',{site_id:site.body.id,name:'Equipo',skill},cookie);
 return {cookie,device:device.body.id};
}
const incident=(device,extra={})=>({device_id:device,title:'No funciona el equipo',description:'El equipo dejó de funcionar esta mañana.',priority:'normal',request_key:crypto.randomUUID(),...extra});
const timeline=(db,id)=>db.prepare('SELECT kind,detail FROM incident_timeline WHERE incident_id=? ORDER BY created_at').all(id).map(r=>r.kind);
const desk=(env,path,body,token)=>handleDesk(new Request('https://data.yokup.com/api/desk'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined}),env).then(async r=>({status:r.status,body:await r.json()}));

test('campo: sin aceptar en X min se abre otra ronda con más radio, y tras la tercera se escala', async () => {
 const {env,db}=setup(); const {cookie,device}=await retailer(env);
 // Instalador a ~50 km: fuera de su radio de 40 km en la ronda 1, dentro en la 2 (×1,5 = 60 km).
 const far=await call(env,'/register',account({skills:['audio'],latitude:41.3874+0.45,longitude:2.1686}));
 const id=(await retail(env,'/incidents',incident(device),cookie)).body.id;
 assert.equal((await call(env,'/inbox',undefined,far.cookie)).body.notifications.length,0,'ronda 1: fuera de radio');
 assert.equal((await call(env,`/incidents/${id}/accept`,{},far.cookie)).status,403);
 const {acceptMs}=clocks(env); const t0=db.prepare('SELECT created_at FROM installer_incidents WHERE id=?').get(id).created_at;
 assert.equal((await sweepDesk(env,t0+acceptMs-1000)).reassigned,0,'antes de X min no se toca');
 assert.equal((await sweepDesk(env,t0+acceptMs+1000)).reassigned,1);
 await dispatchNotifications(env);
 assert.equal((await call(env,'/inbox',undefined,far.cookie)).body.notifications.length,1,'ronda 2: ya le llega');
 assert.equal(effectiveRadius(40,2),60);
 await sweepDesk(env,t0+2*acceptMs+2000); const e=await sweepDesk(env,t0+3*acceptMs+3000);
 assert.equal(e.escalated,1,'tras la ronda 3 sin aceptar, escalada');
 assert.deepEqual(timeline(db,id),['reasignada','reasignada','escalada']);
 assert.equal((await sweepDesk(env,t0+9*acceptMs)).escalated,0,'se escala una sola vez');
});

test('asignada sin avance en Y min se escala; dar avance reinicia el reloj', async () => {
 const {env,db}=setup(); const {cookie,device}=await retailer(env);
 const tech=await call(env,'/register',account({skills:['audio']}));
 const id=(await retail(env,'/incidents',incident(device),cookie)).body.id;
 assert.equal((await call(env,`/incidents/${id}/accept`,{},tech.cookie)).status,200);
 const {progressMs}=clocks(env), now=Date.now();
 // Aceptada hace más de Y min: sin avance, se escalaría ya.
 db.prepare('UPDATE installer_incidents SET assigned_at=? WHERE id=?').run(now-progressMs-60000,id);
 assert.equal((await call(env,`/incidents/${id}/progress`,{note:'Voy de camino con el recambio.'},tech.cookie)).status,200);
 const p=db.prepare('SELECT last_progress_at FROM installer_incidents WHERE id=?').get(id).last_progress_at;
 assert.equal((await sweepDesk(env,p+60000)).escalated,0,'el avance reciente reinicia el reloj');
 assert.equal((await sweepDesk(env,p+progressMs+60000)).escalated,1,'sin más avance en Y min, escala');
 assert.ok(timeline(db,id).includes('avance') && timeline(db,id).includes('escalada'));
});

test('digital: no va a instaladores; se encarga a un DeepAgent por el bot-inbox y cierra por la API del Desk', async () => {
 const {env,db}=setup(); const {cookie,device}=await retailer(env,'screen');
 const tech=await call(env,'/register',account({skills:['screen']}));
 const sent=[]; const baseFetch=env.FETCH;
 env.FETCH=async(url,init)=>{ if(String(url).includes('/api/bot-inbox')){sent.push(JSON.parse(init.body));return {ok:true,status:200};} return baseFetch(url,init); };
 // Sin clave: no sale y lo deja escrito; pasado X min, escala.
 const created=await retail(env,'/incidents',incident(device,{channel:'digital',title:'La web del comercio no carga'}),cookie);
 assert.equal(created.body.channel,'digital'); const id=created.body.id;
 assert.equal((await call(env,'/inbox',undefined,tech.cookie)).body.notifications.length,0,'lo digital no se ofrece a instaladores');
 assert.equal(sent.length,0); assert.ok(timeline(db,id).includes('sin_entrega'));
 // Con la clave de agentes: entregado a Smith.
 env.DEEPAGENT_PANEL_KEY='panel-test-key';
 assert.equal((await sweepDesk(env)).delivered,1);
 assert.equal(sent[0].target_persona,'Smith'); assert.equal(sent[0].project_id,'yokup'); assert.match(sent[0].text,/CON EVIDENCIA/);
 const row=db.prepare('SELECT status,installer_id,deepagent FROM installer_incidents WHERE id=?').get(id);
 assert.deepEqual([row.status,row.installer_id,row.deepagent],['assigned','deepagent:smith','Smith']);
 assert.equal((await desk(env,`/incidents/${id}/resolve`,{resolution:'Certificado renovado y web verificada.',evidence_url:EV})).status,401,'sin clave no');
 assert.equal((await desk(env,`/incidents/${id}/progress`,{note:'Revisando el certificado.'},'panel-test-key')).status,200);
 assert.equal((await desk(env,`/incidents/${id}/resolve`,{resolution:'Certificado TLS renovado y web verificada desde fuera.',evidence_url:'https://evidencia.test/web-ok'},'panel-test-key')).status,200);
 const view=await desk(env,`/incidents/${id}`,undefined,'panel-test-key');
 assert.equal(view.body.incident.status,'resolved'); assert.deepEqual(view.body.timeline.map(t=>t.kind),['sin_entrega','asignada','avance','resuelta','valoracion_pedida']);
});

test('candado de «Resuelta»: sin evidencia viva no se cierra, y no se sondea la URL de quien no es el dueño', async () => {
 const {env,db}=setup(); const {cookie,device}=await retailer(env);
 const a=await call(env,'/register',account({skills:['audio']})), b=await call(env,'/register',account({skills:['audio']}));
 const id=(await retail(env,'/incidents',incident(device),cookie)).body.id;
 await call(env,`/incidents/${id}/accept`,{},a.cookie);
 const probes=[]; const baseFetch=env.FETCH; env.FETCH=async(u,i)=>{probes.push(String(u));return baseFetch(u,i);};
 const resolution='Amplificador sustituido y reproducción comprobada.';
 assert.equal((await call(env,`/incidents/${id}/resolve`,{resolution,evidence_url:EV},b.cookie)).status,409);
 assert.equal(probes.length,0,'no se visita la URL de quien no puede cerrar');
 assert.equal((await call(env,`/incidents/${id}/resolve`,{resolution},a.cookie)).status,422,'sin evidencia');
 assert.equal((await call(env,`/incidents/${id}/resolve`,{resolution,evidence_url:'http://evidencia.test/x'},a.cookie)).status,422,'solo https');
 assert.equal((await call(env,`/incidents/${id}/resolve`,{resolution,evidence_url:'https://evidencia.caida/x'},a.cookie)).status,422,'URL que no responde');
 assert.equal((await call(env,`/incidents/${id}/resolve`,{resolution,evidence_url:'https://127.0.0.1/x'},a.cookie)).status,422,'nada privado');
 assert.equal((await call(env,`/incidents/${id}/resolve`,{resolution,evidence_url:EV},a.cookie)).status,200);
 const row=db.prepare('SELECT status,evidence_url,rating_requested_at FROM installer_incidents WHERE id=?').get(id);
 assert.equal(row.status,'resolved'); assert.equal(row.evidence_url,EV); assert.ok(row.rating_requested_at);
});

test('valoración: ≥4★ y satisfecho alimenta la KB; insatisfecho reabre como revisión del mismo canal', async () => {
 const {env,db}=setup(); const {cookie,device}=await retailer(env);
 const tech=await call(env,'/register',account({skills:['audio']}));
 const good=(await retail(env,'/incidents',incident(device),cookie)).body.id;
 await call(env,`/incidents/${good}/accept`,{},tech.cookie);
 await call(env,`/incidents/${good}/resolve`,{resolution:'Cable de altavoz sustituido y audio comprobado.',evidence_url:EV},tech.cookie);
 assert.equal((await retail(env,`/incidents/${good}/rating`,{stars:5,satisfied:true,comment:'Perfecto.'},cookie)).status,201);
 const kb=(await call(env,'/kb',undefined,tech.cookie)).body.items;
 assert.equal(kb.length,1); assert.equal(kb[0].evidence_url,EV); assert.equal(kb[0].skill,'audio');
 const bad=(await retail(env,'/incidents',incident(device,{title:'Vuelve a fallar'}),cookie)).body.id;
 await call(env,`/incidents/${bad}/accept`,{},tech.cookie);
 await call(env,`/incidents/${bad}/resolve`,{resolution:'Reinicio del amplificador y prueba de sonido.',evidence_url:EV},tech.cookie);
 const r=await retail(env,`/incidents/${bad}/rating`,{stars:2,satisfied:false,comment:'Sigue sin sonar por la tarde.'},cookie);
 assert.equal(r.status,201);
 assert.equal(db.prepare('SELECT channel,status FROM installer_incidents WHERE id=?').get(r.body.followup_id).status,'open');
 assert.ok(timeline(db,bad).includes('reabierta'));
 assert.equal((await call(env,'/kb',undefined,tech.cookie)).body.items.length,1,'un mal cierre no entra en la KB');
});

test('push: el instalador se suscribe, recibe un aviso VAPID sin carga útil y el service worker lo lee con el portal cerrado', async () => {
 const {env}=setup(); const {cookie,device}=await retailer(env);
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 env.VAPID_PRIVATE=JSON.stringify(await crypto.subtle.exportKey('jwk',pair.privateKey)); env.VAPID_PUBLIC='BTestPublicKey';
 const tech=await call(env,'/register',account({skills:['audio']}));
 const endpoint='https://push.example.test/sub/abc';
 assert.equal((await call(env,'/push/key')).body.enabled,true);
 assert.equal((await call(env,'/push/subscribe',{endpoint})).status,401,'suscribirse exige sesión');
 assert.equal((await call(env,'/push/subscribe',{subscription:{endpoint}},tech.cookie)).status,201);
 const pushes=[]; const baseFetch=env.FETCH;
 env.FETCH=async(u,i)=>{ if(String(u)===endpoint){pushes.push(i);return {ok:true,status:201};} return baseFetch(u,i); };
 await retail(env,'/incidents',incident(device,{title:'Altavoz mudo'}),cookie);
 assert.equal(pushes.length,1,'un push por aviso nuevo');
 assert.match(pushes[0].headers.Authorization,/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=BTestPublicKey$/);
 assert.equal(pushes[0].body,undefined,'sin carga útil');
 assert.equal(await sendPushAlerts(env),0,'no se repite');
 const peek=await call(env,'/push/peek',{endpoint});
 assert.equal(peek.status,200); assert.equal(peek.body.items[0].title,'Altavoz mudo');
 assert.equal((await call(env,'/push/peek',{endpoint:'https://push.example.test/otro'})).status,404);
 // Suscripción caducada (410): se borra y ese aviso queda para reintentar por otra vía.
 env.FETCH=async(u,i)=>String(u)===endpoint?{ok:false,status:410}:baseFetch(u,i);
 const other=await retailer(env); await retail(env,'/incidents',incident(other.device,{title:'Otro'}),other.cookie);
 assert.equal((await call(env,'/push/peek',{endpoint})).status,404,'la suscripción caducada ya no existe');
});
