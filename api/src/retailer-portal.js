import {publishOwnedSite} from './retailer-map-catalog.js';
import {siteImports,circuitSiteImports} from './retailer-site-imports.js';
import {portalCredentials} from './portal-credentials.js';
import {demoLogin} from './demo-accounts.js';
import { ORIGINS, SKILLS, encoder, fail, random, hash, statement, rows, coordinate, text, passwordHash, jsonBody, rateLimit, response, dispatchNotifications } from './installer-portal.js';
import {channelOf,afterRating,sweepDesk} from './incident-desk.js';
import {retailerAccess} from './retailer-accounts.js';
import {isBrandEmail} from './admira-xpacio-sync.js';
import {isoDay,LIFECYCLE_COLUMNS,withLifecycle,lifecycleStats,readLifecycle,updateLifecycle,inventory,alerts} from './device-lifecycle.js';
import {ownerSite,inventory as itilInventory,upsertCi,retireCi} from './itil.js';
import {lecturaRetailerGate} from './lectura-box.js';
const COOKIE='__Host-yk_retailer';
const cookieToken=request=>(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
const publicAccount=({id,name,email})=>({id,name,email});
// Sesión propia o delegada («Ver como»): la delegada se revalida en cada petición contra el miembro o superusuario vigente.
async function authenticated(request,env){
 const token=cookieToken(request);
 if(!token||!/^[a-f0-9]{64}$/.test(token))fail(401,'Entra en tu cuenta de comercio.');
 const found=await statement(env,`SELECT a.*,x.actor_email,x.actor_kind,x.origin_retailer_id,m.role AS member_role,su.email AS superuser_email FROM retailer_sessions s JOIN retailer_accounts a ON a.id=s.retailer_id LEFT JOIN retailer_session_actors x ON x.token_hash=s.token_hash
  LEFT JOIN retailer_account_members m ON x.actor_kind='member' AND m.retailer_id=a.id AND m.email=x.actor_email AND m.revoked_at IS NULL
  LEFT JOIN portal_superusers su ON x.actor_kind='superuser' AND su.email=x.actor_email AND su.revoked_at IS NULL AND EXISTS(SELECT 1 FROM brand_accounts b WHERE b.retailer_id=a.id)
  WHERE s.token_hash=? AND s.expires_at>?`,await hash(token),Date.now()).first();
 if(!found)fail(401,'Tu sesión ha caducado. Vuelve a entrar.');
 const {actor_email,actor_kind,origin_retailer_id,member_role,superuser_email,...account}=found;
 if(actor_email?!(member_role||superuser_email):account.password_hash.startsWith('!'))fail(401,'Tu acceso a esta cuenta ya no está vigente. Vuelve a entrar.');
 account.access=actor_email?{delegated:true,actor_email,actor_kind,origin_retailer_id,role:member_role||'superuser'}:{delegated:false,role:'owner'};
 return account;
}
// Las cuentas de marca (hash bloqueado '!…') nunca abren sesión propia: solo «Ver como» (retailer-accounts.js).
async function createSession(env,id,expectedHash){if(String(expectedHash).startsWith('!'))fail(403,'Esta cuenta de marca se abre desde «Ver como» con un usuario autorizado.');const token=random();const created=await statement(env,'INSERT INTO retailer_sessions SELECT ?,?,? FROM retailer_accounts WHERE id=? AND password_hash=?',await hash(token),id,Date.now()+30*86400000,id,expectedHash).run();if(!created.meta.changes)fail(401,'La contraseña ha cambiado. Vuelve a entrar.');return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`;}
async function ownDevice(env,id,owner){const d=await statement(env,`SELECT d.*,l.site_id,l.circuit_id,l.admira_device_id,s.retailer_id FROM installer_devices d JOIN retailer_device_links l ON l.device_id=d.id JOIN retailer_sites s ON s.id=l.site_id WHERE d.id=? AND s.retailer_id=?`,id,owner).first();if(!d)fail(404,'Equipo no encontrado en tus establecimientos.');return d;}
async function ownIncident(env,id,owner){const i=await statement(env,`SELECT i.* FROM installer_incidents i JOIN retailer_device_links l ON l.device_id=i.device_id JOIN retailer_sites s ON s.id=l.site_id WHERE i.id=? AND s.retailer_id=?`,id,owner).first();if(!i)fail(404,'Incidencia no encontrada en tus establecimientos.');return i;}
// Integrations (XpaceOS, admira.store, agents) tag their origin as a description prefix: no migration, no deploy-order risk.
const FOLLOW='https://www.yokup.com/retailer/incidencia?id=',SOURCE=/^\[Origen: ([a-z0-9][a-z0-9.-]{0,31})\] /;
const INCIDENT_SELECT=`SELECT i.*,d.name AS device_name,d.skill,l.site_id,l.circuit_id,l.admira_device_id,s.name AS site_name,t.name AS technician_name,rd.description,rd.priority,rr.stars,rr.satisfied,rr.comment,rr.followup_id,rr.created_at AS rated_at,p.start_at AS appointment_start,p.end_at AS appointment_end,p.timezone AS appointment_timezone,p.scope AS appointment_scope,p.cost_cents AS appointment_cost_cents,il.rtc_ticket_id AS yokup_ticket
 FROM installer_incidents i JOIN installer_devices d ON d.id=i.device_id JOIN retailer_device_links l ON l.device_id=d.id JOIN retailer_sites s ON s.id=l.site_id LEFT JOIN installer_accounts t ON t.id=i.installer_id LEFT JOIN retailer_incident_details rd ON rd.incident_id=i.id LEFT JOIN retailer_ratings rr ON rr.incident_id=i.id LEFT JOIN call_cases cc ON cc.incident_id=i.id LEFT JOIN call_proposals p ON p.case_id=cc.id AND p.status='confirmed' LEFT JOIN incident_links il ON il.installer_incident_id=i.id`;
const LIST_FILTERS={all:'1=1',open:"i.status='open'",assigned:"i.status='assigned'",resolved:"i.status='resolved'",to_rate:"i.status='resolved' AND rr.incident_id IS NULL"};
function sourceOf(value){if(value===undefined||value===null||value==='')return null;const v=typeof value==='string'?value.trim().toLowerCase():'';if(!/^[a-z0-9][a-z0-9.-]{0,31}$/.test(v))fail(400,'Origen no válido (hasta 32 letras, números, punto o guion).');return v;}
function present(i){const m=SOURCE.exec(i.description||'');return {...i,description:m?i.description.slice(m[0].length):i.description,source:m?m[1]:null,follow_url:FOLLOW+encodeURIComponent(i.id),timeline:[['reported',i.created_at],['assigned',i.assigned_at],['resolved',i.resolved_at],['rated',i.rated_at]].map(([step,at])=>({step,at:at||null}))};}
async function dashboard(env,owner){
 const today=isoDay(Date.now());
 const sites=await rows(env,'SELECT s.*,i.external_ref,i.sync_status,i.admira_store_id AS imported_admira_store_id,c.id AS catalog_id,c.created_at AS published_at,x.admira_store_id AS xpacio_id,x.twin_url AS xpacio_twin_url,x.removed_at AS xpacio_removed_at FROM retailer_sites s LEFT JOIN retailer_site_import_items i ON i.site_id=s.id LEFT JOIN admira_retailer_locations c ON c.site_id=s.id LEFT JOIN admira_xpacio_sites x ON x.site_id=s.id WHERE s.retailer_id=? ORDER BY s.created_at',owner);
 // Cada equipo lleva su ficha de ciclo de vida y el estado calculado de garantía y mantenimiento.
 const devices=(await rows(env,`SELECT d.*,l.site_id,l.circuit_id,l.admira_store_id,l.admira_device_id,l.linked_at,xd.surface_key AS xpacio_surface,${LIFECYCLE_COLUMNS} FROM installer_devices d JOIN retailer_device_links l ON l.device_id=d.id JOIN retailer_sites s ON s.id=l.site_id LEFT JOIN admira_xpacio_devices xd ON xd.device_id=d.id LEFT JOIN device_lifecycle lc ON lc.device_id=d.id WHERE s.retailer_id=? ORDER BY d.name`,owner)).map(d=>withLifecycle(d,today));
 const incidents=(await rows(env,INCIDENT_SELECT+` WHERE s.retailer_id=? AND (i.status!='resolved' OR i.id IN (SELECT ri.id FROM installer_incidents ri JOIN retailer_device_links rl ON rl.device_id=ri.device_id JOIN retailer_sites rs ON rs.id=rl.site_id WHERE rs.retailer_id=? AND ri.status='resolved' ORDER BY ri.created_at DESC LIMIT 200)) ORDER BY i.created_at DESC`,owner,owner)).map(present);
 const stats=await statement(env,`SELECT COUNT(CASE WHEN i.status='open' THEN 1 END) AS open,COUNT(CASE WHEN i.status='assigned' THEN 1 END) AS assigned,COUNT(CASE WHEN i.status='resolved' AND r.incident_id IS NULL THEN 1 END) AS awaiting_rating FROM installer_incidents i JOIN retailer_device_links l ON l.device_id=i.device_id JOIN retailer_sites s ON s.id=l.site_id LEFT JOIN retailer_ratings r ON r.incident_id=i.id WHERE s.retailer_id=?`,owner).first();
 return {sites,devices,incidents,stats:{...stats,...lifecycleStats(devices)}};
}
async function retailerItil(request,env,owner,path,actor,channel){
 const q=new URL(request.url).searchParams,method=request.method;
 if(path==='/itil'&&method==='GET')return [{sites:await rows(env,`SELECT s.id AS site_id,s.name,s.city,x.admira_store_id,(SELECT COUNT(*) FROM itil_items i WHERE i.site_id=s.id AND i.managed_by='itil') AS itil_cis,(SELECT COUNT(*) FROM itil_items i LEFT JOIN device_lifecycle lc ON lc.device_id=i.device_id WHERE i.site_id=s.id AND i.managed_by='catalogo' AND COALESCE(lc.status,'operational')!='retired') AS catalog_cis FROM retailer_sites s LEFT JOIN admira_xpacio_sites x ON x.site_id=s.id WHERE s.retailer_id=? ORDER BY s.name`,owner)}];
 if(path==='/itil/inventory'&&method==='GET')return [await itilInventory(env,await ownerSite(env,owner,{site_id:q.get('site_id'),admira_store_id:q.get('admira_store_id')}))];
 if(path==='/itil/cis'&&method==='POST'){const {site_id,admira_store_id,request_key,...ci}=await jsonBody(request);const r=await upsertCi(env,await ownerSite(env,owner,{site_id,admira_store_id}),ci,actor,channel);return [r,r.created?201:200];}
 const retire=/^\/itil\/cis\/([A-Z0-9-]{5,51})\/retire$/.exec(path);
 if(retire&&method==='POST'){const b=await jsonBody(request);return [await retireCi(env,ci=>ci.retailer_id===owner,retire[1],b.note,actor,channel)];}
 fail(404,'Ruta no encontrada.');
}
export async function handleRetailer(request,env,principal){
 try{
  const path=decodeURIComponent(new URL(request.url).pathname.replace('/api/retailer','')),method=request.method;
  if(method==='OPTIONS')return response(request,{});
  if(path==='/health'&&method==='GET')return response(request,{ok:true,admira_configured:!!env.ADMIRA_CIRCUIT_SECRET});
  const lectura=await lecturaRetailerGate(request,env);
  if(lectura?.blocked)return response(request,{error:'Clave de solo lectura.'},403);
  if(lectura?.missing)return response(request,{error:'La cuenta de la marca 365 no está disponible.'},503);
  if(method!=='GET'&&!ORIGINS.has(request.headers.get('origin')))fail(403,'Origen no permitido.');
  if(['/register','/login'].includes(path)&&method==='POST'){
   await rateLimit(env,'retail-ip:'+(request.headers.get('CF-Connecting-IP')||'local'),20,900000);
   const b=await jsonBody(request),demo=path==='/login'&&demoLogin('retailer',b);
   if(demo){const account=await statement(env,'SELECT * FROM retailer_accounts WHERE email=?',demo).first();if(!account)fail(401,'Correo o contraseña incorrectos.');return response(request,{profile:publicAccount(account)},200,await createSession(env,account.id,account.password_hash));}
   const email=text(b.email,3,254).toLowerCase(),password=text(b.password,12,128);
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Correo no válido.');
   if(path==='/register'&&isBrandEmail(email))fail(400,'Ese dominio está reservado a las cuentas de marca de Yokup.');
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
  if(path==='/accounts'||path==='/switch'){if(principal)fail(404,'Ruta no encontrada.');return await retailerAccess(request,env,path,{authenticated,createSession,cookieToken,cookieName:COOKIE});}
  const account=principal||lectura?.account||await authenticated(request,env),owner=account.id,access=account.access||{delegated:false,role:'owner'};
  if(access.delegated){
   if(path.startsWith('/mcp-tokens')||path==='/mcp-audit')fail(403,'Los tokens de agentes se gestionan desde la propia cuenta, no en modo «Ver como».');
   if(access.role==='viewer'&&method!=='GET'&&path!=='/logout')fail(403,'Tienes acceso de solo lectura a esta cuenta.');
  }
  if(path.startsWith('/mcp-tokens')||path==='/mcp-audit')return await portalCredentials(request,env,'retailer',account,path);
  if(path==='/me'&&method==='GET')return response(request,{profile:publicAccount(account),access:{role:access.role,delegated:access.delegated,actor_email:access.actor_email||null,can_edit:access.role!=='viewer'}});
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
  const lifecycle=/^\/devices\/([\w:-]+)\/lifecycle$/.exec(path);
  if(lifecycle&&method==='GET')return response(request,await readLifecycle(env,await ownDevice(env,lifecycle[1],owner)));
  if(lifecycle&&method==='PUT'){const device=await ownDevice(env,lifecycle[1],owner);return response(request,await updateLifecycle(env,device,await jsonBody(request),access.actor_email||account.email));}
  // ITIL (FLT-101300): inventario tecnológico del establecimiento, en el perímetro del titular (docs/itil-yokup.md).
  if(path.startsWith('/itil'))return response(request,...await retailerItil(request,env,owner,path,access.actor_email||account.email,principal?'mcp-comercio':'portal'));
  if(path==='/inventory'&&method==='GET')return response(request,await inventory(env,owner,new URL(request.url).searchParams));
  if(path==='/alerts'&&method==='GET')return response(request,await alerts(env,owner,new URL(request.url).searchParams));
  if(path==='/incidents'&&method==='GET'){
   const q=new URL(request.url).searchParams,status=q.get('status')||'all',site=q.get('site_id'),limit=q.has('limit')?Number(q.get('limit')):50;
   if(!Object.hasOwn(LIST_FILTERS,status))fail(400,'Estado no válido: open, assigned, resolved, to_rate o all.');if(!Number.isInteger(limit)||limit<1||limit>200)fail(400,'limit debe ser de 1 a 200.');
   const incidents=(await rows(env,INCIDENT_SELECT+` WHERE s.retailer_id=? AND ${LIST_FILTERS[status]}${site?' AND s.id=?':''} ORDER BY i.created_at DESC LIMIT ?`,owner,...(site?[text(site,1,80)]:[]),limit)).map(present);
   return response(request,{status,site_id:site||null,limit,incidents});
  }
  const single=/^\/incidents\/([\w:-]+)$/.exec(path);
  if(single&&method==='GET'){const i=await ownIncident(env,single[1],owner);return response(request,{incident:present(await statement(env,INCIDENT_SELECT+' WHERE i.id=? AND s.retailer_id=?',i.id,owner).first())});}
  if(path==='/incidents'&&method==='POST'){
   const b=await jsonBody(request),device=await ownDevice(env,text(b.device_id,1,180),owner),title=text(b.title,3,200),source=sourceOf(b.source),priority=b.priority==='urgent'?'urgent':'normal',key=text(b.request_key,8,100);
   const description=(source?'[Origen: '+source+'] ':'')+text(b.description,10,2000);if(description.length>2000)fail(400,'La descripción es demasiado larga (máximo 2000 caracteres con el origen).');
   const follow=id=>({follow_url:FOLLOW+encodeURIComponent(id)});
   const previous=await statement(env,'SELECT * FROM retailer_incident_details WHERE retailer_id=? AND request_key=?',owner,key).first();
   if(previous){const i=await ownIncident(env,previous.incident_id,owner);if(i.device_id!==device.id||i.title!==title||previous.description!==description||previous.priority!==priority)fail(409,'Este envío ya se utilizó con otros datos.');return response(request,{id:i.id,duplicate:true,...follow(i.id)});}
   const active=await statement(env,"SELECT id FROM installer_incidents WHERE device_id=? AND status!='resolved'",device.id).first();if(active)return response(request,{id:active.id,duplicate:true,message:'Ya hay una incidencia abierta para este equipo.',...follow(active.id)});
   const id='retail-'+crypto.randomUUID();
   try{await env.DB.batch([statement(env,"INSERT INTO installer_incidents(id,device_id,title,reason,status,created_at,channel,round_started_at) VALUES(?,?,?,'retailer','open',?,?,?)",id,device.id,title,Date.now(),channelOf(b.channel),Date.now()),statement(env,'INSERT INTO retailer_incident_details VALUES(?,?,?,?,?,?)',id,owner,description,priority,null,key)]);}catch(e){if(String(e).includes('UNIQUE')){const current=await statement(env,"SELECT id FROM installer_incidents WHERE device_id=? AND status!='resolved'",device.id).first();if(current)return response(request,{id:current.id,duplicate:true,...follow(current.id)});fail(409,'El envío ya se ha registrado. Actualiza la lista.');}throw e;}
   // Notification recovery is retried by the existing two-minute sweep if this request fails.
   if(channelOf(b.channel)==='digital')await sweepDesk(env);else await dispatchNotifications(env);return response(request,{id,channel:channelOf(b.channel),source,...follow(id)},201);
  }
  // Cerrar incidencia desde el comercio (Carlos, 7-oct-2026: «si damos de alta una incidencia tenemos que poder cerrarla»).
  // Idempotente: una ya resuelta responde applied:false. El cierre viaja a Yokup (incident_links) y de ahí al gemelo de admira.store.
  const closeOne=/^\/incidents\/([\w:-]+)\/close$/.exec(path);
  if(closeOne&&method==='POST'){
   const incident=await ownIncident(env,closeOne[1],owner),b=await jsonBody(request),note=typeof b.note==='string'?b.note.trim().slice(0,500):'',actor=access.actor_email||account.email;
   if(incident.status==='resolved')return response(request,{id:incident.id,status:'resolved',applied:false,resolution:incident.resolution||null,resolved_at:incident.resolved_at||null});
   const now=Date.now(),resolution='Cerrada por el comercio'+(note?': '+note:'.');
   const r=await statement(env,"UPDATE installer_incidents SET status='resolved',resolution=?,resolved_at=? WHERE id=? AND status!='resolved'",resolution,now,incident.id).run();
   if(r.meta&&r.meta.changes)await statement(env,'INSERT INTO incident_timeline(id,incident_id,kind,detail,created_at) VALUES(?,?,?,?,?)',crypto.randomUUID(),incident.id,'cerrada_comercio',(resolution+' · '+actor).slice(0,500),now).run();
   return response(request,{id:incident.id,status:'resolved',applied:!!(r.meta&&r.meta.changes),resolution,resolved_at:now,closed_by:actor});
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
 }catch(e){if(!e.status)console.error('Retailer request failed',e.message);return response(request,{error:e.status?e.message:'No se pudo completar la operación. Conserva tus datos y vuelve a intentarlo.',...(e.status&&e.code?{code:e.code}:{})},e.status||500);}
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
