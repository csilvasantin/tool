import {portalCredentials} from './portal-credentials.js';
/** Installer portal: isolated accounts, authenticated inbox and signed Admira ingestion. */
const ORIGINS = new Set(['https://www.yokup.com', 'https://yokup.com', 'http://localhost:8788', 'http://127.0.0.1:8788']);
const SKILLS = new Set(['screen', 'player', 'network', 'audio', 'sensor', 'kiosk', 'hvac']);
const COOKIE = '__Host-yk_installer';
const encoder = new TextEncoder();
const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };
const hex = buffer => [...new Uint8Array(buffer)].map(n => n.toString(16).padStart(2, '0')).join('');
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const hash = async text => hex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
const statement = (env, sql, ...values) => env.DB.prepare(sql).bind(...values);
const rows = async (env, sql, ...values) => (await statement(env, sql, ...values).all()).results || [];
export function distanceKm(a, b) {
 const radians = v => v * Math.PI / 180;
 const dlat = radians(b.latitude - a.latitude), dlon = radians(b.longitude - a.longitude);
 const h = Math.sin(dlat/2)**2 + Math.cos(radians(a.latitude))*Math.cos(radians(b.latitude))*Math.sin(dlon/2)**2;
 return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}
export function boundingBox(latitude, longitude, radiusKm=40) {
 const km=Number(radiusKm); const radius=Number.isFinite(km)&&km>0?Math.min(200,km):40;
 const delta=radius/6371.0088, degrees=180/Math.PI, latDelta=delta*degrees;
 const south=Math.max(-90,latitude-latDelta), north=Math.min(90,latitude+latDelta);
 const allLongitudes=south<=-90 || north>=90;
 const lonDelta=allLongitudes?180:Math.asin(Math.min(1,Math.sin(delta)/Math.cos(latitude/degrees)))*degrees;
 const wrap=x=>((x+180)%360+360)%360-180;
 return {south,north,west:wrap(longitude-lonDelta),east:wrap(longitude+lonDelta),allLongitudes};
}
function coordinate(value, max) {
 if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value)>max) fail(400, 'Coordenadas no válidas.');
 return value;
}
function text(value, min, max) {
 if (typeof value !== 'string' || value.trim().length<min || value.trim().length>max) fail(400, 'Revisa los campos obligatorios.');
 return value.trim();
}
function profile(body) {
 const country = text(body.country, 2, 2).toUpperCase();
 if (!/^[A-Z]{2}$/.test(country)) fail(400, 'País no válido.');
 const skills = Array.isArray(body.skills) ? [...new Set(body.skills)] : [];
 if (!skills.length || skills.some(s => !SKILLS.has(s))) fail(400, 'Selecciona una especialidad.');
 const radiusRaw=body.radius_km??body.radiusKm??40;
 if(typeof radiusRaw!=='number'||!Number.isFinite(radiusRaw)||radiusRaw<1||radiusRaw>200) fail(400,'El radio de zona debe estar entre 1 y 200 km.');
 const demo=body.demo===true?1:0;
 return {name:text(body.name,2,100), country, city:text(body.city,2,120),
  latitude:coordinate(body.latitude??body.lat,90), longitude:coordinate(body.longitude??body.long,180), skills:JSON.stringify(skills),
  language:body.language==='en'?'en':'es', available:(demo||body.available===false)?0:1,
  radius_km:Math.round(radiusRaw*100)/100, notify_zone:body.notify_zone===false?0:1, demo};
}
function publicProfile(row) {
 const {password_hash,salt,...rest}=row;
 return {...rest, skills:JSON.parse(row.skills), available:!!row.available, notify_zone:row.notify_zone!==0,
  demo:!!row.demo, radius_km:Number(row.radius_km)||40};
}
async function passwordHash(password, salt) {
 const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:100000,hash:'SHA-256'},key,256));
}
async function jsonBody(request) {
 if (+(request.headers.get('content-length')||0)>16384) fail(413,'Petición demasiado grande.');
 const raw = await request.text();
 if(raw.length>16384) fail(413,'Petición demasiado grande.');
 try { const b=JSON.parse(raw); if(!b || typeof b!=='object' || Array.isArray(b)) throw Error(); return b; }
 catch { fail(400,'JSON no válido.'); }
}
async function rateLimit(env,key,limit,windowMs) {
 const now=Date.now();
 const result=await statement(env,`INSERT INTO installer_rate_limits(key,count,expires_at) VALUES(?,1,?)
 ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,
 expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING count`,key,now+windowMs,now,now).first();
 if(result.count>limit) fail(429,'Demasiados intentos. Espera unos minutos.');
}
async function authenticated(request,env) {
 const token=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 if(!token || !/^[a-f0-9]{64}$/.test(token)) fail(401,'Inicia sesión para continuar.');
 const account=await statement(env,`SELECT a.* FROM installer_sessions s JOIN installer_accounts a ON a.id=s.installer_id WHERE s.token_hash=? AND s.expires_at>?`,await hash(token),Date.now()).first();
 if(!account) fail(401,'Tu sesión ha caducado. Vuelve a entrar.');
 return account;
}
async function session(env,id,expectedHash) {
 const token=random();
 const created=await statement(env,'INSERT INTO installer_sessions SELECT ?,?,? FROM installer_accounts WHERE id=? AND password_hash=?',await hash(token),id,Date.now()+30*86400000,id,expectedHash).run();
 if(!created.meta.changes)fail(401,'La contraseña ha cambiado. Vuelve a entrar.');
 return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`;
}
function response(request,body,status=200,cookie) {
 const origin=request.headers.get('origin');
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
 if(ORIGINS.has(origin)) Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS'});
 if(cookie) headers['Set-Cookie']=cookie;
 return new Response(JSON.stringify(body),{status,headers});
}
export async function handleInstaller(request,env,principal) {
 const url=new URL(request.url), method=request.method;
 try {
  let path; try { path=decodeURIComponent(url.pathname.replace('/api/installer','')); } catch { fail(400,'Ruta no válida.'); }
  if(method==='OPTIONS') return response(request,{});
  if(path==='/health') return response(request,{ok:true, radius_km:40, admira_configured:!!env.INSTALLER_ADMIRA_SECRET, notifications:['in_app'], version:1});
  if(path==='/events' && method==='POST') return response(request,await ingestEvent(request,env),202);
  if(method!=='GET' && !ORIGINS.has(request.headers.get('origin'))) fail(403,'Origen no permitido.');
  if((path==='/register'||path==='/login') && method==='POST') {
   await rateLimit(env,'auth-ip:'+(request.headers.get('CF-Connecting-IP')||'local'),20,15*60000);
   const body=await jsonBody(request), email=text(body.email,3,254).toLowerCase();
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400,'Correo electrónico no válido.');
   await rateLimit(env,'auth-email:'+await hash(email),10,15*60000);
   const password=text(body.password,12,128);
   let account=await statement(env,'SELECT * FROM installer_accounts WHERE email=?',email).first();
   if(path==='/register') {
    if(account) fail(409,'No se pudo crear la cuenta. Si ya tienes una, inicia sesión.');
    const p=profile(body), salt=random(), id=crypto.randomUUID(), digest=await passwordHash(password,salt);
    try {
     await statement(env,`INSERT INTO installer_accounts(id,email,name,password_hash,salt,country,city,latitude,longitude,skills,language,available,radius_km,notify_zone,demo,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,id,email,p.name,digest,salt,p.country,p.city,p.latitude,p.longitude,p.skills,p.language,p.available,p.radius_km,p.notify_zone,p.demo,Date.now()).run();
    } catch(e) { if(String(e).includes('UNIQUE')) fail(409,'No se pudo crear la cuenta. Si ya tienes una, inicia sesión.'); throw e; }
    account=await statement(env,'SELECT * FROM installer_accounts WHERE id=?',id).first();
   } else {
    const digest=await passwordHash(password,account?.salt||'missing-account-constant');
    if(!account || digest!==account.password_hash) fail(401,'Correo o contraseña incorrectos.');
   }
   return response(request,{profile:publicProfile(account)},path==='/register'?201:200,await session(env,account.id,account.password_hash));
  }
  const account=principal||await authenticated(request,env);
  if(path.startsWith('/mcp-tokens')||path==='/mcp-audit')return await portalCredentials(request,env,'installer',account,path);
  if(path==='/logout' && method==='POST') {
   const token=request.headers.get('cookie').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'=')).slice(COOKIE.length+1);
   await statement(env,'DELETE FROM installer_sessions WHERE token_hash=?',await hash(token)).run();
   return response(request,{ok:true},200,`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
  }
  if(path==='/me' && method==='GET') return response(request,{profile:publicProfile(account)});
  if(path==='/me' && method==='PATCH') {
   const p=profile(await jsonBody(request));
   await statement(env,`UPDATE installer_accounts SET name=?,country=?,city=?,latitude=?,longitude=?,skills=?,language=?,available=?,radius_km=?,notify_zone=?,demo=? WHERE id=?`,p.name,p.country,p.city,p.latitude,p.longitude,p.skills,p.language,p.available,p.radius_km,p.notify_zone,p.demo,account.id).run();
   return response(request,{profile:publicProfile(await statement(env,'SELECT * FROM installer_accounts WHERE id=?',account.id).first())});
  }
  if(path==='/inbox' && method==='GET') {
   const notifications=await rows(env,`SELECT n.id AS notification_id,n.distance_km,n.created_at AS notified_at,n.read_at,i.id,i.title,i.reason,i.status,i.installer_id,i.created_at,i.resolution,rd.description,rd.priority,rr.stars AS rating_stars,rr.comment AS rating_comment,rr.satisfied,d.name AS device_name,d.skill,d.latitude,d.longitude,
   CASE WHEN i.installer_id=? THEN d.address ELSE NULL END AS address
   FROM installer_notifications n JOIN installer_incidents i ON i.id=n.incident_id JOIN installer_devices d ON d.id=i.device_id LEFT JOIN retailer_incident_details rd ON rd.incident_id=i.id LEFT JOIN retailer_ratings rr ON rr.incident_id=i.id AND rr.installer_id=? WHERE n.installer_id=? ORDER BY n.created_at DESC LIMIT 100`,account.id,account.id,account.id);
   const stats=await statement(env,`SELECT COUNT(CASE WHEN n.read_at IS NULL THEN 1 END) AS unread,COUNT(CASE WHEN i.installer_id=? AND i.status='assigned' THEN 1 END) AS assigned,COUNT(CASE WHEN i.installer_id=? AND i.status='resolved' THEN 1 END) AS resolved FROM installer_notifications n JOIN installer_incidents i ON i.id=n.incident_id WHERE n.installer_id=?`,account.id,account.id,account.id).first();
   const reputation=await statement(env,'SELECT COUNT(*) AS count,AVG(stars) AS average FROM retailer_ratings WHERE installer_id=?',account.id).first();
   return response(request,{stats,reputation,notifications:notifications.map(n=>({...n,mine:n.installer_id===account.id,installer_id:undefined,
    latitude:n.installer_id===account.id?n.latitude:undefined,longitude:n.installer_id===account.id?n.longitude:undefined}))});
  }
  const read=/^\/notifications\/([\w-]+)\/read$/.exec(path);
  if(read && method==='POST') {
   await statement(env,'UPDATE installer_notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND installer_id=?',Date.now(),read[1],account.id).run();
   return response(request,{ok:true});
  }
  const action=/^\/incidents\/([\w:-]+)\/(accept|resolve)$/.exec(path);
  if(action && method==='POST') {
   const [,id,verb]=action;
   if(verb==='accept') {
    if(!account.available) fail(409,'Activa tu disponibilidad antes de aceptar.');
    const incident=await statement(env,`SELECT i.*,d.latitude,d.longitude,d.skill FROM installer_incidents i JOIN installer_devices d ON d.id=i.device_id JOIN installer_notifications n ON n.incident_id=i.id WHERE i.id=? AND n.installer_id=?`,id,account.id).first();
    const radius=Number(account.radius_km)||40;
    if(!incident || distanceKm(account,incident)>=radius || !JSON.parse(account.skills).includes(incident.skill)) fail(403,'La incidencia no está en tu zona o especialidad.');
    const result=await statement(env,`UPDATE installer_incidents SET status='assigned',installer_id=?,assigned_at=? WHERE id=? AND status='open'`,account.id,Date.now(),id).run();
    if(!result.meta.changes) fail(409,'Esta incidencia ya tiene instalador o está cerrada.');
   } else {
    const body=await jsonBody(request), resolution=text(body.resolution,20,2000);
    const result=await statement(env,`UPDATE installer_incidents SET status='resolved',resolution=?,resolved_at=? WHERE id=? AND installer_id=? AND status='assigned'`,resolution,Date.now(),id,account.id).run();
    if(!result.meta.changes) fail(409,'Solo puedes cerrar una incidencia asignada a ti.');
   }
   return response(request,{ok:true});
  }
  return response(request,{error:'Ruta no encontrada.'},404);
 } catch(e) {
  if(!e.status) console.error('Installer request failed',e.message);
  return response(request,{error:e.status?e.message:'No se pudo completar la operación. Inténtalo de nuevo.'},e.status||500);
 }
}
async function verifySignature(request,env,raw) {
 if(!env.INSTALLER_ADMIRA_SECRET) fail(503,'Integración Admira pendiente de configurar.');
 const timestamp=request.headers.get('X-Admira-Timestamp'), signature=request.headers.get('X-Admira-Signature');
 if(!/^\d{10}$/.test(timestamp||'') || Math.abs(Date.now()/1000-Number(timestamp))>300 || !/^[a-f0-9]{64}$/.test(signature||'')) fail(401,'Firma no válida.');
 const key=await crypto.subtle.importKey('raw',encoder.encode(env.INSTALLER_ADMIRA_SECRET),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const bytes=Uint8Array.from(signature.match(/../g),x=>parseInt(x,16));
 if(!await crypto.subtle.verify('HMAC',key,bytes,encoder.encode(timestamp+'.'+raw))) fail(401,'Firma no válida.');
}
export async function ingestEvent(request,env) {
 const raw=await request.text();
 if(raw.length>16384) fail(413,'Evento demasiado grande.');
 await verifySignature(request,env,raw);
 let event; try {event=JSON.parse(raw);} catch {fail(400,'JSON no válido.');}
 const id=text(event.event_id,1,160), device=event.device;
 if(!device || !['heartbeat','fault'].includes(event.type)) fail(400,'Evento no válido.');
 let deviceId=text(device.id,1,160);
 if(device.circuit_id){const link=await statement(env,'SELECT device_id FROM retailer_device_links WHERE circuit_id=? AND admira_device_id=?',text(device.circuit_id,1,120),deviceId).first();if(!link)fail(404,'Equipo del circuito no vinculado a Yokup.');deviceId=link.device_id;}
 const name=text(device.name,1,160), address=text(device.address,1,300);
 const latitude=coordinate(device.latitude,90), longitude=coordinate(device.longitude,180);
 if(!SKILLS.has(device.skill)) fail(400,'Especialidad de equipo no válida.');
 const occurred=Date.parse(event.occurred_at);
 if(!Number.isFinite(occurred) || occurred>Date.now()+60000 || occurred<Date.now()-86400000) fail(400,'Fecha del evento no válida.');
 const timeout=device.timeout_seconds??900;
 if(!Number.isInteger(timeout)||timeout<120||timeout>86400) fail(400,'Umbral de desconexión no válido.');
 const title=event.type==='fault'?text(event.title,3,200):'Equipo sin conexión';
 const now=Date.now();
 const payloadHash=await hash(raw);
 await statement(env,'INSERT OR IGNORE INTO installer_events(id,device_id,occurred_at,received_at,payload_hash) VALUES(?,?,?,?,?)',id,deviceId,occurred,now,payloadHash).run();
 const receipt=await statement(env,'SELECT * FROM installer_events WHERE id=?',id).first();
 if(receipt.payload_hash!==payloadHash) fail(409,'event_id ya usado con otro contenido.');
 const operations=[statement(env,`INSERT INTO installer_devices(id,name,latitude,longitude,address,skill,last_seen,timeout_seconds)
 SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM installer_events WHERE id=? AND applied=0)
 ON CONFLICT(id) DO UPDATE SET name=excluded.name,latitude=excluded.latitude,longitude=excluded.longitude,address=excluded.address,skill=excluded.skill,last_seen=excluded.last_seen,timeout_seconds=excluded.timeout_seconds,monitoring=1 WHERE excluded.last_seen>=installer_devices.last_seen`,deviceId,name,latitude,longitude,address,device.skill,occurred,timeout,id)];
 if(event.type==='fault') operations.push(statement(env,`INSERT OR IGNORE INTO installer_incidents(id,device_id,title,reason,status,created_at)
 SELECT ?,?,?,'fault','open',? WHERE EXISTS(SELECT 1 FROM installer_events WHERE id=? AND applied=0)
 AND EXISTS(SELECT 1 FROM installer_devices WHERE id=? AND last_seen<=?)`,'event:'+await hash(id),deviceId,title,now,id,deviceId,occurred));
 operations.push(statement(env,'UPDATE installer_events SET applied=1 WHERE id=?',id));
 await env.DB.batch(operations);
 await dispatchNotifications(env);
 return {ok:true,event_id:id};
}
export async function dispatchNotifications(env) {
 const incidents=await rows(env,`SELECT i.id,d.latitude,d.longitude,d.skill FROM installer_incidents i JOIN installer_devices d ON d.id=i.device_id WHERE i.status='open'`);
 for(const incident of incidents) {
  const box=boundingBox(incident.latitude,incident.longitude,200);
  const longitudeSql=box.allLongitudes?'1=1':box.west>box.east?'(longitude>=? OR longitude<=?)':'longitude BETWEEN ? AND ?';
  const args=[box.south,box.north,...(box.allLongitudes?[]:[box.west,box.east]),incident.id];
  const installers=await rows(env,`SELECT id,latitude,longitude,skills,radius_km,notify_zone FROM installer_accounts a WHERE available=1 AND latitude BETWEEN ? AND ? AND ${longitudeSql} AND NOT EXISTS(SELECT 1 FROM installer_notifications n WHERE n.installer_id=a.id AND n.incident_id=?)`,...args);
  const statements=[];
  for(const installer of installers) {
   if(installer.notify_zone===0) continue;
   const distance=distanceKm(installer,incident);
   const radius=Number(installer.radius_km)||40;
   if(distance<radius && JSON.parse(installer.skills).includes(incident.skill)) statements.push(statement(env,`INSERT OR IGNORE INTO installer_notifications(id,incident_id,installer_id,distance_km,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM installer_incidents WHERE id=? AND status='open')`,crypto.randomUUID(),incident.id,installer.id,distance,Date.now(),incident.id));
  }
  for(let start=0;start<statements.length;start+=80) await env.DB.batch(statements.slice(start,start+80));
 }
}
export async function sweepInstallers(env) {
 const now=Date.now();
 const devices=await rows(env,'SELECT id,last_seen FROM installer_devices WHERE monitoring=1 AND last_seen+timeout_seconds*1000<?',now);
 for(const device of devices) await statement(env,`INSERT OR IGNORE INTO installer_incidents(id,device_id,title,reason,status,created_at) SELECT ?,?,'Equipo sin conexión','offline','open',? WHERE EXISTS(SELECT 1 FROM installer_devices WHERE id=? AND last_seen=? AND monitoring=1 AND last_seen+timeout_seconds*1000<?)`,'offline:'+await hash(device.id+':'+device.last_seen),device.id,now,device.id,device.last_seen,now).run();
 await dispatchNotifications(env);
 await env.DB.batch([
  statement(env,'DELETE FROM installer_sessions WHERE expires_at<?',now),
  statement(env,'DELETE FROM installer_rate_limits WHERE expires_at<?',now),
  statement(env,'DELETE FROM retailer_sessions WHERE expires_at<?',now),
 ]);
}

export { profile as installerProfile, publicProfile as publicInstaller, session as installerSession, ORIGINS, SKILLS, encoder, fail, random, hash, statement, rows, coordinate, text, passwordHash, jsonBody, rateLimit, response };
