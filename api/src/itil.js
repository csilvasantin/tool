// ITIL · inventario tecnológico de los Xpacios (FLT-101300 · MorfeoMacMini · 30-sep-2026). Docs: docs/itil-yokup.md.
// Yokup es el MAESTRO de los equipos de cada Xpacio; las soluciones de la Galaxia (XpaceOS, Pixeria, admira.app,
// clearchannel.tv) consumen. El Xpacio (establecimiento) sigue naciendo en el catálogo de Admira.
//  · Un CI = un equipo (installer_devices) + ficha itil_items + ciclo de vida (device_lifecycle).
//  · itil_ci_upsert es idempotente por itil_code (único global). Nada se borra: se retira.
//  · Al crear o adoptar un CI 'itil', los equipos 'catalogo' del Xpacio se retiran («Sustituido por ITIL»),
//    salvo los que tienen incidencias abiertas (se retiran en el siguiente alta, ya cerradas).
//  · Tres puertas: portal/MCP del comercio (perímetro del titular), /internal/itil/* solo por service binding
//    (MCP de flota, desde el gate) y la lectura pública de la Galaxia (sin datos privados; completa con clave).
import {statement,rows,hash,rateLimit} from './installer-portal.js';
import {isoDay,validDay,lifecycleView,LIFECYCLE_COLUMNS} from './device-lifecycle.js';
import {viaBinding,INTERNAL_HOST} from './incident-links.js';
import {ITIL_SCHEMA,ITIL_CATEGORIES,ITIL_ORIENTATIONS,ITIL_LIFECYCLE_TEXTS,ITIL_LIFECYCLE_DATES,ITIL_LIFECYCLE_FIELDS,ITIL_LIMITS,validItilCode,lifecycleCategory,skillForCategory,publicCi,parseEquipoRef,equipoCategory,equipoLabel} from './itil-model.js';
// Intercambio de dominios (Carlos, 4-oct-2026): admira.biz pasa a servir la solución de negocio
// (Pages clearchannel-tv). admira.app se conserva mientras dure la transición.
export const GALAXY_ORIGINS=new Set(['https://www.xpaceos.com','https://xpaceos.com','https://www.pixeria.com','https://pixeria.com','https://www.admira.app','https://admira.app','https://www.admira.biz','https://admira.biz','https://www.clearchannel.tv','https://clearchannel.tv']);
export const ITIL_DOCS='https://www.yokup.com/mcp/llms.txt';
const bad=(status,code,message)=>{throw Object.assign(new Error(message),{status,code});};
const CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;
const ID=/^[\w:-]{1,180}$/,STORE=/^[A-Za-z0-9][\w.:-]{0,159}$/;
function optText(v,[,max],field){
 if(v===null||v===undefined||v==='')return null;
 if(typeof v!=='string'||v.trim().length>max||CONTROL.test(v))bad(400,'invalid_'+field,'Revisa '+field+' (máximo '+max+' caracteres).');
 return v.trim()||null;
}
// Valida TODO antes de escribir nada. has = campos presentes (lo omitido se conserva al actualizar).
export function parseCi(b){
 if(!b||typeof b!=='object'||Array.isArray(b))bad(400,'invalid_body','JSON no válido.');
 const allowed=['itil_code','name','category','role','group_name','position','orientation','parent_itil_code','lifecycle','adopt_device_id'];
 const extra=Object.keys(b).filter(k=>!allowed.includes(k));if(extra.length)bad(400,'unknown_fields','Campos no válidos: '+extra.join(', ')+'.');
 if(!validItilCode(b.itil_code))bad(400,'invalid_itil_code','Código ITIL no válido: 2 a 4 bloques de 2-12 mayúsculas o cifras separados por guion (p. ej. PDG103-PAN-01).');
 const name=typeof b.name==='string'?b.name.trim():'';
 if(name.length<ITIL_LIMITS.name[0]||name.length>ITIL_LIMITS.name[1]||CONTROL.test(name))bad(400,'invalid_name','El nombre del equipo debe tener de 2 a 160 caracteres.');
 if(!ITIL_CATEGORIES.includes(b.category))bad(400,'invalid_category','Categoría no válida: '+ITIL_CATEGORIES.join(', ')+'.');
 const v={itil_code:b.itil_code,name,category:b.category},has=new Set(['name','category']);
 for(const f of ['role','group_name','position'])if(Object.hasOwn(b,f)){v[f]=optText(b[f],ITIL_LIMITS[f],f);has.add(f);}
 if(Object.hasOwn(b,'orientation')){const o=b.orientation||null;if(o!==null&&!ITIL_ORIENTATIONS.includes(o))bad(400,'invalid_orientation','Orientación no válida: horizontal o vertical.');v.orientation=o;has.add('orientation');}
 if(Object.hasOwn(b,'parent_itil_code')){const p=b.parent_itil_code||null;if(p!==null&&!validItilCode(p))bad(400,'invalid_parent','parent_itil_code no es un código ITIL válido.');if(p===b.itil_code)bad(400,'invalid_parent','Un equipo no puede depender de sí mismo.');v.parent_itil_code=p;has.add('parent');}
 if(b.adopt_device_id!==undefined&&b.adopt_device_id!==null){if(typeof b.adopt_device_id!=='string'||!ID.test(b.adopt_device_id))bad(400,'invalid_device','adopt_device_id no válido.');v.adopt_device_id=b.adopt_device_id;}
 if(b.lifecycle!==undefined&&b.lifecycle!==null){
  const l=b.lifecycle;if(typeof l!=='object'||Array.isArray(l))bad(400,'invalid_lifecycle','lifecycle debe ser un objeto.');
  const wrong=Object.keys(l).filter(k=>!ITIL_LIFECYCLE_FIELDS.includes(k));if(wrong.length)bad(400,'invalid_lifecycle','Campos de ciclo de vida no válidos: '+wrong.join(', ')+'.');
  v.lifecycle={};
  for(const [k,x] of Object.entries(l)){
   if(x===null||x===''){v.lifecycle[k]=null;continue;}
   if(ITIL_LIFECYCLE_DATES.includes(k)){if(!validDay(x))bad(400,'invalid_date','Fecha no válida en '+k+' (usa AAAA-MM-DD).');v.lifecycle[k]=x;}
   else if(k==='maintenance_interval_days'){if(!Number.isInteger(x)||x<1||x>3650)bad(400,'invalid_interval','El intervalo de mantenimiento debe ser de 1 a 3650 días.');v.lifecycle[k]=x;}
   else if(k==='warranty_months'){if(!Number.isInteger(x)||x<1||x>600)bad(400,'invalid_warranty_months','La garantía debe ser de 1 a 600 meses.');v.lifecycle[k]=x;}
   else v.lifecycle[k]=optText(x,[0,ITIL_LIFECYCLE_TEXTS[k]],k);
  }
 }
 return {v,has};
}
const SITE_SELECT='SELECT s.*,x.admira_store_id,x.circuit_id,x.brand_key,x.twin_url,x.removed_at AS xpacio_removed_at FROM retailer_sites s LEFT JOIN admira_xpacio_sites x ON x.site_id=s.id';
export const xpacioSite=(env,storeId)=>statement(env,SITE_SELECT+' WHERE x.admira_store_id=?',storeId).first();
export async function ownerSite(env,owner,{site_id,admira_store_id}){
 if(!site_id&&!admira_store_id)bad(400,'site_required','Indica site_id o admira_store_id.');
 const s=site_id?await statement(env,SITE_SELECT+' WHERE s.id=? AND s.retailer_id=?',String(site_id).slice(0,80),owner).first():await statement(env,SITE_SELECT+' WHERE x.admira_store_id=? AND s.retailer_id=?',String(admira_store_id).slice(0,160),owner).first();
 if(!s)bad(404,'site_not_found','Establecimiento no encontrado en tus Xpacios.');return s;
}
const CI_SELECT=`SELECT i.*,d.name,d.skill,p.itil_code AS parent_code,xd.surface_key,(SELECT COUNT(*) FROM installer_incidents n WHERE n.device_id=i.device_id AND n.status!='resolved') AS open_incidents,${LIFECYCLE_COLUMNS}
 FROM itil_items i JOIN installer_devices d ON d.id=i.device_id LEFT JOIN itil_items p ON p.device_id=i.parent_device_id LEFT JOIN admira_xpacio_devices xd ON xd.device_id=i.device_id LEFT JOIN device_lifecycle lc ON lc.device_id=i.device_id`;
function ciView(r,today){
 const lc={};for(const [k,x] of Object.entries(r))if(k.startsWith('lc_'))lc[k.slice(3)]=x;
 const lifecycle=lifecycleView(lc.device_id?lc:null,r.skill,today);
 return {device_id:r.device_id,itil_code:r.itil_code,name:r.name,category:r.category,role:r.role,group_name:r.group_name,position:r.position,orientation:r.orientation,
  parent_itil_code:r.parent_code||null,managed_by:r.managed_by,surface_key:r.surface_key||null,open_incidents:r.open_incidents||0,
  created_by:r.created_by,updated_by:r.updated_by,created_at:r.created_at,updated_at:r.updated_at,lifecycle};
}
const ORDER=' ORDER BY i.managed_by DESC,COALESCE(i.group_name,\'~\'),COALESCE(i.position,\'~\'),i.itil_code,d.name';
// Inventario privado de un establecimiento: Xpacio + CIs + ciclo de vida completo + equipos aún sin ficha.
export async function inventory(env,site,now=Date.now()){
 const today=isoDay(now),cis=(await rows(env,CI_SELECT+' WHERE i.site_id=?'+ORDER,site.id)).map(r=>ciView(r,today));
 const unmanaged=await rows(env,'SELECT d.id AS device_id,d.name,d.skill FROM retailer_device_links l JOIN installer_devices d ON d.id=l.device_id WHERE l.site_id=? AND NOT EXISTS(SELECT 1 FROM itil_items i WHERE i.device_id=d.id) ORDER BY d.name',site.id);
 const active=cis.filter(c=>c.lifecycle.status!=='retired'),itil=cis.some(c=>c.managed_by==='itil');
 return {today,managed_by:itil?'itil':'catalogo',site:{id:site.id,name:site.name,city:site.city,country:site.country},
  xpacio:site.admira_store_id?{admira_store_id:site.admira_store_id,brand_key:site.brand_key,circuit_id:site.circuit_id,twin_url:site.twin_url,removed_at:site.xpacio_removed_at}:null,
  stats:{total:cis.length,active:active.length,itil:cis.filter(c=>c.managed_by==='itil').length,catalogo:active.filter(c=>c.managed_by==='catalogo').length,
   warranty_expiring:active.filter(c=>c.lifecycle.warranty==='expiring').length,warranty_expired:active.filter(c=>c.lifecycle.warranty==='expired').length},
  cis,unmanaged};
}
const audit=(env,actor,channel,action,code,device,site,detail,now)=>statement(env,'INSERT INTO itil_audit(id,at,actor,channel,action,itil_code,device_id,site_id,detail) VALUES(?,?,?,?,?,?,?,?,?)',crypto.randomUUID(),now,String(actor).slice(0,254),channel,action,code,device,site,detail==null?null:String(detail).slice(0,500));
function lifecycleUpsert(env,deviceId,values,actor,now){
 const cols=Object.keys(values);
 return statement(env,`INSERT INTO device_lifecycle(device_id,${[...cols,'updated_at','updated_by'].join(',')}) VALUES(${['?',...cols.map(()=>'?'),'?','?'].join(',')}) ON CONFLICT(device_id) DO UPDATE SET ${[...cols,'updated_at','updated_by'].map(c=>c+'=excluded.'+c).join(',')}`,deviceId,...cols.map(c=>values[c]),now,String(actor).slice(0,254));
}
// Retira los equipos sembrados por el catálogo (sin incidencias abiertas) de un Xpacio que ya tiene ITIL.
export async function retireCatalog(env,siteId,actor,channel,now=Date.now()){
 const today=isoDay(now);
 const found=await rows(env,`SELECT i.device_id,d.name FROM itil_items i JOIN installer_devices d ON d.id=i.device_id LEFT JOIN device_lifecycle lc ON lc.device_id=i.device_id WHERE i.site_id=? AND i.managed_by='catalogo' AND COALESCE(lc.status,'operational')!='retired'
  AND NOT EXISTS(SELECT 1 FROM installer_incidents n WHERE n.device_id=i.device_id AND n.status!='resolved')`,siteId);
 if(!found.length)return [];
 await env.DB.batch(found.flatMap(f=>[
  statement(env,`INSERT INTO device_lifecycle(device_id,status,retired_at,notes,updated_at,updated_by) VALUES(?,'retired',?,'Sustituido por ITIL',?,?) ON CONFLICT(device_id) DO UPDATE SET status='retired',retired_at=excluded.retired_at,
   notes=CASE WHEN device_lifecycle.notes IS NULL OR device_lifecycle.notes='' THEN excluded.notes ELSE device_lifecycle.notes||' · '||excluded.notes END,updated_at=excluded.updated_at,updated_by=excluded.updated_by`,f.device_id,today,now,String(actor).slice(0,254)),
  statement(env,"UPDATE itil_items SET updated_by=?,updated_at=? WHERE device_id=? AND managed_by='catalogo'",String(actor).slice(0,254),now,f.device_id),
  audit(env,actor,channel,'retire-catalog',null,f.device_id,siteId,'Sustituido por ITIL: '+f.name,now)
 ]));
 return found.map(f=>({device_id:f.device_id,name:f.name}));
}
// Alta, adopción o actualización de un CI, idempotente por itil_code.
export async function upsertCi(env,site,body,actor,channel,now=Date.now()){
 const {v,has}=parseCi(body),today=isoDay(now);
 const byCode=await statement(env,'SELECT i.*,d.name FROM itil_items i JOIN installer_devices d ON d.id=i.device_id WHERE i.itil_code=?',v.itil_code).first();
 if(byCode&&byCode.site_id!==site.id)bad(409,'itil_code_taken','Ese código ITIL ya está en uso en otro establecimiento.');
 let target=byCode,adopted=false;
 if(v.adopt_device_id&&(!byCode||byCode.device_id!==v.adopt_device_id)){
  if(byCode)bad(409,'itil_code_taken','Ese código ITIL ya identifica a otro equipo de este establecimiento.');
  const d=await statement(env,'SELECT d.id,d.name,i.managed_by,i.itil_code FROM installer_devices d JOIN retailer_device_links l ON l.device_id=d.id LEFT JOIN itil_items i ON i.device_id=d.id WHERE d.id=? AND l.site_id=?',v.adopt_device_id,site.id).first();
  if(!d)bad(404,'device_not_found','Equipo a adoptar no encontrado en este establecimiento.');
  if(d.managed_by==='itil')bad(409,'already_itil','Ese equipo ya es un CI ITIL ('+d.itil_code+').');
  adopted=true;target={device_id:d.id,name:d.name,managed_by:d.managed_by||null};
 }
 let parentId=target?.parent_device_id??null;
 if(has.has('parent')){
  parentId=null;
  if(v.parent_itil_code){
   const p=await statement(env,"SELECT device_id,parent_device_id FROM itil_items WHERE itil_code=? AND site_id=? AND managed_by='itil'",v.parent_itil_code,site.id).first();
   if(!p)bad(404,'parent_not_found','El equipo padre '+v.parent_itil_code+' no existe en este establecimiento.');
   // Sin ciclos: subiendo desde el padre no se puede llegar a este equipo.
   let cur=p,hops=0;while(cur&&hops++<20){if(target&&cur.device_id===target.device_id)bad(400,'parent_cycle','Esa relación crearía un ciclo.');cur=cur.parent_device_id?await statement(env,'SELECT device_id,parent_device_id FROM itil_items WHERE device_id=?',cur.parent_device_id).first():null;}
   parentId=p.device_id;
  }
 }
 const lcNow=target?await statement(env,'SELECT * FROM device_lifecycle WHERE device_id=?',target.device_id).first():null;
 const lc={};for(const [k,x] of Object.entries(v.lifecycle||{}))if((lcNow?.[k]??null)!==x)lc[k]=x;
 const cat=lifecycleCategory(v.category);if((lcNow?.category??null)!==cat)lc.category=cat;
 const merged={...(lcNow||{}),...lc};if(merged.warranty_start&&merged.warranty_end&&merged.warranty_end<merged.warranty_start)bad(400,'invalid_warranty','La garantía no puede terminar antes de empezar.');
 const who=String(actor).slice(0,254),ops=[];let deviceId,created=false,changed=[];
 if(!target){
  created=true;deviceId='itil-'+crypto.randomUUID();
  ops.push(statement(env,'INSERT INTO installer_devices(id,name,latitude,longitude,address,skill,last_seen,monitoring) VALUES(?,?,?,?,?,?,?,0)',deviceId,v.name,site.latitude,site.longitude,site.address,skillForCategory(v.category),now));
  ops.push(statement(env,'INSERT INTO retailer_device_links(device_id,site_id,circuit_id,admira_store_id,admira_device_id,linked_at,created_at) VALUES(?,?,?,?,?,?,?)',deviceId,site.id,site.circuit_id||null,site.admira_store_id||null,site.admira_store_id?v.itil_code:null,site.admira_store_id?now:null,now));
  ops.push(statement(env,"INSERT INTO itil_items(device_id,site_id,itil_code,category,role,group_name,position,orientation,parent_device_id,managed_by,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'itil',?,?,?,?)",deviceId,site.id,v.itil_code,v.category,v.role??null,v.group_name??null,v.position??null,v.orientation??null,parentId,who,who,now,now));
  changed=['created'];
 }else{
  deviceId=target.device_id;
  const cur=adopted?null:target;
  for(const f of ['category','role','group_name','position','orientation'])if(has.has(f)&&(cur?.[f]??null)!==(v[f]??null))changed.push(f);
  if(has.has('parent')&&(cur?.parent_device_id??null)!==parentId)changed.push('parent');
  if(target.name!==v.name)changed.push('name');
  if(adopted){
   // Adopción: el equipo (sembrado por el catálogo o dado de alta a mano) pasa a mandarlo ITIL, conservando su historial.
   ops.push(statement(env,`INSERT INTO itil_items(device_id,site_id,itil_code,category,role,group_name,position,orientation,parent_device_id,managed_by,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'itil',?,?,?,?)
    ON CONFLICT(device_id) DO UPDATE SET itil_code=excluded.itil_code,category=excluded.category,role=excluded.role,group_name=excluded.group_name,position=excluded.position,orientation=excluded.orientation,parent_device_id=excluded.parent_device_id,managed_by='itil',updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
    deviceId,site.id,v.itil_code,v.category,v.role??null,v.group_name??null,v.position??null,v.orientation??null,parentId,who,who,now,now));
   if(site.admira_store_id)ops.push(statement(env,'UPDATE retailer_device_links SET admira_device_id=?,admira_store_id=COALESCE(admira_store_id,?) WHERE device_id=?',v.itil_code,site.admira_store_id,deviceId));
   changed=['adopted',...changed];
  }else if(changed.length){
   const sets=[],vals=[];
   for(const f of ['category','role','group_name','position','orientation'])if(has.has(f)){sets.push(f+'=?');vals.push(v[f]??null);}
   if(has.has('parent')){sets.push('parent_device_id=?');vals.push(parentId);}
   ops.push(statement(env,`UPDATE itil_items SET ${[...sets,'updated_by=?','updated_at=?'].join(',')} WHERE device_id=?`,...vals,who,now,deviceId));
  }
  if(target.name!==v.name)ops.push(statement(env,'UPDATE installer_devices SET name=? WHERE id=?',v.name,deviceId));
  if(has.has('category')&&(cur?.category??null)!==v.category)ops.push(statement(env,'UPDATE installer_devices SET skill=? WHERE id=?',skillForCategory(v.category),deviceId));
 }
 if(Object.keys(lc).length){ops.push(lifecycleUpsert(env,deviceId,lc,who,now));if(!created)changed.push('lifecycle');}
 if(ops.length){
  if(!created&&!adopted)ops.push(statement(env,'UPDATE itil_items SET updated_by=?,updated_at=? WHERE device_id=?',who,now,deviceId));
  ops.push(audit(env,who,channel,created?'create':adopted?'adopt':'update',v.itil_code,deviceId,site.id,changed.join(','),now));
  try{await env.DB.batch(ops);}catch(e){if(String(e).includes('UNIQUE'))bad(409,'itil_code_taken','Ese código ITIL ya está en uso.');throw e;}
 }
 const retired=created||adopted?await retireCatalog(env,site.id,who,channel,now):[];
 const ci=ciView(await statement(env,CI_SELECT+' WHERE i.device_id=?',deviceId).first(),today);
 return {ok:true,created,adopted,changed:changed.length>0,changes:changed,itil_code:v.itil_code,device_id:deviceId,retired_catalog:retired,ci};
}
export async function retireCi(env,siteFilter,code,note,actor,channel,now=Date.now()){
 if(!validItilCode(code))bad(400,'invalid_itil_code','Código ITIL no válido.');
 const text=typeof note==='string'?note.trim():'';if(text.length<ITIL_LIMITS.note[0]||text.length>ITIL_LIMITS.note[1]||CONTROL.test(text))bad(400,'note_required','Explica el motivo de la retirada (3 a 300 caracteres).');
 const ci=await statement(env,`SELECT i.*,s.retailer_id,lc.status FROM itil_items i JOIN retailer_sites s ON s.id=i.site_id LEFT JOIN device_lifecycle lc ON lc.device_id=i.device_id WHERE i.itil_code=?`,code).first();
 if(!ci||(siteFilter&&!siteFilter(ci)))bad(404,'not_found','CI no encontrado.');
 const who=String(actor).slice(0,254);
 if(ci.status==='retired')return {ok:true,changed:false,itil_code:code,device_id:ci.device_id};
 await env.DB.batch([
  statement(env,`INSERT INTO device_lifecycle(device_id,status,retired_at,notes,updated_at,updated_by) VALUES(?,'retired',?,?,?,?) ON CONFLICT(device_id) DO UPDATE SET status='retired',retired_at=excluded.retired_at,
   notes=CASE WHEN device_lifecycle.notes IS NULL OR device_lifecycle.notes='' THEN excluded.notes ELSE device_lifecycle.notes||' · '||excluded.notes END,updated_at=excluded.updated_at,updated_by=excluded.updated_by`,ci.device_id,isoDay(now),'Retirado: '+text,now,who),
  statement(env,'UPDATE itil_items SET updated_by=?,updated_at=? WHERE device_id=?',who,now,ci.device_id),
  audit(env,who,channel,'retire',code,ci.device_id,ci.site_id,text,now)
 ]);
 const open=await statement(env,"SELECT COUNT(*) AS n FROM installer_incidents WHERE device_id=? AND status!='resolved'",ci.device_id).first();
 return {ok:true,changed:true,itil_code:code,device_id:ci.device_id,open_incidents:open?.n||0};
}
export async function listXpacios(env,{brand,q,limit=50}={}){
 const where=['x.removed_at IS NULL'],args=[];
 if(brand){where.push('x.brand_key=?');args.push(String(brand).slice(0,40));}
 if(q){const like='%'+String(q).slice(0,120).replace(/[\\%_]/g,m=>'\\'+m)+'%';where.push("(s.name LIKE ? ESCAPE '\\' OR x.admira_store_id LIKE ? ESCAPE '\\' OR s.city LIKE ? ESCAPE '\\')");args.push(like,like,like);}
 const n=Number(limit);if(!Number.isInteger(n)||n<1||n>200)bad(400,'invalid_limit','limit debe ser de 1 a 200.');
 const list=await rows(env,`SELECT x.admira_store_id,x.brand_key,b.name AS brand_name,s.id AS site_id,s.name,s.city,s.country,x.twin_url,
  (SELECT COUNT(*) FROM itil_items i WHERE i.site_id=s.id AND i.managed_by='itil') AS itil_cis,
  (SELECT COUNT(*) FROM itil_items i LEFT JOIN device_lifecycle lc ON lc.device_id=i.device_id WHERE i.site_id=s.id AND i.managed_by='catalogo' AND COALESCE(lc.status,'operational')!='retired') AS catalog_cis
  FROM admira_xpacio_sites x JOIN retailer_sites s ON s.id=x.site_id LEFT JOIN brand_accounts b ON b.brand_key=x.brand_key WHERE ${where.join(' AND ')} ORDER BY s.name,x.admira_store_id LIMIT ?`,...args,n);
 return {limit:n,xpacios:list.map(x=>({...x,managed_by:x.itil_cis>0?'itil':'catalogo'}))};
}
// ── Equipo de una incidencia → su CI (01-oct-2026). Lo pide la ficha de incidencia de Yokup (yokup-rtc, por binding)
// con el «Equipo» del ticket (screen), el establecimiento (loc) y, si la lleva el Portal, su incidencia. Orden:
// código ITIL · incidencia del Portal · id del equipo · id del censo (admira_device_id) · gemelo 'demo:<xpacio>:<equipo>'
// (superficie, id del censo, nombre igual al del id o categoría única en ese Xpacio). Si no casa, dice por qué y qué alta proponer.
const SLUG=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
export async function resolveEquipo(env,{ref='',loc='',code='',portal_incident=''}={},now=Date.now()){
 const today=isoDay(now),clean=v=>typeof v==='string'?v.trim().slice(0,200):'';
 ref=clean(ref);loc=clean(loc);code=clean(code);portal_incident=clean(portal_incident);
 const ciBy=async(where,...a)=>{const r=await statement(env,CI_SELECT+' WHERE '+where,...a).first();return r?ciView(r,today):null;};
 const siteOf=async deviceId=>statement(env,SITE_SELECT+' JOIN retailer_device_links l ON l.site_id=s.id WHERE l.device_id=?',deviceId).first();
 const xpacioOut=site=>site?{site_id:site.id,name:site.name,city:site.city||null,admira_store_id:site.admira_store_id||null,twin_url:site.twin_url||null}:null;
 const hit=async(ci,match)=>({ok:true,found:true,match,ref,ci,xpacio:xpacioOut(await siteOf(ci.device_id))});
 const byDevice=async(deviceId,match)=>{
  if(!deviceId)return null;const ci=await ciBy('i.device_id=?',deviceId);if(ci)return hit(ci,match);
  const d=await statement(env,'SELECT d.id,d.name,d.skill FROM installer_devices d WHERE d.id=?',deviceId).first();if(!d)return null;
  const site=await siteOf(d.id);
  // Existe el equipo, pero sin ficha ITIL: se propone convertirlo en CI conservando su historial.
  return {ok:true,found:false,reason:'sin_ficha',ref,device:{id:d.id,name:d.name},xpacio:xpacioOut(site),
   create:{admira_store_id:site?.admira_store_id||null,site_id:site?.id||null,adopt_device_id:d.id,name:d.name,category:equipoCategory(d.skill==='screen'?'pantalla':d.skill)||'otro'}};
 };
 const c=validItilCode(code)?code:validItilCode(ref)?ref:'';
 if(c){const ci=await ciBy('i.itil_code=?',c);if(ci)return hit(ci,'itil_code');}
 if(portal_incident&&ID.test(portal_incident)){const i=await statement(env,'SELECT device_id FROM installer_incidents WHERE id=?',portal_incident).first();const r=await byDevice(i?.device_id,'portal');if(r)return r;}
 if(ref&&ID.test(ref)){const r=await byDevice(ref,'device');if(r)return r;}
 const store=STORE.test(loc)?loc:null;
 if(ref){const l=await statement(env,'SELECT device_id FROM retailer_device_links WHERE admira_device_id=?'+(store?' AND admira_store_id=?':'')+' LIMIT 2',ref,...(store?[store]:[])).first();const r=l&&await byDevice(l.device_id,'censo');if(r)return r;}
 const p=parseEquipoRef(ref);
 const sid=p?.admira_store_id||store,site=sid?await xpacioSite(env,sid):null;
 const equipo=p?.equipo||'',category=equipoCategory(equipo);
 const create={admira_store_id:site?.admira_store_id||sid||null,site_id:site?.id||null,category:category||null,name:equipo?equipoLabel(equipo):null};
 if(!site)return {ok:true,found:false,reason:sid?'xpacio_no_encontrado':'sin_referencia',ref,parsed:p,xpacio:null,create};
 if(equipo){
  const l=await statement(env,'SELECT device_id FROM retailer_device_links WHERE site_id=? AND admira_device_id=?',site.id,equipo).first()
   ||await statement(env,'SELECT device_id FROM admira_xpacio_devices WHERE admira_store_id=? AND surface_key=? AND removed_at IS NULL',site.admira_store_id,SLUG(equipo).slice(0,60)).first();
  if(l){const r=await byDevice(l.device_id,'superficie');if(r?.found)return r;}
  // Nombre igual al del propio id ('pantalla-3' → «Pantalla 3»), único y activo en ese Xpacio.
  const byName=(await rows(env,CI_SELECT+" WHERE i.site_id=? AND lower(d.name)=lower(?) AND COALESCE(lc.status,'operational')!='retired' LIMIT 2",site.id,equipoLabel(equipo))).map(r=>ciView(r,today));
  if(byName.length===1)return hit(byName[0],'nombre');
  if(category){
   const list=(await rows(env,CI_SELECT+" WHERE i.site_id=? AND i.category=? AND COALESCE(lc.status,'operational')!='retired' ORDER BY i.managed_by DESC,i.itil_code",site.id,category)).map(r=>ciView(r,today));
   const itil=list.filter(x=>x.managed_by==='itil'),pool=itil.length?itil:list;
   if(pool.length===1)return hit(pool[0],'categoria');
   if(pool.length>1)return {ok:true,found:false,reason:'ambiguo',ref,parsed:p,xpacio:xpacioOut(site),candidates:pool.slice(0,20).map(x=>({itil_code:x.itil_code,name:x.name,position:x.position||null})),create};
  }
 }
 return {ok:true,found:false,reason:'no_inventariado',ref,parsed:p,xpacio:xpacioOut(site),create};
}
// ── /internal/itil/* · solo por service binding (MCP de flota desde el gate). El autor lo pone el gate.
const internalReply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
function author(b){
 const ok=v=>typeof v==='string'&&v.trim().length>=1&&v.length<=80&&!CONTROL.test(v);
 if(!ok(b.actor)||!ok(b.machine))bad(400,'author_required','actor y machine requeridos.');
 return b.actor.trim()+' · '+b.machine.trim();
}
export async function handleItilInternal(request,env){
 if(!viaBinding(request,INTERNAL_HOST))return internalReply({ok:false,code:'not_found',error:'Ruta no encontrada.'},404);
 try{
  const url=new URL(request.url),path=url.pathname,q=url.searchParams;
  if(request.method==='GET'&&path==='/internal/itil/xpacios')return internalReply({ok:true,...await listXpacios(env,{brand:q.get('brand'),q:q.get('q'),limit:q.has('limit')?Number(q.get('limit')):50})});
  const one=/^\/internal\/itil\/xpacios\/([^/]+)$/.exec(path);
  if(request.method==='GET'&&path==='/internal/itil/equipo')return internalReply(await resolveEquipo(env,{ref:q.get('ref')||'',loc:q.get('loc')||'',code:q.get('code')||'',portal_incident:q.get('portal_incident')||''}));
  if(request.method==='GET'&&one){const id=decodeURIComponent(one[1]);if(!STORE.test(id))bad(400,'invalid_store','admira_store_id no válido.');const site=await xpacioSite(env,id);if(!site)bad(404,'xpacio_not_found','Xpacio no encontrado en Yokup.');return internalReply({ok:true,...await inventory(env,site)});}
  if(request.method!=='POST'||!['/internal/itil/ci/upsert','/internal/itil/ci/retire'].includes(path))bad(404,'not_found','Ruta no encontrada.');
  const raw=await request.text();if(raw.length>16384)bad(413,'too_large','Petición demasiado grande.');
  let b;try{b=JSON.parse(raw);}catch{b=null;}if(!b||typeof b!=='object'||Array.isArray(b))bad(400,'invalid_body','JSON no válido.');
  const {actor,machine,...rest}=b,who=author({actor,machine});
  if(path.endsWith('/retire'))return internalReply(await retireCi(env,ci=>!!ci.site_id,rest.itil_code,rest.note,who,'mcp-flota'));
  const {admira_store_id,...ci}=rest;if(typeof admira_store_id!=='string'||!STORE.test(admira_store_id))bad(400,'invalid_store','admira_store_id no válido.');
  const site=await xpacioSite(env,admira_store_id);if(!site)bad(404,'xpacio_not_found','Xpacio no encontrado en Yokup.');
  return internalReply(await upsertCi(env,site,ci,who,'mcp-flota'));
 }catch(e){
  if(!e.status)console.error('itil_internal_failed',e.message);
  return internalReply({ok:false,code:e.code||'unavailable',error:e.status?e.message:'No se pudo aplicar.'},e.status||500);
 }
}
// ── Lectura para la Galaxia: GET https://data.yokup.com/api/itil/xpacios/:admira_store_id
// Sin clave: solo lo mínimo (Xpacio, marca y recuento por categoría). Con X-Yokup-Itil-Key: CIs sin datos privados.
const READ_KEY=/^yki_[a-f0-9]{64}$/;
function galaxyHeaders(request,cache){
 const origin=request.headers.get('origin'),h={'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Vary':'Origin, X-Yokup-Itil-Key','Cache-Control':cache};
 if(origin&&GALAXY_ORIGINS.has(origin))Object.assign(h,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'X-Yokup-Itil-Key','Access-Control-Max-Age':'600'});
 return h;
}
export async function handleItilPublic(request,env,now=Date.now()){
 const out=(body,status=200,cache='no-store')=>new Response(JSON.stringify(body),{status,headers:galaxyHeaders(request,cache)});
 const origin=request.headers.get('origin');
 if(origin&&!GALAXY_ORIGINS.has(origin))return out({error:'origin_not_allowed',documentation:ITIL_DOCS},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:galaxyHeaders(request,'no-store')});
 if(request.method!=='GET')return out({error:'method_not_allowed'},405);
 const m=/^\/api\/itil\/xpacios\/([^/]+)$/.exec(new URL(request.url).pathname);let id='';try{id=m?decodeURIComponent(m[1]):'';}catch{}
 if(!STORE.test(id))return out({error:'not_found',documentation:ITIL_DOCS},404);
 try{
  const raw=request.headers.get('x-yokup-itil-key');let key=null;
  if(raw!==null){
   if(!READ_KEY.test(raw))return out({error:'invalid_key',documentation:ITIL_DOCS},401);
   key=await statement(env,'SELECT * FROM itil_read_keys WHERE key_hash=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?)',await hash(raw),now).first();
   if(!key)return out({error:'invalid_key',documentation:ITIL_DOCS},401);
   const origins=JSON.parse(key.origins||'[]');if(origin&&origins.length&&!origins.includes(origin))return out({error:'origin_not_allowed_for_key'},403);
   await rateLimit(env,'itil-key:'+key.id,1200,60000);
   await statement(env,'UPDATE itil_read_keys SET last_used_at=? WHERE id=? AND (last_used_at IS NULL OR last_used_at<?)',now,key.id,now-60000).run();
  }else await rateLimit(env,'itil-pub:'+(request.headers.get('CF-Connecting-IP')||'local'),60,60000);
  const site=await xpacioSite(env,id),brands=key?.brands?JSON.parse(key.brands):null;
  if(!site||site.xpacio_removed_at||(brands&&!brands.includes(site.brand_key)))return out({error:'xpacio_not_found',documentation:ITIL_DOCS},404,'public, max-age=60');
  const inv=await inventory(env,site,now),brand=await statement(env,'SELECT name FROM brand_accounts WHERE brand_key=?',site.brand_key).first();
  const includeRetired=!!key&&new URL(request.url).searchParams.get('include_retired')==='true';
  const cis=inv.cis.filter(c=>includeRetired||c.lifecycle.status!=='retired').map(c=>publicCi({...c,parent_code:c.parent_itil_code,status:c.lifecycle.status,warranty:c.lifecycle.warranty,maintenance_due:c.lifecycle.maintenance_due}));
  const byCategory={};for(const c of cis)byCategory[c.category]=(byCategory[c.category]||0)+1;
  const base={schema:ITIL_SCHEMA,generated_at:new Date(now).toISOString(),xpacio:{admira_store_id:site.admira_store_id,name:site.name,brand:brand?.name||site.brand_key},managed_by:inv.managed_by,summary:{total:cis.length,by_category:byCategory},documentation:ITIL_DOCS};
  if(!key)return out({...base,access:'public',note:'Sin clave solo se publica el recuento. Las soluciones de la Galaxia piden su clave de lectura (cabecera X-Yokup-Itil-Key).'},200,'public, max-age=60');
  return out({...base,access:'key',solution:key.solution,xpacio:{...base.xpacio,city:site.city,twin_url:site.twin_url},cis},200,'private, max-age=60');
 }catch(e){
  if(e.status===429)return out({error:'rate_limited'},429);
  console.error('itil_public_failed',e.message);return out({error:'unavailable'},503);
 }
}
