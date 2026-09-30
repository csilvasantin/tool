// Xpacios de Admira → establecimientos y equipos de Yokup (FLT-101292 · MorfeoMacMini).
//
// Carlos, 30-sep-2026: cuando se da de alta un Xpacio en admira.app / clearchannel.tv, Yokup
// lo da de alta solo para llevar el inventario y el ciclo de vida de sus equipos. Alcance: los
// Xpacios CON GEMELO (twin o xpaceUrl). Titular: UNA cuenta de comercio por marca.
//
// PULL sin secretos: GET público del catálogo (omnipublicity-api /locations). Se excluyen los
// sitios que Yokup publica en ese mismo catálogo (ids 'yokup-…', source yokup-retailer) para no
// hacer bucle. Idempotente por catalog_hash: un Xpacio sin cambios no se reescribe. Lotes
// pequeños (BATCH) y, si queda trabajo, la siguiente pasada del cron (2 min) continúa sin
// esperar los 15 min. Nunca borra: una superficie que desaparece se marca retirada y un Xpacio
// que desaparece, removed_at. Los equipos añadidos a mano no se tocan.
// ITIL (FLT-101300): los equipos de un Xpacio con CIs ITIL los manda Yokup; la sync solo siembra (como CI
// 'catalogo') en Xpacios sin ningún CI ITIL. Ver docs/itil-yokup.md.
import {statement,rows,hash} from './installer-portal.js';
import {isoDay} from './device-lifecycle.js';
export const XPACIO_CATALOG_URL='https://brain.digitalavatar.ai/locations';
export const BRAND_EMAIL_DOMAIN='cuentas.yokup.com';
// Nunca coincide con un PBKDF2 hex: la cuenta de marca no admite contraseña (ni Google, ver createSession).
export const LOCKED_PASSWORD='!xpacio-brand-sin-acceso';
const BATCH=50,MIN_INTERVAL=15*60000,LOCK_MS=10*60000;
const CIRCUIT_BRANDS={alsea_starbucks:'alsea',alsea_mexico:'alsea',jti_xtanco:'jti'};
const CIRCUIT_COUNTRY={alsea_mexico:'MX'};
const ID_PREFIX_BRANDS=['caixabank','canalkiosk','xtanco'];
const BRAND_NAMES={alsea:'Alsea',jti:'JTI',caixabank:'CaixaBank',canalkiosk:'CanalKiosk',xtanco:'Xtanco','sin-marca':'Admira · Xpacios sin marca'};
const COMARCAS=/^(barcelon[eè]s|vall[eè]s (oriental|occidental)|baix llobregat|maresme|garraf|alt pened[eè]s)$/i;
export const slug=v=>String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const clean=(v,max)=>String(v??'').replace(/[\u0000-\u001f<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
export const brandEmail=key=>'marca+'+key+'@'+BRAND_EMAIL_DOMAIN;
export const isBrandEmail=email=>String(email||'').trim().toLowerCase().endsWith('@'+BRAND_EMAIL_DOMAIN);
export const twinOf=loc=>[loc?.twin,loc?.xpaceUrl].find(v=>typeof v==='string'&&/^https?:\/\//i.test(v.trim()))?.trim()||'';
export const isXpacio=loc=>!!loc&&typeof loc==='object'&&typeof loc.id==='string'&&!!loc.id.trim()&&!loc.id.startsWith('yokup-')&&loc.source!=='yokup-retailer'&&!!twinOf(loc);
export function brandOf(loc){
 const mapped=CIRCUIT_BRANDS[loc.circuit];if(mapped)return {key:mapped,name:BRAND_NAMES[mapped]};
 const ext=loc.external&&typeof loc.external==='object'?loc.external:{};
 const raw=[ext.operator,ext.sponsor,ext.brand].find(v=>typeof v==='string'&&slug(v));
 if(raw){const key=slug(raw).slice(0,40);return {key,name:BRAND_NAMES[key]||clean(raw,100)};}
 if(typeof loc.circuit==='string'&&slug(loc.circuit.split('_')[0])){const key=slug(loc.circuit.split('_')[0]).slice(0,40);return {key,name:BRAND_NAMES[key]||clean(loc.circuit.split('_')[0],100)};}
 const prefix=loc.id.split('-')[0].toLowerCase();if(ID_PREFIX_BRANDS.includes(prefix))return {key:prefix,name:BRAND_NAMES[prefix]};
 return {key:'sin-marca',name:BRAND_NAMES['sin-marca']};
}
export function kindOf(loc){
 const k=slug(loc.kind).replace(/-/g,' ');
 if(/cafeter|hosteler|restaur|\bbar\b|\bcafe\b/.test(k))return 'hospitality';
 if(/xtanco|estanco|tabac/.test(k))return 'tobacco';
 if(/kiosk|quiosco|kiosco/.test(k))return 'kiosk';
 if(/supermerc|supermarket/.test(k))return 'supermarket';
 return 'other';
}
export function cityOf(loc){
 if(typeof loc.city==='string'&&clean(loc.city,120).length>=2)return clean(loc.city,120);
 const parts=String(loc.addr||'').split('·').map(p=>clean(p.replace(/\b\d{4,5}\b/g,''),120)).filter(p=>p.length>=2&&!COMARCAS.test(p)&&!/^(espa[nñ]a|spain|m[eé]xico|mexico)$/i.test(p));
 return parts.at(-1)||clean(loc.province,120)||'Sin ciudad';
}
export function countryOf(loc){
 if(typeof loc.country==='string'&&/^[A-Za-z]{2}$/.test(loc.country.trim()))return loc.country.trim().toUpperCase();
 return CIRCUIT_COUNTRY[loc.circuit]||(/m[eé]xico/i.test(String(loc.addr||''))?'MX':'ES');
}
const SKILL={pantalla:'screen',escaparate:'screen',audio:'audio'};
const CATEGORY={pantalla:'pantalla',escaparate:'pantalla',mostrador:'pantalla',audio:'audio',iluminacion:'iluminacion',tpv:'tpv'};
export function surfacesOf(loc){
 const seen=new Set(),out=[];
 for(const s of Array.isArray(loc.surfaces)?loc.surfaces:[]){
  if(!s||typeof s!=='object')continue;const name=clean(s.name,160)||clean(s.surface,160);if(name.length<2)continue;
  let key=slug(name).slice(0,60)||'superficie',n=2;while(seen.has(key))key=slug(name).slice(0,56)+'-'+n++;seen.add(key);
  const type=slug(s.surface);out.push({key,name,type,skill:SKILL[type]||'kiosk',category:CATEGORY[type]||'otro'});
 }
 return out;
}
// Datos normalizados de un Xpacio; null si no se puede situar (coordenadas no válidas).
export function prepare(loc){
 const [lng,lat]=Array.isArray(loc.coords)?loc.coords.map(Number):[];
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||(lat===0&&lng===0))return null;
 const name=clean(loc.name,120).length>=2?clean(loc.name,120):clean(loc.id,120),city=cityOf(loc);
 let address=clean(loc.addr,300);if(address.length<5)address=clean([name,city].join(' · '),300);
 return {id:clean(loc.id,160),name,kind:kindOf(loc),country:countryOf(loc),city,address,latitude:lat,longitude:lng,circuit:typeof loc.circuit==='string'&&loc.circuit.trim()?clean(loc.circuit,120):null,twin:clean(twinOf(loc),600),brand:brandOf(loc),surfaces:surfacesOf(loc)};
}
export const catalogHash=p=>hash(JSON.stringify([p.id,p.name,p.kind,p.country,p.city,p.address,p.latitude,p.longitude,p.circuit,p.twin,p.brand.key,p.surfaces.map(s=>[s.key,s.name,s.type])]));
async function ensureBrands(env,needed,now){
 const known=new Map((await rows(env,'SELECT brand_key,retailer_id FROM brand_accounts')).map(b=>[b.brand_key,b.retailer_id]));
 for(const [key,name] of needed){
  if(known.has(key))continue;const email=brandEmail(key);
  // Email determinista: dos ejecuciones simultáneas no crean dos cuentas. Solo se enlaza una cuenta
  // bloqueada (sintética); si alguien hubiera registrado ese correo, la marca no se enlaza.
  await env.DB.batch([
   statement(env,'INSERT OR IGNORE INTO retailer_accounts(id,email,name,password_hash,salt,created_at) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),email,name,LOCKED_PASSWORD,'-',now),
   statement(env,'INSERT OR IGNORE INTO brand_accounts(brand_key,retailer_id,name,created_at) SELECT ?,id,?,? FROM retailer_accounts WHERE email=? AND password_hash=?',key,name,now,email,LOCKED_PASSWORD)
  ]);
  const b=await statement(env,'SELECT retailer_id FROM brand_accounts WHERE brand_key=?',key).first();if(b)known.set(key,b.retailer_id);
 }
 return known;
}
async function apply(env,p,known,retailerId,now){
 const ops=[],today=isoDay(now);let siteId=known?.site_id;
 if(!siteId){
  siteId=crypto.randomUUID();
  ops.push(statement(env,'INSERT INTO retailer_sites(id,retailer_id,name,kind,country,city,address,latitude,longitude,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',siteId,retailerId,p.name,p.kind,p.country,p.city,p.address,p.latitude,p.longitude,now));
  ops.push(statement(env,'INSERT INTO admira_xpacio_sites(site_id,admira_store_id,circuit_id,brand_key,twin_url,catalog_hash,first_seen_at,last_synced_at) VALUES(?,?,?,?,?,?,?,?)',siteId,p.id,p.circuit,p.brand.key,p.twin,p.hash,now,now));
 }else{
  ops.push(statement(env,'UPDATE retailer_sites SET retailer_id=?,name=?,kind=?,country=?,city=?,address=?,latitude=?,longitude=? WHERE id=?',retailerId,p.name,p.kind,p.country,p.city,p.address,p.latitude,p.longitude,siteId));
  ops.push(statement(env,'UPDATE admira_xpacio_sites SET circuit_id=?,brand_key=?,twin_url=?,catalog_hash=?,last_synced_at=?,removed_at=NULL WHERE site_id=?',p.circuit,p.brand.key,p.twin,p.hash,now,siteId));
 }
 // ITIL (FLT-101300): si el Xpacio ya tiene algún CI 'itil', los EQUIPOS los manda Yokup. La sync solo refresca
 // el establecimiento: no siembra, no renombra, no retira ni reactiva ningún equipo (ni los 'catalogo' que retiró ITIL).
 if(known&&await statement(env,"SELECT 1 AS x FROM itil_items WHERE site_id=? AND managed_by='itil' LIMIT 1",siteId).first()){await env.DB.batch(ops);return 'itil';}
 // Un equipo que ITIL ya adoptó nunca lo toca el catálogo (defensivo: con uno solo, la línea anterior ya corta).
 const existing=known?await rows(env,"SELECT x.device_id,x.surface_key,x.removed_at FROM admira_xpacio_devices x LEFT JOIN itil_items i ON i.device_id=x.device_id WHERE x.admira_store_id=? AND COALESCE(i.managed_by,'catalogo')='catalogo'",p.id):[];
 const byKey=new Map(existing.map(e=>[e.surface_key,e]));
 for(const s of p.surfaces){
  const e=byKey.get(s.key);
  if(!e){
   const id='xpacio-'+crypto.randomUUID();
   ops.push(statement(env,'INSERT INTO installer_devices(id,name,latitude,longitude,address,skill,last_seen,monitoring) VALUES(?,?,?,?,?,?,?,0)',id,s.name,p.latitude,p.longitude,p.address,s.skill,now));
   ops.push(statement(env,'INSERT INTO retailer_device_links(device_id,site_id,circuit_id,admira_store_id,admira_device_id,linked_at,created_at) VALUES(?,?,?,?,?,?,?)',id,siteId,p.circuit,p.id,p.id+':'+s.key,now,now));
   ops.push(statement(env,'INSERT INTO admira_xpacio_devices(device_id,admira_store_id,surface_key,surface_name) VALUES(?,?,?,?)',id,p.id,s.key,s.name));
   // Ficha vacía: solo la categoría que se deduce de la superficie. Sin fechas ni fabricante inventados.
   ops.push(statement(env,"INSERT OR IGNORE INTO device_lifecycle(device_id,category,status,updated_at,updated_by) VALUES(?,?,'operational',?,'xpacio-sync')",id,s.category,now));
   // CI provisional 'catalogo' (sin código): lo sustituye el primer CI ITIL del Xpacio (src/itil.js).
   ops.push(statement(env,"INSERT OR IGNORE INTO itil_items(device_id,site_id,itil_code,category,managed_by,created_by,updated_by,created_at,updated_at) VALUES(?,?,NULL,?,'catalogo','xpacio-sync','xpacio-sync',?,?)",id,siteId,s.category,now,now));
  }else{
   ops.push(statement(env,'UPDATE installer_devices SET name=?,latitude=?,longitude=?,address=? WHERE id=?',s.name,p.latitude,p.longitude,p.address,e.device_id));
   ops.push(statement(env,'UPDATE retailer_device_links SET site_id=?,circuit_id=?,admira_store_id=? WHERE device_id=?',siteId,p.circuit,p.id,e.device_id));
   ops.push(statement(env,'UPDATE admira_xpacio_devices SET surface_name=?,removed_at=NULL WHERE device_id=?',s.name,e.device_id));
   ops.push(statement(env,"INSERT OR IGNORE INTO itil_items(device_id,site_id,itil_code,category,managed_by,created_by,updated_by,created_at,updated_at) VALUES(?,?,NULL,?,'catalogo','xpacio-sync','xpacio-sync',?,?)",e.device_id,siteId,s.category,now,now));
   // Vuelve al catálogo: solo se reactiva si la retirada la hizo la sincronización, no una persona.
   if(e.removed_at)ops.push(statement(env,"UPDATE device_lifecycle SET status='operational',retired_at=NULL,updated_at=?,updated_by='xpacio-sync' WHERE device_id=? AND status='retired' AND updated_by='xpacio-sync'",now,e.device_id));
  }
 }
 const current=new Set(p.surfaces.map(s=>s.key));
 for(const e of existing)if(!current.has(e.surface_key)&&!e.removed_at){
  ops.push(statement(env,'UPDATE admira_xpacio_devices SET removed_at=? WHERE device_id=?',now,e.device_id));
  ops.push(statement(env,"INSERT INTO device_lifecycle(device_id,status,retired_at,updated_at,updated_by) VALUES(?,'retired',?,?,'xpacio-sync') ON CONFLICT(device_id) DO UPDATE SET status='retired',retired_at=excluded.retired_at,updated_at=excluded.updated_at,updated_by=excluded.updated_by WHERE device_lifecycle.status!='retired'",e.device_id,today,now));
 }
 await env.DB.batch(ops);
}
export async function syncXpacios(env,{fetcher=env.XPACIO_FETCH||fetch,force=false,trigger='cron',now=Date.now(),batch=BATCH}={}){
 if(!env.DB)return {skipped:'no_db'};
 const last=await statement(env,'SELECT * FROM xpacio_sync_runs ORDER BY started_at DESC LIMIT 1').first();
 if(last&&!last.finished_at&&now-last.started_at<LOCK_MS)return {skipped:'running'};
 if(!force&&last&&!(last.pending>0)&&now-last.started_at<MIN_INTERVAL)return {skipped:'recent'};
 const run=crypto.randomUUID(),stats={seen:0,created:0,updated:0,removed:0,pending:0,invalid:0,skipped_brands:0,itil_managed:0};let error=null;
 await statement(env,'INSERT INTO xpacio_sync_runs(id,trigger,started_at) VALUES(?,?,?)',run,trigger,now).run();
 try{
  const r=await fetcher(env.XPACIO_CATALOG_URL||XPACIO_CATALOG_URL,{headers:{accept:'application/json','user-agent':'yokup-api/xpacio-sync'},signal:AbortSignal.timeout(25000)});
  if(!r.ok)throw Error('catalog_http_'+r.status);
  const body=await r.json(),list=Array.isArray(body)?body:Array.isArray(body?.locations)?body.locations:null;
  if(!list)throw Error('catalog_shape');
  const xpacios=[...new Map(list.filter(isXpacio).map(l=>[l.id.trim(),l])).values()].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  stats.seen=xpacios.length;
  const known=new Map((await rows(env,'SELECT site_id,admira_store_id,catalog_hash,removed_at FROM admira_xpacio_sites')).map(k=>[k.admira_store_id,k]));
  const todo=[];
  for(const loc of xpacios){const p=prepare(loc);if(!p){stats.invalid++;continue;}p.hash=await catalogHash(p);const k=known.get(p.id);if(!k||k.catalog_hash!==p.hash||k.removed_at)todo.push({p,k});}
  const slice=todo.slice(0,batch);stats.pending=todo.length-slice.length;
  const brands=await ensureBrands(env,new Map(slice.map(({p})=>[p.brand.key,p.brand.name])),now);
  for(const {p,k} of slice){
   const owner=brands.get(p.brand.key);if(!owner){stats.skipped_brands++;continue;}
   const applied=await apply(env,p,k,owner,now);if(!k)stats.created++;else stats.updated++;if(applied==='itil')stats.itil_managed++;
  }
  // Desaparecidos: solo con un catálogo completo y sano (un catálogo recortado no «borra» nada).
  const active=[...known.values()].filter(k=>!k.removed_at),present=new Set(xpacios.map(l=>l.id.trim()));
  if(active.length>=10&&xpacios.length<active.length*0.5)error='catalog_shrunk';
  else{
   const gone=active.filter(k=>!present.has(k.admira_store_id));
   for(let n=0;n<gone.length;n+=50)await env.DB.batch(gone.slice(n,n+50).map(k=>statement(env,'UPDATE admira_xpacio_sites SET removed_at=? WHERE site_id=? AND removed_at IS NULL',now,k.site_id)));
   stats.removed=gone.length;
  }
  if(stats.skipped_brands&&!error)error='brand_account_unavailable';
 }catch(e){error=String(e?.message||e).slice(0,160);}
 await statement(env,'UPDATE xpacio_sync_runs SET finished_at=?,seen=?,created=?,updated=?,removed=?,pending=?,error=? WHERE id=?',Date.now(),stats.seen,stats.created,stats.updated,stats.removed,stats.pending,error,run).run();
 return {run,...stats,error};
}
export async function scheduledXpacioSync(env){try{return await syncXpacios(env);}catch(e){console.error('xpacio_sync_failed',e?.message);return null;}}
// Estado para el superusuario: últimas ejecuciones, cuentas de marca, Xpacios, equipos y miembros.
export async function xpacioStatus(env){
 const [runs,brands,members]=await Promise.all([
  rows(env,'SELECT * FROM xpacio_sync_runs ORDER BY started_at DESC LIMIT 5'),
  rows(env,`SELECT b.brand_key,b.name,b.retailer_id,(SELECT COUNT(*) FROM admira_xpacio_sites x WHERE x.brand_key=b.brand_key AND x.removed_at IS NULL) AS active,(SELECT COUNT(*) FROM admira_xpacio_sites x WHERE x.brand_key=b.brand_key AND x.removed_at IS NOT NULL) AS removed,(SELECT COUNT(*) FROM admira_xpacio_devices d JOIN admira_xpacio_sites x ON x.admira_store_id=d.admira_store_id WHERE x.brand_key=b.brand_key AND d.removed_at IS NULL) AS devices FROM brand_accounts b ORDER BY b.name`),
  rows(env,'SELECT m.retailer_id,m.email,m.role,m.granted_by,m.created_at FROM retailer_account_members m JOIN brand_accounts b ON b.retailer_id=m.retailer_id WHERE m.revoked_at IS NULL ORDER BY m.retailer_id,m.email')
 ]);
 return {catalog_url:env.XPACIO_CATALOG_URL||XPACIO_CATALOG_URL,last_run:runs[0]||null,runs,brands:brands.map(b=>({...b,members:members.filter(m=>m.retailer_id===b.retailer_id)}))};
}
