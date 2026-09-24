import {publishOwnedSite} from './retailer-map-catalog.js';
import {siteImports,circuitSiteImports} from './retailer-site-imports.js';
import {portalCredentials} from './portal-credentials.js';
import {demoLogin} from './demo-accounts.js';
import { ORIGINS, SKILLS, encoder, fail, random, hash, statement, rows, coordinate, text, passwordHash, jsonBody, rateLimit, response, dispatchNotifications } from './installer-portal.js';
import {channelOf,afterRating,sweepDesk} from './incident-desk.js';
const COOKIE='__Host-yk_retailer';
const cookieToken=request=>(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
const publicAccount=({id,name,email})=>({id,name,email});
async function authenticated(request,env){
 const token=cookieToken(request);
 if(!token||!/^[a-f0-9]{64}$/.test(token))fail(401,'Entra en tu cuenta de comercio.');
 const account=await statement(env,`SELECT a.* FROM retailer_sessions s JOIN retailer_accounts a ON a.id=s.retailer_id WHERE s.token_hash=? AND s.expires_at>?`,await hash(token),Date.now()).first();
 if(!account)fail(401,'Tu sesión ha caducado. Vuelve a entrar.');return account;
}
async function createSession(env,id,expectedHash){const token=random();const created=await statement(env,'INSERT INTO retailer_sessions SELECT ?,?,? FROM retailer_accounts WHERE id=? AND password_hash=?',await hash(token),id,Date.now()+30*86400000,id,expectedHash).run();if(!created.meta.changes)fail(401,'La contraseña ha cambiado. Vuelve a entrar.');return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`;}
async function ownDevice(env,id,owner){const d=await statement(env,`SELECT d.*,l.site_id,l.circuit_id,l.admira_device_id,s.retailer_id FROM installer_devices d JOIN retailer_device_links l ON l.device_id=d.id JOIN retailer_sites s ON s.id=l.site_id WHERE d.id=? AND s.retailer_id=?`,id,owner).first();if(!d)fail(404,'Equipo no encontrado en tus establecimientos.');return d;}
async function ownIncident(env,id,owner){const i=await statement(env,`SELECT i.* FROM installer_incidents i JOIN retailer_device_links l ON l.device_id=i.device_id JOIN retailer_sites s ON s.id=l.site_id WHERE i.id=? AND s.retailer_id=?`,id,owner).first();if(!i)fail(404,'Incidencia no encontrada en tus establecimientos.');return i;}
async function dashboard(env,owner){
 const sites=await rows(env,'SELECT s.*,i.external_ref,i.sync_status,i.admira_store_id AS imported_admira_store_id,c.id AS catalog_id,c.created_at AS published_at FROM retailer_sites s LEFT JOIN retailer_site_import_items i ON i.site_id=s.id LEFT JOIN admira_retailer_locations c ON c.site_id=s.id WHERE s.retailer_id=? ORDER BY s.created_at',owner);
 const devices=await rows(env,`SELECT d.*,l.site_id,l.circuit_id,l.admira_store_id,l.admira_device_id,l.linked_at FROM installer_devices d JOIN retailer_device_links l ON l.device_id=d.id JOIN retailer_sites s ON s.id=l.site_id WHERE s.retailer_id=? ORDER BY d.name`,owner);
 const incidents=await rows(env,`SELECT i.*,d.name AS device_name,d.skill,l.site_id,l.circuit_id,l.admira_device_id,s.name AS site_name,t.name AS technician_name,rd.description,rd.priority,rr.stars,rr.satisfied,rr.comment,rr.followup_id,rr.created_at AS rated_at,p.start_at AS appointment_start,p.end_at AS appointment_end,p.timezone AS appointment_timezone,p.scope AS appointment_scope,p.cost_cents AS appointment_cost_cents
 FROM installer_incidents i JOIN installer_devices d ON d.id=i.device_id JOIN retailer_device_links l ON l.device_id=d.id JOIN retailer_sites s ON s.id=l.site_id LEFT JOIN installer_accounts t ON t.id=i.installer_id LEFT JOIN retailer_incident_details rd ON rd.incident_id=i.id LEFT JOIN retailer_ratings rr ON rr.incident_id=i.id LEFT JOIN call_cases cc ON cc.incident_id=i.id LEFT JOIN call_proposals p ON p.case_id=cc.id AND p.status='confirmed' WHERE s.retailer_id=? AND (i.status!='resolved' OR i.id IN (SELECT ri.id FROM installer_incidents ri JOIN retailer_device_links rl ON rl.device_id=ri.device_id JOIN retailer_sites rs ON rs.id=rl.site_id WHERE rs.retailer_id=? AND ri.status='resolved' ORDER BY ri.created_at DESC LIMIT 200)) ORDER BY i.created_at DESC`,owner,owner);
 const stats=await statement(env,`SELECT COUNT(CASE WHEN i.status='open' THEN 1 END) AS open,COUNT(CASE WHEN i.status='assigned' THEN 1 END) AS assigned,COUNT(CASE WHEN i.status='resolved' AND r.incident_id IS NULL THEN 1 END) AS awaiting_rating FROM installer_incidents i JOIN retailer_device_links l ON l.device_id=i.device_id JOIN retailer_sites s ON s.id=l.site_id LEFT JOIN retailer_ratings r ON r.incident_id=i.id WHERE s.retailer_id=?`,owner).first();
 return {sites,devices,incidents,stats};
}
export async function handleRetailer(request,env,principal){
 try{
  const path=decodeURIComponent(new URL(request.url).pathname.replace('/api/retailer','')),method=request.method;
  if(method==='OPTIONS')return response(request,{});
  if(path==='/health'&&method==='GET')return response(request,{ok:true,admira_configured:!!env.ADMIRA_CIRCUIT_SECRET});
  if(method!=='GET'&&!ORIGINS.has(request.headers.get('origin')))fail(403,'Origen no permitido.');
  if(['/register','/login'].includes(path)&&method==='POST'){
   await rateLimit(env,'retail-ip:'+(request.headers.get('CF-Connecting-IP')||'local'),20,900000);
   const b=await jsonBody(request),demo=path==='/login'&&demoLogin('retailer',b);
   if(demo){const account=await statement(env,'SELECT * FROM retailer_accounts WHERE email=?',demo).first();if(!account)fail(401,'Correo o contraseña incorrectos.');return response(request,{profile:publicAccount(account)},200,await createSession(env,account.id,account.password_hash));}
   const email=text(b.email,3,254).toLowerCase(),password=text(b.password,12,128);
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Correo no válido.');
   await rateLimit(env,'retail-email:'+await hash(email),10,900000);
   let account=await statement(env,'SELECT * FROM retailer_accounts WHERE email=?',email).first();
   if(path==='/register'){
    if(account)fail(409,'La cuenta ya existe. Entra con tu correo y contraseña.');
    const id=crypto.randomUUID(),name=text(b.name,2,100),salt=random();
    try{await statement(env,'INSERT INTO retailer_accounts VALUES(?,?,?,?,?,?)',id,email,name,await passwordHash(password,salt),salt,Date.now()).run();}catch(e){if(String(e).includes('UNIQUE'))fail(409,'La cuenta ya existe.');throw e;}
    account=await statement(env,'SELECT * FROM retailer_accounts WHERE id=?',id).first();
   }else{const digest=await passwordHash(password,account?.salt||'missing-account-constant');if(!account||digest!==account.password_hash)fail(401,'Correo o contraseña incorrectos.');}
   return response(request,{profile:publicAccount(account)},path==='/register'?201:200,await createSession(env,account.id,account.password_hash));
  }
  const account=principal||await authenticated(request,env),owner=account.id;
  if(path.startsWith('/mcp-tokens')||path==='/mcp-audit')return await portalCredentials(request,env,'retailer',account,path);
  if(path==='/me'&&method==='GET')return response(request,{profile:publicAccount(account)});
  if(path==='/logout'&&method==='POST'){await statement(env,'DELETE FROM retailer_sessions WHERE token_hash=?',await hash(cookieToken(request))).run();return response(request,{ok:true},200,`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);}
  if(path==='/dashboard'&&method==='GET')return response(request,await dashboard(env,owner));
  if(['/sites/import-preview','/sites/import','/site-imports'].includes(path)){const result=await siteImports(request,env,owner,path);if(result)return result;}
  const publishSite=/^\/sites\/([a-f0-9-]{36})\/publish$/.exec(path);
  if(publishSite&&method==='POST'){const consent=await jsonBody(request);if(consent.publish_maps!==true)fail(400,'Confirma la publicación de esta ubicación en los mapas públicos.');await rateLimit(env,'retail-publish:'+owner,60,3600000);return await publishOwnedSite(request,env,owner,publishSite[1]);}
  if(path==='/sites'&&method==='POST'){
   const b=await jsonBody(request),id=crypto.randomUUID(),name=text(b.name,2,120),kind=text(b.kind,2,40),country=text(b.country,2,2).toUpperCase(),city=text(b.city,2,120),address=text(b.address,5,300),latitude=coordinate(b.latitude,90),longitude=coordinate(b.longitude,180);
   if(!/^[A-Z]{2}$/.test(country)||!['kiosk','tobacco','supermarket','hospitality','other'].includes(kind))fail(400,'Tipo o país no válido.');
   await statement(env,'INSERT INTO retailer_sites VALUES(?,?,?,?,?,?,?,?,?,?)',id,owner,name,kind,country,city,address,latitude,longitude,Date.now()).run();return response(request,{id},201);
  }
  if(path==='/devices'&&method==='POST'){
   const b=await jsonBody(request),site=await statement(env,'SELECT * FROM retailer_sites WHERE id=? AND retailer_id=?',text(b.site_id,1,80),owner).first();if(!site)fail(404,'Establecimiento no encontrado.');
   const name=text(b.name,2,160),skill=text(b.skill,2,30);if(!SKILLS.has(skill))fail(400,'Tipo de equipo no válido.');
   const id='retail-'+crypto.randomUUID();
   await env.DB.batch([statement(env,'INSERT INTO installer_devices(id,name,latitude,longitude,address,skill,last_seen,monitoring) VALUES(?,?,?,?,?,?,?,0)',id,name,site.latitude,site.longitude,site.address,skill,Date.now()),statement(env,'INSERT INTO retailer_device_links(device_id,site_id,created_at) VALUES(?,?,?)',id,site.id,Date.now())]);return response(request,{id},201);
  }
  if(path==='/incidents'&&method==='POST'){
   const b=await jsonBody(request),device=await ownDevice(env,text(b.device_id,1,180),owner),title=text(b.title,3,200),description=text(b.description,10,2000),priority=b.priority==='urgent'?'urgent':'normal',key=text(b.request_key,8,100);
   const previous=await statement(env,'SELECT * FROM retailer_incident_details WHERE retailer_id=? AND request_key=?',owner,key).first();
   if(previous){const i=await ownIncident(env,previous.incident_id,owner);if(i.device_id!==device.id||i.title!==title||previous.description!==description||previous.priority!==priority)fail(409,'Este envío ya se utilizó con otros datos.');return response(request,{id:i.id,duplicate:true});}
   const active=await statement(env,"SELECT id FROM installer_incidents WHERE device_id=? AND status!='resolved'",device.id).first();if(active)return response(request,{id:active.id,duplicate:true,message:'Ya hay una incidencia abierta para este equipo.'});
   const id='retail-'+crypto.randomUUID();
   try{await env.DB.batch([statement(env,"INSERT INTO installer_incidents(id,device_id,title,reason,status,created_at,channel,round_started_at) VALUES(?,?,?,'retailer','open',?,?,?)",id,device.id,title,Date.now(),channelOf(b.channel),Date.now()),statement(env,'INSERT INTO retailer_incident_details VALUES(?,?,?,?,?,?)',id,owner,description,priority,null,key)]);}catch(e){if(String(e).includes('UNIQUE')){const current=await statement(env,"SELECT id FROM installer_incidents WHERE device_id=? AND status!='resolved'",device.id).first();if(current)return response(request,{id:current.id,duplicate:true});fail(409,'El envío ya se ha registrado. Actualiza la lista.');}throw e;}
   // Notification recovery is retried by the existing two-minute sweep if this request fails.
   if(channelOf(b.channel)==='digital')await sweepDesk(env);else await dispatchNotifications(env);return response(request,{id,channel:channelOf(b.channel)},201);
  }
  const rating=/^\/incidents\/([\w:-]+)\/rating$/.exec(path);
  if(rating&&method==='POST'){
   const incident=await ownIncident(env,rating[1],owner),b=await jsonBody(request);
   if(incident.status!=='resolved'||!incident.installer_id)fail(409,'Podrás valorar cuando el técnico haya terminado.');
   if(!Number.isInteger(b.stars)||b.stars<1||b.stars>5||typeof b.satisfied!=='boolean')fail(400,'Selecciona de 1 a 5 estrellas e indica si funciona.');
   const comment=typeof b.comment==='string'?b.comment.trim():'';if(comment.length>2000||(!b.satisfied&&comment.length<10))fail(400,'Describe qué sigue fallando (al menos 10 caracteres).');
   const followup=b.satisfied?null:'review-'+await hash(incident.id),now=Date.now();
   if(await statement(env,'SELECT incident_id FROM retailer_ratings WHERE incident_id=?',incident.id).first())fail(409,'Esta intervención ya está valorada.');
   const ops=[];let followupId=followup;
   if(followup){const active=await statement(env,"SELECT id FROM installer_incidents WHERE device_id=? AND status!='resolved'",incident.device_id).first();followupId=active?.id||followup;
    if(!active){ops.push(statement(env,"INSERT INTO installer_incidents(id,device_id,title,reason,status,created_at,channel,round_started_at) VALUES(?,?,?,'retailer','open',?,?,?)",followupId,incident.device_id,'Revisión: '+incident.title.slice(0,180),now,channelOf(incident.channel),now),statement(env,'INSERT INTO retailer_incident_details VALUES(?,?,?,?,?,?)',followupId,owner,comment,'normal',incident.id,'review:'+incident.id));}}
   ops.push(statement(env,'INSERT INTO retailer_ratings VALUES(?,?,?,?,?,?,?,?)',incident.id,owner,incident.installer_id,b.stars,b.satisfied?1:0,comment,now,followupId));
   try{await env.DB.batch(ops);}catch(e){if(String(e).includes('UNIQUE'))fail(409,'El estado ha cambiado. Actualiza antes de volver a valorar.');throw e;}
   await afterRating(env,incident.id,{stars:b.stars,satisfied:b.satisfied,followupId});
   if(followupId)await dispatchNotifications(env);return response(request,{ok:true,followup_id:followupId},201);
  }
  return response(request,{error:'Ruta no encontrada.'},404);
 }catch(e){if(!e.status)console.error('Retailer request failed',e.message);return response(request,{error:e.status?e.message:'No se pudo completar la operación. Conserva tus datos y vuelve a intentarlo.'},e.status||500);}
}

// Only the trusted central Admira service may establish circuit ownership. No browser can claim an Admira ID.
export async function handleCircuit(request,env){
 try{
  if(!env.ADMIRA_CIRCUIT_SECRET)fail(503,'Conexión de circuitos Admira pendiente de configurar.');
  const url=new URL(request.url),raw=await request.text();if(raw.length>16384)fail(413,'Petición demasiado grande.');
  const timestamp=request.headers.get('X-Admira-Timestamp'),signature=request.headers.get('X-Admira-Signature');
  if(!/^\d{10}$/.test(timestamp||'')||Math.abs(Date.now()/1000-Number(timestamp))>300||!/^[a-f0-9]{64}$/.test(signature||''))fail(401,'Firma no válida.');
  const key=await crypto.subtle.importKey('raw',encoder.encode(env.ADMIRA_CIRCUIT_SECRET),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const signed=timestamp+'.'+request.method+'\n'+url.pathname+'\n'+raw;
  if(!await crypto.subtle.verify('HMAC',key,Uint8Array.from(signature.match(/../g),v=>parseInt(v,16)),encoder.encode(signed)))fail(401,'Firma no válida.');
  if(request.method!=='POST')fail(405,'Usa POST.');
  let b;try{b=JSON.parse(raw);}catch{fail(400,'JSON no válido.');}if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'Se esperaba un objeto JSON.');
  const circuit=text(b.circuit_id,1,120);
  if(['/api/circuit/site-imports','/api/circuit/site-imports/confirm'].includes(url.pathname))return await circuitSiteImports(request,env,b,circuit);
  if(url.pathname==='/api/circuit/status'){
   const incidents=await rows(env,`SELECT l.circuit_id,l.admira_store_id,l.admira_device_id,i.id AS incident_id,i.title,i.status,i.created_at,i.assigned_at,i.resolved_at,i.resolution,t.name AS technician_name,r.stars,r.satisfied,r.comment,r.followup_id FROM retailer_device_links l JOIN installer_incidents i ON i.device_id=l.device_id LEFT JOIN installer_accounts t ON t.id=i.installer_id LEFT JOIN retailer_ratings r ON r.incident_id=i.id WHERE l.circuit_id=? ORDER BY i.created_at DESC LIMIT 200`,circuit);
   return response(request,{circuit_id:circuit,incidents});
  }
  if(url.pathname==='/api/circuit/link'){
   const deviceId=text(b.yokup_device_id,1,180),owner=text(b.retailer_id,1,80),storeId=text(b.admira_store_id,1,160),admiraId=text(b.admira_device_id,1,160),requestId=text(b.request_id,8,160);
   const d=await ownDevice(env,deviceId,owner);
   if(d.circuit_id&&(d.circuit_id!==circuit||d.admira_device_id!==admiraId))fail(409,'Equipo ya vinculado. La reasignación requiere revisión del operador.');
   const payloadHash=await hash(raw),prior=await statement(env,'SELECT * FROM retailer_admira_commands WHERE request_id=?',requestId).first();if(prior&&prior.payload_hash!==payloadHash)fail(409,'request_id ya usado con otro contenido.');
   await statement(env,'INSERT OR IGNORE INTO retailer_admira_commands VALUES(?,?,0,?)',requestId,payloadHash,Date.now()).run();
   const receipt=await statement(env,'SELECT payload_hash FROM retailer_admira_commands WHERE request_id=?',requestId).first();if(receipt.payload_hash!==payloadHash)fail(409,'request_id ya usado con otro contenido.');
   try{await env.DB.batch([statement(env,'UPDATE retailer_device_links SET circuit_id=?,admira_store_id=?,admira_device_id=?,linked_at=? WHERE device_id=? AND (circuit_id IS NULL OR (circuit_id=? AND admira_store_id=? AND admira_device_id=?)) AND EXISTS(SELECT 1 FROM retailer_admira_commands WHERE request_id=? AND payload_hash=? AND applied=0)',circuit,storeId,admiraId,Date.now(),deviceId,circuit,storeId,admiraId,requestId,payloadHash),statement(env,'UPDATE retailer_admira_commands SET applied=1 WHERE request_id=? AND payload_hash=?',requestId,payloadHash)]);}catch(e){if(String(e).includes('UNIQUE'))fail(409,'Este equipo de Admira ya está vinculado a otro registro.');throw e;}
   const persisted=await statement(env,'SELECT * FROM retailer_device_links WHERE device_id=?',deviceId).first();if(persisted.circuit_id!==circuit||persisted.admira_store_id!==storeId||persisted.admira_device_id!==admiraId)fail(409,'El equipo ya tiene otro vínculo autorizado.');
   return response(request,{ok:true,yokup_device_id:deviceId,circuit_id:circuit,admira_device_id:admiraId});
  }
  return response(request,{error:'Ruta no encontrada.'},404);
 }catch(e){if(!e.status)console.error('Circuit request failed',e.message);return response(request,{error:e.status?e.message:'No se pudo completar la sincronización.'},e.status||500);}
}

export {createSession as retailerSession, publicAccount as publicRetailer};
