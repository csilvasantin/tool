import {ORIGINS,statement,rows,text,jsonBody,rateLimit,response,fail,distanceKm} from './installer-portal.js';
import {adminIdentity,adminLogout} from './portal-access.js';
const incidentSql=`SELECT i.*,d.latitude,d.longitude,d.skill,d.name AS device_name,s.name AS site_name,s.id AS site_id,r.name AS retailer_name,t.name AS installer_name FROM installer_incidents i JOIN installer_devices d ON d.id=i.device_id LEFT JOIN retailer_device_links l ON l.device_id=d.id LEFT JOIN retailer_sites s ON s.id=l.site_id LEFT JOIN retailer_accounts r ON r.id=s.retailer_id LEFT JOIN installer_accounts t ON t.id=i.installer_id`;
async function assignment(request,env,actor,b){
 const key=text(b.request_key,8,100),id=text(b.incident_id,1,100),installerId=text(b.installer_id,1,100);
 const prior=await statement(env,'SELECT * FROM portal_admin_assignments WHERE request_key=?',key).first();
 if(prior){if(prior.incident_id!==id||prior.installer_id!==installerId)fail(409,'Esta solicitud ya corresponde a otra asignación.');return response(request,{ok:prior.status==='assigned',status:prior.status,replayed:true},prior.status==='assigned'?200:409);}
 const i=await statement(env,incidentSql+' WHERE i.id=?',id).first(),a=await statement(env,'SELECT id,name,latitude,longitude,skills,available FROM installer_accounts WHERE id=?',installerId).first();
 if(!i||!a)fail(404,'Incidencia o instalador no encontrado.');if(i.status!=='open')fail(409,'La incidencia ya está asignada o resuelta.');
 if(!a.available||distanceKm(a,i)>=40||!JSON.parse(a.skills).includes(i.skill))fail(409,'El técnico debe estar disponible, tener la especialidad y encontrarse a menos de 40 km.');
 const now=Date.now();
 try{await env.DB.batch([
  statement(env,"INSERT INTO portal_admin_assignments VALUES(?,?,?,?,'pending',?)",key,id,installerId,actor.email,now),
  statement(env,`UPDATE installer_incidents SET status='assigned',installer_id=?,assigned_at=?,admin_assignment_key=? WHERE id=? AND status='open' AND EXISTS(SELECT 1 FROM installer_accounts WHERE id=? AND available=1 AND latitude=? AND longitude=? AND skills=?) AND EXISTS(SELECT 1 FROM installer_devices WHERE id=? AND latitude=? AND longitude=? AND skill=?)`,installerId,now,key,id,installerId,a.latitude,a.longitude,a.skills,i.device_id,i.latitude,i.longitude,i.skill),
  statement(env,`INSERT OR IGNORE INTO installer_notifications(id,incident_id,installer_id,distance_km,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM installer_incidents WHERE id=? AND admin_assignment_key=?)`,crypto.randomUUID(),id,installerId,distanceKm(a,i),now,id,key),
  statement(env,`UPDATE portal_admin_assignments SET status=CASE WHEN EXISTS(SELECT 1 FROM installer_incidents WHERE id=? AND admin_assignment_key=?) THEN 'assigned' ELSE 'conflict' END WHERE request_key=?`,id,key,key)
 ]);}catch(e){const duplicate=await statement(env,'SELECT request_key FROM portal_admin_assignments WHERE request_key=?',key).first();if(duplicate)return assignment(request,env,actor,b);throw e;}
 const result=await statement(env,'SELECT status FROM portal_admin_assignments WHERE request_key=?',key).first();if(result.status!=='assigned')fail(409,'Los datos cambiaron durante la asignación. Actualiza antes de reintentar.');return response(request,{ok:true,status:'assigned',incident_id:id,installer_id:installerId});
}
export async function handleAdmin(request,env){
 try{
  if(request.method==='OPTIONS')return response(request,{});
  const actor=await adminIdentity(request,env),url=new URL(request.url),path=url.pathname.slice('/api/portal-admin'.length);
  if(request.method!=='GET'&&!ORIGINS.has(request.headers.get('origin')))fail(403,'Origen no permitido.');
  await rateLimit(env,'portal-admin:'+actor.email,120,60000);
  if(path==='/me'&&request.method==='GET')return response(request,{email:actor.email,role:'superuser'});
  if(path==='/logout'&&request.method==='POST')return await adminLogout(request,env);
  if(path==='/assign'&&request.method==='POST')return await assignment(request,env,actor,await jsonBody(request));
  if(path==='/candidates'&&request.method==='GET'){
   const id=url.searchParams.get('incident_id'),siteId=url.searchParams.get('site_id');
   const place=id?await statement(env,incidentSql+' WHERE i.id=?',id).first():await statement(env,'SELECT * FROM retailer_sites WHERE id=?',siteId||'').first();if(!place)fail(404,'Selecciona un establecimiento o una incidencia.');
   const skill=id?place.skill:url.searchParams.get('skill');
   const candidates=await rows(env,'SELECT id,name,email,country,city,latitude,longitude,skills,available FROM installer_accounts WHERE available=1 AND latitude BETWEEN ? AND ?',place.latitude-.361,place.latitude+.361);
   const matches=candidates.map(a=>({...a,skills:JSON.parse(a.skills),distance_km:distanceKm(a,place)})).filter(a=>a.distance_km<40&&(!skill||a.skills.includes(skill))).sort((a,b)=>a.distance_km-b.distance_km);
   return response(request,{place,matches:matches.slice(0,100),total:matches.length,can_assign:!!id&&place.status==='open'});
  }
  if(path==='/dashboard'&&request.method==='GET'){
   const q='%'+String(url.searchParams.get('q')||'').slice(0,100)+'%',page=Math.max(0,Math.min(10000,parseInt(url.searchParams.get('page'))||0)),offset=page*50;
   const [installers,retailers,sites,incidents,counts]=await Promise.all([
    rows(env,'SELECT id,name,email,country,city,latitude,longitude,skills,available FROM installer_accounts WHERE name LIKE ? OR email LIKE ? OR city LIKE ? ORDER BY name,id LIMIT 51 OFFSET ?',q,q,q,offset),
    rows(env,'SELECT r.id,r.name,r.email,COUNT(s.id) AS sites FROM retailer_accounts r LEFT JOIN retailer_sites s ON s.retailer_id=r.id WHERE r.name LIKE ? OR r.email LIKE ? GROUP BY r.id ORDER BY r.name,r.id LIMIT 51 OFFSET ?',q,q,offset),
    rows(env,'SELECT s.id,s.name,s.kind,s.country,s.city,s.address,s.latitude,s.longitude,r.name AS retailer_name FROM retailer_sites s JOIN retailer_accounts r ON r.id=s.retailer_id WHERE s.name LIKE ? OR s.city LIKE ? OR r.name LIKE ? ORDER BY s.name,s.id LIMIT 51 OFFSET ?',q,q,q,offset),
    rows(env,incidentSql+" WHERE i.status!='resolved' AND (i.title LIKE ? OR s.name LIKE ? OR r.name LIKE ?) ORDER BY i.created_at DESC LIMIT 51 OFFSET ?",q,q,q,offset),
    statement(env,"SELECT (SELECT COUNT(*) FROM installer_accounts) AS installers,(SELECT COUNT(*) FROM retailer_accounts) AS retailers,(SELECT COUNT(*) FROM retailer_sites) AS sites,(SELECT COUNT(*) FROM installer_incidents WHERE status='open') AS open").first()
   ]);return response(request,{email:actor.email,page,has_more:[installers,retailers,sites,incidents].some(a=>a.length>50),counts,installers:installers.slice(0,50).map(a=>({...a,skills:JSON.parse(a.skills),available:!!a.available})),retailers:retailers.slice(0,50),sites:sites.slice(0,50),incidents:incidents.slice(0,50)});
  }
  fail(404,'Ruta no encontrada.');
 }catch(e){return response(request,{error:e.status?e.message:'No se pudo completar la operación.'},e.status||500);}
}
