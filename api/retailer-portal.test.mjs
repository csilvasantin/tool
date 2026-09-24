import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {setup,call,account,event,signed} from './test-fixture.mjs';
import {handleRetailer,handleCircuit} from './src/retailer-portal.js';
import {ingestEvent,sweepInstallers} from './src/installer-portal.js';
async function retail(env,path,body,cookie,method=body?'POST':'GET'){
 const r=await handleRetailer(new Request('https://data.yokup.com/api/retailer'+path,{method,headers:{Origin:'https://www.yokup.com','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined}),env);
 return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
async function shop(env){const creds={name:'Comercio de prueba',email:crypto.randomUUID()+'@example.test',password:'retailer-test-password'};const a=await retail(env,'/register',creds);assert.equal(a.status,201);const site=await retail(env,'/sites',{name:'Estanco local',kind:'tobacco',country:'ES',city:'Barcelona',address:'Dirección local de prueba',latitude:41.3874,longitude:2.1686},a.cookie);assert.equal(site.status,201);const device=await retail(env,'/devices',{site_id:site.body.id,name:'Hilo musical',skill:'audio'},a.cookie);assert.equal(device.status,201);return {...a,creds,site:site.body.id,device:device.body.id};}
const incidentBody=device=>({device_id:device,title:'No suena el hilo musical',description:'El equipo dejó de reproducir música esta mañana.',priority:'urgent',request_key:crypto.randomUUID()});
async function circuit(env,path,body,override={}){
 const raw=JSON.stringify(body),timestamp=String(Math.floor(Date.now()/1000)),signature=createHmac('sha256',env.ADMIRA_CIRCUIT_SECRET||'missing').update(timestamp+'.POST\n/api/circuit'+path+'\n'+raw).digest('hex');
 const r=await handleCircuit(new Request('https://data.yokup.com/api/circuit'+path,{method:'POST',body:raw,headers:{'X-Admira-Timestamp':timestamp,'X-Admira-Signature':signature,...override}}),env);return {status:r.status,body:await r.json()};
}
test('retailer accounts isolated; manual equipment never generates phantom offline alerts',async()=>{
 const {env,db}=setup(),a=await shop(env),b=await shop(env);
 assert.equal((await retail(env,'/dashboard')).status,401);
 const dash=(await retail(env,'/dashboard',undefined,a.cookie)).body;assert.equal(dash.sites.length,1);assert.equal(dash.devices[0].id,a.device);
 assert.equal((await retail(env,'/incidents',incidentBody(b.device),a.cookie)).status,404);
 assert.equal((await retail(env,'/devices',{site_id:b.site,name:'Unowned',skill:'screen'},a.cookie)).status,404);
 db.exec('UPDATE installer_devices SET last_seen=0');await sweepInstallers(env);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM installer_incidents').get().n,0);
 const installer=await call(env,'/register',account());assert.equal((await retail(env,'/dashboard',undefined,installer.cookie)).status,401);
});
test('manual issue is the same installer job, with unique post-repair customer rating and reputation',async()=>{
 const {env}=setup(),a=await shop(env),tech=await call(env,'/register',account({skills:['audio']})),b=incidentBody(a.device);
 const opened=await retail(env,'/incidents',b,a.cookie);assert.equal(opened.status,201);const id=opened.body.id;
 assert.equal((await retail(env,'/incidents',b,a.cookie)).body.id,id);
 assert.equal((await retail(env,'/incidents/'+id+'/rating',{stars:5,satisfied:true,comment:''},a.cookie)).status,409);
 const inbox=(await call(env,'/inbox',undefined,tech.cookie)).body;assert.equal(inbox.notifications.length,1);assert.equal(inbox.notifications[0].id,id);assert.equal(inbox.notifications[0].description,b.description);
 assert.equal((await call(env,'/incidents/'+id+'/accept',{},tech.cookie)).status,200);
 assert.equal((await call(env,'/incidents/'+id+'/resolve',{resolution:'Amplificador revisado, cable sustituido y audio comprobado.',evidence_url:'https://evidencia.test/cierre.jpg'},tech.cookie)).status,200);
 assert.equal((await retail(env,'/dashboard',undefined,a.cookie)).body.stats.awaiting_rating,1);
 const rating={stars:5,satisfied:true,comment:'Buen servicio y equipo funcionando.'};assert.equal((await retail(env,'/incidents/'+id+'/rating',rating,a.cookie)).status,201);
 assert.equal((await retail(env,'/incidents/'+id+'/rating',rating,a.cookie)).status,409);
 const after=(await call(env,'/inbox',undefined,tech.cookie)).body;assert.equal(after.reputation.average,5);assert.equal(after.reputation.count,1);assert.equal(after.notifications[0].rating_stars,5);
 assert.equal((await retail(env,'/dashboard',undefined,a.cookie)).body.stats.awaiting_rating,0);
});
test('dissatisfied retailer creates one follow-up preserving the original repair and rating',async()=>{
 const {env,db}=setup(),a=await shop(env),other=await shop(env),tech=await call(env,'/register',account({skills:['audio']}));
 const id=(await retail(env,'/incidents',incidentBody(a.device),a.cookie)).body.id;
 await call(env,'/incidents/'+id+'/accept',{},tech.cookie);await call(env,'/incidents/'+id+'/resolve',{resolution:'Parte de prueba con comprobación de reproducción.',evidence_url:'https://evidencia.test/cierre.jpg'},tech.cookie);
 assert.equal((await retail(env,'/incidents/'+id+'/rating',{stars:2,satisfied:false,comment:'Sigue sin reproducir música.'},other.cookie)).status,404);
 assert.equal((await retail(env,'/incidents/'+id+'/rating',{stars:2,satisfied:false,comment:'No'},a.cookie)).status,400);
 const rating=await retail(env,'/incidents/'+id+'/rating',{stars:2,satisfied:false,comment:'Sigue sin reproducir música.'},a.cookie);assert.equal(rating.status,201);assert.ok(rating.body.followup_id);
 assert.equal(db.prepare('SELECT status FROM installer_incidents WHERE id=?').get(id).status,'resolved');
 assert.equal(db.prepare('SELECT status FROM installer_incidents WHERE id=?').get(rating.body.followup_id).status,'open');
 assert.equal(db.prepare('SELECT parent_incident_id FROM retailer_incident_details WHERE incident_id=?').get(rating.body.followup_id).parent_incident_id,id);
 assert.equal((await call(env,'/inbox',undefined,tech.cookie)).body.notifications.length,2);
});
test('Admira link requires trusted signature and immutable ownership; status is circuit scoped',async()=>{
 const {env}=setup(),a=await shop(env);env.ADMIRA_CIRCUIT_SECRET='local-circuit-secret';
 const link={request_id:'link-request-1234',circuit_id:'circuit-A',yokup_device_id:a.device,retailer_id:a.body.profile.id,admira_store_id:'store-A',admira_device_id:'audio-A'};
 assert.equal((await circuit(env,'/link',link,{'X-Admira-Signature':'0'.repeat(64)})).status,401);
 assert.equal((await circuit(env,'/link',link)).status,200);assert.equal((await circuit(env,'/link',link)).status,200);
 assert.equal((await circuit(env,'/link',{...link,circuit_id:'circuit-B',request_id:'another-command'})).status,409);
 assert.equal((await circuit(env,'/link',{...link,admira_store_id:'other-store',request_id:'other-store-command'})).status,409);
 const created=await retail(env,'/incidents',incidentBody(a.device),a.cookie);
 assert.equal((await circuit(env,'/status',{circuit_id:'circuit-A'})).body.incidents[0].incident_id,created.body.id);
 assert.equal((await circuit(env,'/status',{circuit_id:'circuit-B'})).body.incidents.length,0);
 delete env.ADMIRA_CIRCUIT_SECRET;assert.equal((await circuit(env,'/status',{circuit_id:'circuit-A'})).status,503);
});
test('Admira automatic event maps to the exact linked retailer device and retains a single incident',async()=>{
 const {env,db}=setup(),a=await shop(env);env.ADMIRA_CIRCUIT_SECRET='local-circuit-secret';
 await circuit(env,'/link',{request_id:'mapping-12345678',circuit_id:'circuit-A',yokup_device_id:a.device,retailer_id:a.body.profile.id,admira_store_id:'store-A',admira_device_id:'audio-A'});
 const e=event();e.device={...e.device,id:'audio-A',circuit_id:'circuit-A',skill:'audio'};
 await ingestEvent(await signed(env,e),env);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM installer_devices').get().n,1);
 assert.equal(db.prepare('SELECT device_id FROM installer_incidents').get().device_id,a.device);
 assert.equal(db.prepare('SELECT monitoring FROM installer_devices').get().monitoring,1);
 const manual=await retail(env,'/incidents',incidentBody(a.device),a.cookie);assert.equal(manual.body.duplicate,true);
 const unknown=event();unknown.device={...unknown.device,id:'unknown',circuit_id:'circuit-A'};
 await assert.rejects(async()=>ingestEvent(await signed(env,unknown),env),/no vinculado/);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM installer_devices').get().n,1);
});
test('HVAC specialist receives air conditioning issue while other specialists do not',async()=>{
 const {env}=setup(),a=await shop(env);const device=(await retail(env,'/devices',{site_id:a.site,name:'Aire acondicionado',skill:'hvac'},a.cookie)).body.id;
 const hvac=await call(env,'/register',account({skills:['hvac']})),screen=await call(env,'/register',account({skills:['screen']}));
 await retail(env,'/incidents',incidentBody(device),a.cookie);
 assert.equal((await call(env,'/inbox',undefined,hvac.cookie)).body.notifications.length,1);assert.equal((await call(env,'/inbox',undefined,screen.cookie)).body.notifications.length,0);
});
test('circuit identity cannot collide across retailers or reuse a different command payload',async()=>{
 const {env}=setup(),a=await shop(env),b=await shop(env);env.ADMIRA_CIRCUIT_SECRET='local-circuit-secret';
 const link={request_id:'mapping-collision-1',circuit_id:'A',yokup_device_id:a.device,retailer_id:a.body.profile.id,admira_store_id:'store-A',admira_device_id:'audio-A'};
 assert.equal((await circuit(env,'/link',link)).status,200);
 assert.equal((await circuit(env,'/link',{...link,yokup_device_id:b.device,retailer_id:b.body.profile.id})).status,409);
 assert.equal((await circuit(env,'/link',{...link,request_id:'mapping-collision-2',yokup_device_id:b.device,retailer_id:b.body.profile.id})).status,409);
 assert.equal((await retail(env,'/dashboard',undefined,b.cookie)).body.devices[0].circuit_id,null);
 assert.equal((await circuit(env,'/status',null)).status,400);
 const raw=JSON.stringify(link),timestamp=String(Math.floor(Date.now()/1000)),signature=createHmac('sha256',env.ADMIRA_CIRCUIT_SECRET).update(timestamp+'.POST\n/api/circuit/link\n'+raw).digest('hex');
 const replay=await handleCircuit(new Request('https://data.yokup.com/api/circuit/status',{method:'POST',body:raw,headers:{'X-Admira-Timestamp':timestamp,'X-Admira-Signature':signature}}),env);assert.equal(replay.status,401);
});
test('active issues stay visible even beyond 200 newer resolved interventions',async()=>{
 const {env,db}=setup(),a=await shop(env);const opened=await retail(env,'/incidents',incidentBody(a.device),a.cookie);
 const insert=db.prepare("INSERT INTO installer_incidents(id,device_id,title,reason,status,created_at) VALUES(?,?,?,'retailer','resolved',?)");
 for(let n=0;n<205;n++)insert.run('history-'+n,a.device,'Intervención histórica',Date.now()+n+100);
 const dash=(await retail(env,'/dashboard',undefined,a.cookie)).body;assert.equal(dash.incidents.length,201);assert.ok(dash.incidents.some(i=>i.id===opened.body.id));assert.equal(dash.stats.open,1);
});
