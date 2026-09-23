import {ROUTER_TITLE} from './calls-router.js';
import {telephoneReady,startTelephone,telephoneWebhook,telephoneDetails,reconcileTelephone} from './calls-telephone.js';
import {ensureChain,syncChainJobs,chainView,changeChain} from './calls-chain.js';
import {ORIGINS,statement as q,rows,text,hash,random,fail,response,jsonBody,rateLimit,distanceKm} from './installer-portal.js';
import {adminIdentity} from './portal-access.js';
const NOW=()=>Date.now(),id=()=>crypto.randomUUID();
const cookie=(r,n)=>(r.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(n+'='))?.slice(n.length+1);
export async function callsActor(request,env){
 const bearer=(request.headers.get('authorization')||'').match(/^Bearer (ykcall_[a-f0-9]{64})$/)?.[1];
 if(bearer){const t=await q(env,'SELECT id,email FROM call_tokens WHERE token_hash=? AND expires_at>? AND revoked_at IS NULL',await hash(bearer),NOW()).first();if(!t)fail(401,'Token no válido o caducado.');const role=await q(env,'SELECT email FROM portal_superusers WHERE email=? AND revoked_at IS NULL',t.email).first(),scopes=await rows(env,'SELECT retailer_id FROM call_operators WHERE email=?',t.email);if(!role&&!scopes.length)fail(403,'Permisos revocados.');return {email:t.email,admin:!!role,scopes:scopes.map(s=>s.retailer_id),tokenId:t.id};}

 try {const a=await adminIdentity(request,env);return {...a,admin:true,scopes:[]};}catch(e){if(e.status!==401)throw e;}
 const t=cookie(request,'__Host-yk_retailer');if(!t)fail(401,'Entra con tu cuenta autorizada para gestionar llamadas.');
 const a=await q(env,'SELECT a.id,a.email FROM retailer_sessions s JOIN retailer_accounts a ON a.id=s.retailer_id WHERE s.token_hash=? AND s.expires_at>?',await hash(t),NOW()).first();
 if(!a)fail(401,'La sesión ha caducado.');const scopes=await rows(env,'SELECT retailer_id FROM call_operators WHERE email=?',a.email);
 if(!scopes.length)fail(403,'Tu cuenta no tiene permiso de operador.');return {...a,admin:false,scopes:scopes.map(s=>s.retailer_id)};
}
const can=(a,c)=>a.admin||(c.is_test?c.created_by===a.email:a.scopes.includes(c.retailer_id));
export async function ownCase(env,a,caseId){const c=await q(env,'SELECT * FROM call_cases WHERE id=?',caseId).first();if(!c||!can(a,c))fail(404,'Expediente no encontrado.');return c;}
async function job(env,a,jobId){const j=await q(env,'SELECT * FROM call_jobs WHERE id=?',jobId).first();if(!j)fail(404,'Llamada no encontrada.');return {j,c:await ownCase(env,a,j.case_id)};}
const audit=(env,c,a,kind,detail)=>q(env,'INSERT INTO call_events VALUES(?,?,?,?,?,?)',id(),c,a,kind,JSON.stringify(detail),NOW());
export async function syncCalls(env){
 await q(env,`INSERT OR IGNORE INTO call_cases(id,incident_id,retailer_id,title,site_name,latitude,longitude,skill,circuit_id,priority,is_test,created_by,stage,created_at)
 SELECT 'iot:'||i.id,i.id,s.retailer_id,i.title,s.name,d.latitude,d.longitude,d.skill,l.circuit_id,COALESCE(rd.priority,'normal'),0,'admira',i.status,i.created_at FROM installer_incidents i JOIN installer_devices d ON d.id=i.device_id JOIN retailer_device_links l ON l.device_id=d.id JOIN retailer_sites s ON s.id=l.site_id LEFT JOIN retailer_incident_details rd ON rd.incident_id=i.id WHERE i.status!='resolved'`).run();
 await q(env,`UPDATE call_cases SET stage=CASE
 WHEN (SELECT status FROM installer_incidents WHERE id=incident_id)='resolved' THEN CASE WHEN EXISTS(SELECT 1 FROM retailer_ratings WHERE incident_id=call_cases.incident_id AND satisfied=1) THEN 'closed' WHEN EXISTS(SELECT 1 FROM retailer_ratings WHERE incident_id=call_cases.incident_id) THEN 'reopened' ELSE 'awaiting_rating' END
 WHEN (SELECT status FROM installer_incidents WHERE id=incident_id)='assigned' THEN CASE WHEN EXISTS(SELECT 1 FROM call_proposals WHERE case_id=call_cases.id AND status='confirmed') THEN 'scheduled' ELSE 'assigned' END ELSE 'open' END WHERE is_test=0`).run();
 await q(env,"UPDATE call_jobs SET status='done',owner=NULL,lease_until=NULL,retry_at=NULL WHERE case_id IN (SELECT id FROM call_cases WHERE stage='closed') AND status IN ('pending','reserved','retry') AND attempt_id IS NULL").run();
 await q(env,`INSERT OR IGNORE INTO call_jobs(id,case_id,target,purpose,created_at) SELECT 'retailer:'||id,id,'retailer','Confirmar incidencia y disponibilidad',created_at FROM call_cases WHERE is_test=0`).run();
 await q(env,`INSERT OR IGNORE INTO call_contacts(case_id,kind,name) SELECT c.id,'retailer',r.name FROM call_cases c JOIN retailer_accounts r ON r.id=c.retailer_id`).run();
 // An expired lease never releases an active call. An operator must reconcile/end it.
 await q(env,"UPDATE call_jobs SET status='pending',owner=NULL,lease_until=NULL WHERE status='reserved' AND lease_until<? AND attempt_id IS NULL",NOW()).run();
 await q(env,"UPDATE call_jobs SET status='pending',retry_at=NULL WHERE status='retry' AND retry_at<=?",NOW()).run();
 await syncChainJobs(env);
 await q(env,'DELETE FROM call_signals WHERE room_id IN (SELECT id FROM call_rooms WHERE expires_at<? OR closed_at IS NOT NULL)',NOW()).run();
}
export async function candidates(env,c){
 if(c.is_test)return [{id:'pilot-screen',name:c.skill==='network'?'Técnico de prueba · redes':'Técnico de prueba · pantallas',latitude:c.latitude+.025,longitude:c.longitude,skills:['screen','audio','network','hvac','sensor','kiosk','player'],available:true,distance_km:2.78,is_test:true}];
 return (await rows(env,'SELECT id,name,latitude,longitude,skills,available FROM installer_accounts WHERE available=1 AND latitude BETWEEN ? AND ?',c.latitude-.361,c.latitude+.361)).map(t=>({...t,skills:JSON.parse(t.skills),distance_km:distanceKm(t,c)})).filter(t=>t.distance_km<40&&t.skills.includes(c.skill)).sort((a,b)=>a.distance_km-b.distance_km);
}
async function details(env,a,caseId){
 await syncChainJobs(env);
 const c=await ownCase(env,a,caseId);let incident=null,rating=null;
 if(c.incident_id){incident=await q(env,'SELECT status,installer_id,resolution FROM installer_incidents WHERE id=?',c.incident_id).first();rating=await q(env,'SELECT stars,satisfied,comment,followup_id FROM retailer_ratings WHERE incident_id=?',c.incident_id).first();}
 const jobs=await rows(env,'SELECT * FROM call_jobs WHERE case_id=?',c.id),proposals=await rows(env,'SELECT * FROM call_proposals WHERE case_id=? ORDER BY version DESC',c.id);
 return {case:c,incident,rating,jobs,telephone:await telephoneDetails(env,c.id),chain:await chainView(env,c,jobs,proposals),contacts:await rows(env,'SELECT * FROM call_contacts WHERE case_id=?',c.id),attempts:await rows(env,'SELECT a.* FROM call_attempts a JOIN call_jobs j ON j.id=a.job_id WHERE j.case_id=? ORDER BY a.created_at DESC',c.id),events:await rows(env,'SELECT * FROM call_events WHERE case_id=? ORDER BY created_at,id',c.id),proposals,candidates:await candidates(env,c)};
}
async function claim(env,a,j,c,b){
 if(c.stage==='closed')fail(409,'El expediente ya está cerrado.');
 if((await ensureChain(env,c.id)).state==='paused')fail(409,'La cadena está pausada.');
 const mode=b.mode||'human';if(!['human','assistant','ai'].includes(mode))fail(400,'Modalidad no válida.');
 if(mode==='ai')fail(503,'La telefonía IA no está activada. Usa una persona o el piloto gratuito.');
 if(mode==='assistant'&&!c.is_test)fail(400,'El asistente con guion solo funciona en expedientes de prueba.');
 const r=await q(env,"UPDATE call_jobs SET status='reserved',mode=?,owner=?,lease_until=? WHERE id=? AND attempt_id IS NULL AND EXISTS(SELECT 1 FROM call_chains WHERE case_id=call_jobs.case_id AND state='active') AND EXISTS(SELECT 1 FROM call_cases WHERE id=call_jobs.case_id AND stage!='closed') AND (status='pending' OR (status='reserved' AND (owner=? OR lease_until<?)))",mode,a.email,NOW()+300000,j.id,a.email,NOW()).run();
 if(!r.meta.changes)fail(409,'Otra persona o llamada ya tiene reservado este trabajo.');
 await audit(env,c.id,a.email,'reserved',{job_id:j.id,mode}).run();return {ok:true};
}
async function start(env,a,j,c,b){
 const channel=b.channel||'manual';if(!['manual','browser','pilot'].includes(channel)||channel==='pilot'&&!c.is_test)fail(400,'Canal no válido.');
 if((j.mode==='assistant')!==(channel==='pilot'))fail(400,'La modalidad y el canal no coinciden.');
 const key=text(b.request_key,16,100),previous=await q(env,'SELECT * FROM call_attempts WHERE id=?',key).first();
 if(previous){if(previous.actor!==a.email||previous.job_id!==j.id)fail(409,'Solicitud ya utilizada.');return {attempt_id:previous.id,replayed:true};}
 if(j.owner!==a.email||j.status!=='reserved'||j.lease_until<NOW())fail(409,'Reserva la llamada antes de iniciarla.');
 const contact=await q(env,'SELECT * FROM call_contacts WHERE case_id=? AND kind=?',c.id,j.target).first();
 if(channel==='manual'&&!contact?.phone)fail(400,'Guarda primero el teléfono autorizado del contacto.');
 let out;try{out=await env.DB.batch([
  q(env,`INSERT INTO call_attempts(id,job_id,actor,mode,channel,created_at,cycle) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM call_jobs WHERE id=? AND status='reserved' AND owner=? AND lease_until>?)`,key,j.id,a.email,j.mode,channel,NOW(),j.cycle,j.id,a.email,NOW()),
  q(env,"UPDATE call_jobs SET status='in_call',attempt_id=?,lease_until=NULL WHERE id=? AND EXISTS(SELECT 1 FROM call_attempts WHERE id=? AND job_id=?)",key,j.id,key,j.id),
  audit(env,c.id,a.email,'attempt_started',{job_id:j.id,attempt_id:key,channel,meaning:channel==='manual'?'Marcador abierto; conexión no acreditada':'Pendiente de conexión'})
 ]);}catch{fail(409,'El intento ya existe o la reserva ha cambiado.');}if(!out[0].meta.changes)fail(409,'La reserva ha cambiado.');return {attempt_id:key,tel:channel==='manual'?'tel:'+contact.phone:null};
}
async function finish(env,a,j,c,b){
 if(j.owner!==a.email||!j.attempt_id||j.status!=='in_call')fail(409,'No tienes una llamada activa en este trabajo.');
 const outcomes=['availability','agreed','declined','no_answer','busy','voicemail','human_handoff','other'];
 if(!outcomes.includes(b.outcome))fail(400,'Selecciona el resultado.');
 const notes=text(b.notes,3,2000),availability=String(b.availability||'').slice(0,1000),retry=Number(b.retry_at||0);
 if(retry&&(!Number.isFinite(retry)||retry<=NOW()||retry>NOW()+30*86400000))fail(400,'El reintento debe estar entre ahora y 30 días.');
 if(b.outcome==='availability'&&!availability.trim())fail(400,'Indica la disponibilidad acordada.');
 const policy=await ensureChain(env,c.id),failed=['no_answer','busy','voicemail'].includes(b.outcome),count=j.attempt_count+1;
 const exhausted=failed&&count>=policy.max_attempts;
 const nextRetry=exhausted||['declined','other','human_handoff'].includes(b.outcome)?0:retry||(failed?NOW()+policy.retry_minutes*60000:0);
 const status=b.outcome==='human_handoff'?'pending':exhausted||['declined','other'].includes(b.outcome)?'escalated':nextRetry?'retry':'done';
 const attempt=j.attempt_id;
 const result=await env.DB.batch([
  q(env,"UPDATE call_attempts SET status='completed',outcome=?,notes=?,availability=?,ended_at=? WHERE id=? AND actor=? AND ended_at IS NULL",b.outcome,notes,availability,NOW(),attempt,a.email),
  q(env,'UPDATE call_rooms SET closed_at=? WHERE attempt_id=? AND closed_at IS NULL',NOW(),attempt),
  q(env,"UPDATE call_jobs SET status=?,owner=NULL,lease_until=NULL,attempt_id=NULL,retry_at=?,attempt_count=attempt_count+1,mode=CASE WHEN ?='human_handoff' THEN 'human' ELSE mode END WHERE id=? AND attempt_id=?",status,nextRetry||null,b.outcome,j.id,attempt),
  audit(env,c.id,a.email,'call_result',{job_id:j.id,attempt_id:attempt,outcome:b.outcome,notes,availability,retry_at:nextRetry||null,attempt_count:count,status})
 ]);if(!result[0].meta.changes)fail(409,'La llamada ya terminó.');return {ok:true,status,retry_at:nextRetry||null,attempt_count:count};
}
async function proposal(env,a,c,b){
 if(['repairing','awaiting_rating','closed'].includes(c.stage))fail(409,'La intervención ya está en curso o terminada.');
 const start=Date.parse(b.start_at),end=Date.parse(b.end_at),cost=Number(b.cost_cents),tz=text(b.timezone||'Europe/Madrid',1,80),scope=text(b.scope,5,1000);
 try{new Intl.DateTimeFormat('es',{timeZone:tz});}catch{fail(400,'Zona horaria no válida.');}
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<NOW()||end<=start||end-start>8*3600000||!Number.isInteger(cost)||cost<0||cost>1000000)fail(400,'Revisa fecha, duración y coste.');
 const tech=(await candidates(env,c)).find(t=>t.id===b.installer_id);if(!tech)fail(409,'El instalador no está disponible o no es compatible a menos de 40 km.');
 const current=await q(env,"SELECT * FROM call_proposals WHERE case_id=? AND status IN ('proposed','confirmed')",c.id).first();
 if((current?.id||null)!==(b.previous_id||null))fail(409,'La propuesta ha cambiado. Actualiza antes de editar.');
 if(current?.status==='confirmed')fail(409,'Cancela primero la cita confirmada antes de cambiarla.');
 const version=(await q(env,'SELECT COALESCE(MAX(version),0)+1 n FROM call_proposals WHERE case_id=?',c.id).first()).n,pid=id();
 const statements=[];if(current)statements.push(q(env,"UPDATE call_proposals SET status='superseded' WHERE id=? AND status='proposed'",current.id));
 statements.push(q(env,'INSERT INTO call_proposals(id,case_id,version,installer_id,start_at,end_at,timezone,scope,cost_cents,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',pid,c.id,version,tech.id,start,end,tz,scope,cost,a.email,NOW()),q(env,"INSERT OR IGNORE INTO call_jobs(id,case_id,target,purpose,created_at) VALUES(?,?,'installer','Acordar la propuesta de intervención',?)",'installer:'+c.id,c.id,NOW()),q(env,"INSERT INTO call_contacts(case_id,kind,name) VALUES(?,'installer',?) ON CONFLICT(case_id,kind) DO UPDATE SET name=excluded.name,phone=CASE WHEN name=excluded.name THEN phone ELSE NULL END",c.id,tech.name),audit(env,c.id,a.email,'proposal_created',{id:pid,version,installer_id:tech.id}));
 statements.push(q(env,"UPDATE call_jobs SET status='pending',owner=NULL,lease_until=NULL,retry_at=NULL,attempt_count=0,cycle=?,purpose='Recoger aceptación expresa de la propuesta '||? WHERE case_id=? AND attempt_id IS NULL",'proposal:'+pid,version,c.id));
 try{await env.DB.batch(statements);}catch{fail(409,'La agenda o la propuesta ha cambiado. Actualiza.');}return {ok:true,id:pid,version};
}
async function acceptProposal(env,a,c,p,b){
 if(p.status!=='proposed'||p.start_at<=NOW())fail(409,'La propuesta ya no está pendiente o la fecha ha pasado.');
 const eligible=(await candidates(env,c)).find(t=>t.id===p.installer_id);if(!eligible)fail(409,'El técnico ya no está disponible o ha cambiado su cobertura.');
 const party=b.party;if(!['retailer','installer'].includes(party))fail(400,'Participante no válido.');
 if(b.accepted!==true)fail(400,'Se requiere aceptación explícita.');
 const evidence=text(b.evidence,10,1000);if(!c.is_test&&b.verbal_confirmed!==true)fail(400,'Confirma que la persona ha aceptado expresamente esta propuesta.');
 const column=party==='retailer'?'retailer_accepted':'installer_accepted';
 const st=[q(env,'INSERT OR IGNORE INTO call_acceptances VALUES(?,?,?,?,?)',p.id,party,a.email,evidence,NOW()),q(env,`UPDATE call_proposals SET ${column}=1 WHERE id=? AND status='proposed'`,p.id)];
 // The calendar hold is checked inside the same atomic batch as confirmation.
 st.push(q(env,`UPDATE call_proposals SET status='confirmed' WHERE id=? AND retailer_accepted=1 AND installer_accepted=1 AND status='proposed' AND NOT EXISTS(SELECT 1 FROM call_proposals x WHERE x.id!=? AND x.installer_id=? AND x.status='confirmed' AND x.start_at<? AND x.end_at>?) ${c.is_test?'':"AND EXISTS(SELECT 1 FROM installer_incidents WHERE id=? AND status='open') AND EXISTS(SELECT 1 FROM installer_accounts WHERE id=? AND available=1 AND latitude=? AND longitude=? AND skills=?)"}`,p.id,p.id,p.installer_id,p.end_at,p.start_at,...(c.is_test?[]:[c.incident_id,p.installer_id,eligible.latitude,eligible.longitude,JSON.stringify(eligible.skills)])));
 if(!c.is_test)st.push(q(env,"UPDATE installer_incidents SET status='assigned',installer_id=?,assigned_at=? WHERE id=? AND status='open' AND EXISTS(SELECT 1 FROM call_proposals WHERE id=? AND status='confirmed')",p.installer_id,NOW(),c.incident_id,p.id),q(env,`INSERT OR IGNORE INTO installer_notifications(id,incident_id,installer_id,distance_km,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM call_proposals WHERE id=? AND status='confirmed')`,id(),c.incident_id,p.installer_id,distanceKm((await candidates(env,c)).find(t=>t.id===p.installer_id)||c,c),NOW(),p.id));
 st.push(q(env,"UPDATE call_cases SET stage='scheduled' WHERE id=? AND EXISTS(SELECT 1 FROM call_proposals WHERE id=? AND status='confirmed')",c.id,p.id),audit(env,c.id,a.email,'proposal_acceptance',{proposal_id:p.id,version:p.version,party,evidence,test:!!c.is_test}));
 st.push(q(env,"UPDATE call_jobs SET status='done',owner=NULL,lease_until=NULL,retry_at=NULL WHERE case_id=? AND target=? AND attempt_id IS NULL AND EXISTS(SELECT 1 FROM call_proposals WHERE id=? AND status IN ('proposed','confirmed'))",c.id,party,p.id));
 await env.DB.batch(st);await syncChainJobs(env);const now=await q(env,'SELECT * FROM call_proposals WHERE id=?',p.id).first();
 return {ok:true,proposal:now,conflict:now.status!=='confirmed'&&!!now.retailer_accepted&&!!now.installer_accepted};
}
async function pilot(env,a){
 const recent=await q(env,'SELECT id FROM call_cases WHERE is_test=1 AND created_by=? AND created_at>?',a.email,NOW()-60000).first();if(recent)return {id:recent.id,replayed:true};
 const cid='pilot:'+id(),now=NOW();await env.DB.batch([
 q(env,"INSERT INTO call_cases(id,title,site_name,latitude,longitude,skill,is_test,created_by,created_at) VALUES(?,'PILOTO · Pantalla sin señal','Comercio de prueba · Barcelona',41.3874,2.1686,'screen',1,?,?)",cid,a.email,now),
 q(env,"INSERT INTO call_jobs(id,case_id,target,purpose,created_at) VALUES(?,?,'retailer','PILOTO: confirmar fallo y disponibilidad',?)",'retailer:'+cid,cid,now),
 q(env,"INSERT INTO call_contacts(case_id,kind,name) VALUES(?,'retailer','Retailer de prueba')",cid),audit(env,cid,a.email,'pilot_created',{synthetic:true,external_calls:false})]);return {id:cid};
}
async function routerPilot(env,a,b){
 if(!a.admin||a.tokenId)fail(403,'La demo telefónica requiere un superusuario en la web.');
 if(!/^[a-f0-9-]{36}$/i.test(String(b.request_key||'')))fail(400,'Solicitud de demo no válida.');
 const phone=String(b.phone||'').trim();if(phone&&!/^\+[1-9]\d{7,14}$/.test(phone))fail(400,'Usa el teléfono con prefijo internacional.');
 const cid='router:'+b.request_key,old=await q(env,'SELECT created_by FROM call_cases WHERE id=?',cid).first();
 if(old){if(old.created_by!==a.email)fail(409,'Solicitud ya utilizada.');return {id:cid,replayed:true};}
 await rateLimit(env,'router-demo:'+a.email,10,86400000);const now=NOW();
 await env.DB.batch([
 q(env,"INSERT INTO call_cases(id,title,site_name,latitude,longitude,skill,is_test,created_by,created_at) VALUES(?,?,'Comercio de demostración · Barcelona',41.3874,2.1686,'network',1,?,?)",cid,ROUTER_TITLE,a.email,now),
 q(env,"INSERT INTO call_jobs(id,case_id,target,purpose,created_at) VALUES(?,?,'retailer','DEMO: guiar reinicio eléctrico del router y confirmar resultado',?)",'retailer:'+cid,cid,now),
 q(env,"INSERT INTO call_contacts(case_id,kind,name,phone,language,timezone) VALUES(?,'retailer','Participante de la demo',?,'es-ES','Europe/Madrid')",cid,phone),
 audit(env,cid,a.email,'pilot_created',{notes:'Alerta y diagnóstico simulados: router sin conexión. Se prepara asistencia telefónica para reinicio eléctrico; no reset de fábrica.',synthetic:true,external_calls:false})]);return {id:cid};
}
async function roomAuth(request,env,rid){
 const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');if(!/^[a-f0-9]{64}$/.test(token))fail(401,'Invitación no válida.');
 const r=await q(env,'SELECT * FROM call_rooms WHERE id=? AND expires_at>? AND closed_at IS NULL',rid,NOW()).first();const h=await hash(token);
 if(!r||![r.host_hash,r.guest_hash].includes(h))fail(401,'La sala ha caducado o está cerrada.');return {r,side:h===r.host_hash?'host':'guest'};
}
async function roomRoute(request,env,path){
 const [rid,action]=path.split('/'),{r,side}=await roomAuth(request,env,rid);
 await rateLimit(env,'calls-room:'+rid+side,150,60000);
 if(request.method==='GET')return response(request,{id:rid,side,offer:side==='guest'?r.offer:null,answer:side==='host'?r.answer:null,signals:await rows(env,'SELECT seq,payload FROM call_signals WHERE room_id=? AND sender!=? ORDER BY seq',rid,side),expires_at:r.expires_at});
 const b=await jsonBody(request);
 if(action==='close'){await q(env,'UPDATE call_rooms SET closed_at=? WHERE id=?',NOW(),rid).run();return response(request,{ok:true});}
 if(b.type==='offer'||b.type==='answer'){
  if((b.type==='offer')!==(side==='host'))fail(403,'Turno de señalización no permitido.');
  if(typeof b.sdp!=='string'||b.sdp.length<10||b.sdp.length>12000)fail(400,'Descripción de conexión no válida.');const s=b.sdp;await q(env,`UPDATE call_rooms SET ${b.type}=? WHERE id=? AND ${b.type} IS NULL`,s,rid).run();
 }else if(b.type==='ice'){
  const seq=Number(b.seq);if(!Number.isInteger(seq)||seq<0||seq>100)fail(400,'Señal no válida.');const payload=text(JSON.stringify(b.candidate),2,2500);
  await q(env,'INSERT OR IGNORE INTO call_signals VALUES(?,?,?,?)',rid,side,seq,payload).run();
 }else fail(400,'Señal no válida.');return response(request,{ok:true});
}
async function handleCallsInternal(request,env){
 try{
  const url=new URL(request.url),path=url.pathname.slice('/api/calls'.length),method=request.method;
  if(path.startsWith('/telephone/'))return await telephoneWebhook(request,env,path,finish);
  if(method==='OPTIONS')return response(request,{});
  if(method!=='GET'&&!ORIGINS.has(request.headers.get('origin'))&&!/^Bearer ykcall_[a-f0-9]{64}$/.test(request.headers.get('authorization')||''))fail(403,'Origen no permitido.');
  if(path.startsWith('/rooms/'))return await roomRoute(request,env,path.slice(7));
  const a=await callsActor(request,env);await rateLimit(env,'calls:'+a.email,180,60000);
  if(path==='/me')return response(request,{email:a.email,admin:a.admin,scopes:a.scopes,capabilities:{human:true,browser:true,free_pilot:true,telephone_ai:false,telephone_guided:a.admin&&telephoneReady(env)},telephone_demo_to:a.admin?(env.TWILIO_DEMO_TO||''):'',telephone_note:telephoneReady(env)?'Prueba telefónica guiada con reconocimiento de voz, en expedientes sintéticos. No es conversación libre con IA.':'Telefonía guiada pendiente de configurar Twilio.'});
  if(path==='/tokens'){
   if(a.tokenId)fail(403,'Gestiona credenciales desde tu sesión web.');
   if(method==='GET')return response(request,{tokens:await rows(env,'SELECT id,label,expires_at,revoked_at FROM call_tokens WHERE email=? ORDER BY created_at DESC',a.email)});
   const b=await jsonBody(request);if(b.revoke){await q(env,'UPDATE call_tokens SET revoked_at=? WHERE id=? AND email=?',NOW(),b.revoke,a.email).run();return response(request,{ok:true});}
   const token='ykcall_'+random(),tid=id();await q(env,'INSERT INTO call_tokens VALUES(?,?,?,?,?,?,NULL)',tid,await hash(token),a.email,text(b.label,2,80),NOW()+7*86400000,NOW()).run();return response(request,{id:tid,token,expires_in_days:7},201);
  }
  if(path==='/operators'){
   if(a.tokenId)fail(403,'Los tokens de llamadas no pueden gestionar operadores.');
   if(!a.admin)fail(403,'Solo un superusuario administra operadores.');
   if(method==='GET')return response(request,{operators:await rows(env,'SELECT o.*,r.name AS retailer_name FROM call_operators o JOIN retailer_accounts r ON r.id=o.retailer_id'),retailers:await rows(env,'SELECT id,name FROM retailer_accounts ORDER BY name LIMIT 500')});
   const b=await jsonBody(request),email=text(b.email,3,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!['grant','revoke'].includes(b.action))fail(400,'Revisa el correo y la acción.');
   if(b.action==='grant'&&!await q(env,'SELECT id FROM retailer_accounts WHERE id=?',b.retailer_id).first())fail(404,'Comercio no encontrado.');
   if(b.action==='grant')await q(env,'INSERT OR REPLACE INTO call_operators VALUES(?,?,?,?)',email,text(b.retailer_id,1,100),a.email,NOW()).run();else await q(env,'DELETE FROM call_operators WHERE email=? AND retailer_id=?',email,b.retailer_id).run();return response(request,{ok:true});
  }
  if(path==='/router-demo'&&method==='POST')return response(request,await routerPilot(env,a,await jsonBody(request)),201);
  if(path==='/pilot'&&method==='POST')return response(request,await pilot(env,a),201);
  if(path==='/cases'&&method==='GET'){
   await syncCalls(env);const all=await rows(env,`SELECT c.*,i.status AS incident_status,j.id AS job_id,j.status AS call_status,j.owner AS call_owner,j.target,j.mode,j.retry_at,j.attempt_count,ch.state AS chain_state,ch.coordinator FROM call_cases c JOIN call_jobs j ON j.case_id=c.id LEFT JOIN call_chains ch ON ch.case_id=c.id LEFT JOIN installer_incidents i ON i.id=c.incident_id WHERE (?=1 OR (c.is_test=1 AND c.created_by=?) OR (c.is_test=0 AND c.retailer_id IN (SELECT retailer_id FROM call_operators WHERE email=?))) ORDER BY CASE c.priority WHEN 'urgent' THEN 0 ELSE 1 END,c.created_at DESC LIMIT 1000`,a.admin?1:0,a.email,a.email);
   return response(request,{cases:all,limit:1000});
  }
  let m=/^\/cases\/([^/]+)(?:\/(contacts|proposals|advance|chain))?$/.exec(path);
  if(m){const c=await ownCase(env,a,decodeURIComponent(m[1]));if(method==='GET'&&!m[2])return response(request,await details(env,a,c.id));const b=await jsonBody(request);
   if(m[2]==='chain')return response(request,await changeChain(env,a,c,b,audit));
   if(m[2]==='contacts'){
    if(!['retailer','installer'].includes(b.kind))fail(400,'Contacto no válido.');const phone=String(b.phone||'').replace(/[\s()-]/g,'');if(phone&&!/^\+[1-9]\d{7,14}$/.test(phone))fail(400,'Usa formato internacional, por ejemplo +34…');
    const tz=text(b.timezone||'Europe/Madrid',1,80);try{new Intl.DateTimeFormat('es',{timeZone:tz});}catch{fail(400,'Zona horaria no válida.');}
    await env.DB.batch([q(env,'INSERT INTO call_contacts(case_id,kind,name,phone,language,timezone) VALUES(?,?,?,?,?,?) ON CONFLICT(case_id,kind) DO UPDATE SET name=excluded.name,phone=excluded.phone,language=excluded.language,timezone=excluded.timezone',c.id,b.kind,text(b.name,2,120),phone||null,text(b.language||'es-ES',2,20),tz),audit(env,c.id,a.email,'contact_updated',{kind:b.kind})]);return response(request,{ok:true});
   }
   if(m[2]==='proposals')return response(request,await proposal(env,a,c,b),201);
   if(m[2]==='advance'){
    if(!c.is_test)fail(400,'El avance real se registra desde los portales del técnico y del comercio.');
    const next={scheduled:'repairing',repairing:'awaiting_rating',awaiting_rating:b.satisfied===true?'closed':'reopened',reopened:'repairing'}[c.stage];if(!next)fail(409,'Confirma primero una cita.');
    await env.DB.batch([q(env,'UPDATE call_cases SET stage=? WHERE id=? AND stage=?',next,c.id,c.stage),...(next==='closed'?[q(env,"UPDATE call_jobs SET status='done',owner=NULL,lease_until=NULL,retry_at=NULL WHERE case_id=? AND status IN ('pending','reserved','retry') AND attempt_id IS NULL",c.id)]:[]),audit(env,c.id,a.email,'pilot_stage',{from:c.stage,to:next,notes:text(b.notes,5,1000),synthetic:true})]);await syncChainJobs(env);return response(request,{ok:true,stage:next});
   }fail(404,'Ruta no encontrada.');
  }
  m=/^\/jobs\/([^/]+)\/(claim|start|finish|release|room|telephone|telephone-status)$/.exec(path);
  if(m&&method==='POST'){const {j,c}=await job(env,a,decodeURIComponent(m[1])),b=await jsonBody(request);let out;
   if(m[2]==='telephone-status')out=await reconcileTelephone(env,a,j,c,b,finish);
   if(m[2]==='telephone')out=await startTelephone(env,a,j,c,b);
   if(m[2]==='claim')out=await claim(env,a,j,c,b);
   if(m[2]==='start')out=await start(env,a,j,c,b);
   if(m[2]==='finish'){if(j.attempt_id&&(await q(env,'SELECT channel FROM call_attempts WHERE id=?',j.attempt_id).first())?.channel==='telephone')fail(409,'La llamada telefónica se cierra con el resultado de Twilio.');out=await finish(env,a,j,c,b);}
   if(m[2]==='release'){if(j.owner!==a.email||j.attempt_id)fail(409,'Finaliza el intento activo antes de liberar.');await q(env,"UPDATE call_jobs SET status='pending',owner=NULL,lease_until=NULL WHERE id=? AND owner=? AND attempt_id IS NULL",j.id,a.email).run();out={ok:true};}
   if(m[2]==='room'){
    if(j.owner!==a.email||j.status!=='in_call'||!j.attempt_id)fail(409,'Inicia primero una llamada web.');const at=await q(env,'SELECT channel FROM call_attempts WHERE id=?',j.attempt_id).first();if(at.channel!=='browser')fail(400,'El intento no es una llamada web.');
    const rid=id(),host=random(),guest=random();try{await q(env,'INSERT INTO call_rooms(id,attempt_id,host_hash,guest_hash,expires_at) VALUES(?,?,?,?,?)',rid,j.attempt_id,await hash(host),await hash(guest),NOW()+3600000).run();}catch{fail(409,'Ya existe una sala para este intento. Finalízalo para crear otra.');}
    out={id:rid,host_token:host,guest_token:guest};
   }return response(request,out);
  }
  m=/^\/proposals\/([^/]+)\/(accept|cancel)$/.exec(path);
  if(m&&method==='POST'){
   const p=await q(env,'SELECT * FROM call_proposals WHERE id=?',m[1]).first();if(!p)fail(404,'Propuesta no encontrada.');const c=await ownCase(env,a,p.case_id),b=await jsonBody(request);
   if(m[2]==='accept')return response(request,await acceptProposal(env,a,c,p,b));
   if(!c.is_test&&(await q(env,'SELECT status FROM installer_incidents WHERE id=?',c.incident_id).first())?.status==='resolved')fail(409,'La intervención ya está resuelta.');
   if(!['proposed','confirmed'].includes(p.status)||['repairing','awaiting_rating','closed'].includes(c.stage))fail(409,'Esta propuesta ya no se puede cancelar.');
   const evidence=text(b.evidence,10,1000);
   const guard="EXISTS(SELECT 1 FROM call_proposals WHERE id=? AND status='cancelled') AND NOT EXISTS(SELECT 1 FROM call_proposals WHERE case_id=? AND status IN ('proposed','confirmed'))";
   await env.DB.batch([q(env,"UPDATE call_proposals SET status='cancelled' WHERE id=? AND status IN ('proposed','confirmed') AND EXISTS(SELECT 1 FROM call_cases WHERE id=? AND stage IN ('open','assigned','scheduled'))",p.id,c.id),q(env,"UPDATE call_cases SET stage='open' WHERE id=? AND stage IN ('open','assigned','scheduled') AND "+guard,c.id,p.id,c.id),...(!c.is_test?[q(env,"UPDATE installer_incidents SET status='open',installer_id=NULL,assigned_at=NULL WHERE id=? AND status='assigned' AND installer_id=? AND "+guard,c.incident_id,p.installer_id,p.id,c.id)]:[]),audit(env,c.id,a.email,'proposal_cancelled',{proposal_id:p.id,evidence})]);return response(request,{ok:true});
  }
  fail(404,'Ruta no encontrada.');
 }catch(e){return response(request,{error:e.status?e.message:'No se pudo completar la operación.'},e.status||500);}
}

export async function handleCalls(request,env){
 const res=await handleCallsInternal(request,env);
 if(ORIGINS.has(request.headers.get('origin')))res.headers.set('Access-Control-Allow-Headers','Content-Type, Authorization');
 return res;
}
