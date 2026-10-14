// Plano maestro del Xpacio en Yokup (DCL-fbee86b0016fa4cef7a7726c · Hoy #186 · SubNeoMBP14 · 14-oct-2026). Docs: docs/plano-yokup.md.
// Carlos: los clientes globales de las 5 soluciones comparten planos e inventario ITIL — admira.biz comercializa,
// admira.app (Yokup) mantiene, admira.studio adapta contenidos, admira.store lo demuestra con el gemelo, todo lanzado
// desde admira.tv. Yokup ya era el maestro del ITIL; ahora también lo es del PLANO (admira.xpacio-plano/1).
//  · Un plano vigente por establecimiento (xpacio_planos) + histórico append-only (xpacio_plano_versions).
//  · Upsert idempotente por SHA-256 del JSON canónico: repetir el mismo plano no escribe nada (changed:false).
//  · Validación estructural (xpacio-plano-model.js) y cruce con el ITIL del establecimiento: avisos, nunca errores.
//  · Tres puertas, como el ITIL: portal/MCP del comercio (perímetro del titular), /internal/plano/* solo por service
//    binding (MCP de flota, desde el gate) y la lectura de la Galaxia (mínimo sin clave; completo y sin datos privados con yki_).
import {statement,rows,rateLimit,response} from './installer-portal.js';
import {viaBinding,INTERNAL_HOST} from './incident-links.js';
import {ownerSite,xpacioSite,siteById,author,GALAXY_ORIGINS,galaxyHeaders,galaxyKey} from './itil.js';
import {PLANO_SCHEMA,PLANO_READ_SCHEMA,PLANO_DOCS,PLANO_MAX_BYTES,validatePlan,planHash,planSummary,crossCheck,publicPlan} from './xpacio-plano-model.js';
const bad=(status,code,message,extra={})=>{throw Object.assign(new Error(message),{status,code,...extra});};
const STORE=/^[A-Za-z0-9][\w.:-]{0,159}$/,SITE=/^[\w-]{1,80}$/,SHA=/^[a-f0-9]{64}$/;
// Cabe el plano con sangría: el límite que manda es el del JSON compacto (PLANO_MAX_BYTES).
const RAW_MAX=2*PLANO_MAX_BYTES+4096;
// jsonBody del portal corta en 16 KB, que no da para un plano.
export async function planBody(request){
 if(+(request.headers.get('content-length')||0)>RAW_MAX)bad(413,'plan_too_large','Petición demasiado grande: el plano admite hasta 256 KB.');
 const raw=await request.text();if(raw.length>RAW_MAX)bad(413,'plan_too_large','Petición demasiado grande: el plano admite hasta 256 KB.');
 let b;try{b=JSON.parse(raw);}catch{b=null;}
 if(!b||typeof b!=='object'||Array.isArray(b))bad(400,'invalid_body','JSON no válido.');
 return b;
}
// CIs del establecimiento para el cruce (código, categoría, estado de su ficha).
const ciRows=(env,siteId)=>rows(env,"SELECT i.itil_code,i.category,i.managed_by,d.name,COALESCE(lc.status,'operational') AS status FROM itil_items i JOIN installer_devices d ON d.id=i.device_id LEFT JOIN device_lifecycle lc ON lc.device_id=i.device_id WHERE i.site_id=? ORDER BY i.itil_code",siteId);
// Vista de flota: sin correos. Quien guardó desde el portal o el MCP del comercio sale como «titular»; los agentes, con su
// «Persona · Máquina» (el autor del gate nunca es un correo).
const actorView=(fleet,v)=>fleet&&/@/.test(String(v??''))?'titular':v;
const meta=(r,fleet=false)=>r?{plan_id:r.plan_id,schema:r.schema,version:r.version,sha256:r.sha256,seq:r.seq,screens:r.screens,bytes:r.bytes,source:r.source,updated_by:actorView(fleet,r.updated_by),updated_at:r.updated_at,
 ...(r.created_by?{created_by:actorView(fleet,r.created_by),created_at:r.created_at}:{})}:null;
// Vista privada (portal y MCP): plano vigente (o la versión seq del histórico), cruce con el ITIL y últimas versiones.
// fleet:true = vista del MCP de flota, sin correos de los titulares. El plano va entero: un agente que lo edite y lo
// vuelva a guardar no debe perder campos (la dirección incluida); por eso la flota solo llega a lo permitido (fleetSite).
export async function readPlan(env,site,{history=10,seq=null,fleet=false}={}){
 const n=Number(history);if(!Number.isInteger(n)||n<0||n>50)bad(400,'invalid_history','history debe ser de 0 a 50.');
 const cur=await statement(env,'SELECT * FROM xpacio_planos WHERE site_id=?',site.id).first();let row=cur;
 if(seq!==null&&seq!==undefined&&seq!==''){
  const s=Number(seq);if(!Number.isInteger(s)||s<1)bad(400,'invalid_seq','seq no válido.');
  row=await statement(env,'SELECT * FROM xpacio_plano_versions WHERE site_id=? AND seq=?',site.id,s).first();if(!row)bad(404,'version_not_found','Esa versión del plano no existe.');
 }
 const plan=row?JSON.parse(row.plan_json):null;
 const versions=(n?await rows(env,'SELECT seq,plan_id,version,sha256,screens,bytes,source,updated_by,updated_at FROM xpacio_plano_versions WHERE site_id=? ORDER BY seq DESC LIMIT ?',site.id,n):[]).map(h=>({...h,updated_by:actorView(fleet,h.updated_by)}));
 return {site:{id:site.id,name:site.name,city:site.city,country:site.country},
  xpacio:site.admira_store_id?{admira_store_id:site.admira_store_id,brand_key:site.brand_key,twin_url:site.twin_url,removed_at:site.xpacio_removed_at}:null,
  has_plan:!!cur,current:meta(cur,fleet),...(row&&row!==cur?{selected:meta(row,fleet)}:{}),plan,itil_check:plan?crossCheck(plan,await ciRows(env,site.id)):null,history:versions};
}
// Alta o nueva versión del plano de un establecimiento. Idempotente por hash, ANTES que cualquier conflicto: si el
// vigente ya es este plano, changed:false aunque base_sha256 no cuadre (nada que pisar). base_sha256 (opcional) evita
// pisar el plano de otro: '' o null = «espero que no haya plano». El lote va guardado por el hash vigente: si alguien
// escribió entre la lectura y el lote, no se aplica nada (409). Auditoría en itil_audit (action 'plan-update').
export async function upsertPlan(env,site,body,actor,source,now=Date.now()){
 const extra=Object.keys(body).filter(k=>!['plan','base_sha256'].includes(k));if(extra.length)bad(400,'unknown_fields','Campos no válidos: '+extra.join(', ')+'.');
 const v=validatePlan(body.plan);
 if(!v.ok)bad(v.too_large?413:400,v.too_large?'plan_too_large':'invalid_plan','Plano no válido: '+v.errors.slice(0,3).join(' · '),{details:v.errors});
 const plan=v.plan,version=plan.version.trim();
 if(site.admira_store_id&&plan.id!==site.admira_store_id)bad(400,'plan_id_mismatch','El plano es de «'+plan.id+'» y este Xpacio es «'+site.admira_store_id+'».');
 if(plan.yokup?.site_id&&plan.yokup.site_id!==site.id)bad(400,'plan_site_mismatch','yokup.site_id del plano es de otro establecimiento.');
 let expected;
 if(Object.hasOwn(body,'base_sha256')){const b=body.base_sha256;if(b!==null&&b!==''&&!(typeof b==='string'&&SHA.test(b)))bad(400,'invalid_base','base_sha256 no válido (64 hexadecimales, o vacío si no hay plano).');expected=b||'';}
 const sha=await planHash(plan),cur=await statement(env,'SELECT sha256,seq FROM xpacio_planos WHERE site_id=?',site.id).first();
 const base={ok:true,site_id:site.id,admira_store_id:site.admira_store_id||null,plan_id:plan.id,version,sha256:sha,screens:v.summary.screens,bytes:v.bytes};
 if(cur&&cur.sha256===sha)return {...base,changed:false,created:false,seq:cur.seq,itil_check:crossCheck(plan,await ciRows(env,site.id))};
 if(expected!==undefined&&(cur?.sha256||'')!==expected)bad(409,'plan_conflict','El plano vigente ya no es el que tenías: vuelve a cargarlo antes de guardar.');
 await rateLimit(env,'plano:'+site.id,60,3600000);
 const who=String(actor).slice(0,254),prev=cur?.sha256||'',guard="COALESCE((SELECT sha256 FROM xpacio_planos WHERE site_id=?),'')=?";
 const detail=(cur?'Nueva versión':'Primer plano')+' · '+version+' · '+v.summary.screens+' pantallas · sha256 '+sha.slice(0,12);
 const done=await env.DB.batch([
  statement(env,`INSERT INTO itil_audit(id,at,actor,channel,action,itil_code,device_id,site_id,detail) SELECT ?,?,?,?,'plan-update',NULL,NULL,?,? WHERE ${guard}`,crypto.randomUUID(),now,who,source,site.id,detail.slice(0,500),site.id,prev),
  statement(env,`INSERT INTO xpacio_plano_versions(id,site_id,seq,admira_store_id,plan_id,schema,version,plan_json,sha256,screens,bytes,source,updated_by,updated_at)
   SELECT ?,?,COALESCE((SELECT MAX(seq) FROM xpacio_plano_versions WHERE site_id=?),0)+1,?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}`,
   crypto.randomUUID(),site.id,site.id,site.admira_store_id||null,plan.id,PLANO_SCHEMA,version,v.json,sha,v.summary.screens,v.bytes,source,who,now,site.id,prev),
  statement(env,`INSERT INTO xpacio_planos(site_id,admira_store_id,plan_id,schema,version,plan_json,sha256,seq,screens,bytes,source,created_by,created_at,updated_by,updated_at)
   SELECT ?,?,?,?,?,?,?,(SELECT MAX(seq) FROM xpacio_plano_versions WHERE site_id=?),?,?,?,?,?,?,? WHERE ${guard}
   ON CONFLICT(site_id) DO UPDATE SET admira_store_id=excluded.admira_store_id,plan_id=excluded.plan_id,schema=excluded.schema,version=excluded.version,plan_json=excluded.plan_json,sha256=excluded.sha256,
    seq=excluded.seq,screens=excluded.screens,bytes=excluded.bytes,source=excluded.source,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
   site.id,site.admira_store_id||null,plan.id,PLANO_SCHEMA,version,v.json,sha,site.id,v.summary.screens,v.bytes,source,who,now,who,now,site.id,prev)
 ]);
 if(!done[2]?.meta?.changes)bad(409,'plan_conflict','El plano cambió mientras guardabas: vuelve a cargarlo.');
 const saved=await statement(env,'SELECT seq FROM xpacio_planos WHERE site_id=?',site.id).first();
 return {...base,changed:true,created:!cur,seq:saved.seq,previous_sha256:cur?.sha256||null,itil_check:crossCheck(plan,await ciRows(env,site.id))};
}
// ── Portal del comercio: GET|PUT /api/retailer/plano (mismo perímetro que /api/retailer/itil*; viewer solo lee,
// lo corta retailer-portal.js antes de llegar aquí). Los errores de validación devuelven la lista completa en errors.
export async function retailerPlano(request,env,owner,actor,channel){
 try{
  const q=new URL(request.url).searchParams;
  if(request.method==='GET')return response(request,await readPlan(env,await ownerSite(env,owner,{site_id:q.get('site_id'),admira_store_id:q.get('admira_store_id')}),{history:q.has('history')?q.get('history'):10,seq:q.get('seq')}));
  if(request.method==='PUT'){
   const {site_id,admira_store_id,request_key,...b}=await planBody(request);
   const r=await upsertPlan(env,await ownerSite(env,owner,{site_id,admira_store_id}),b,actor,channel);return response(request,r,r.created?201:200);
  }
  return response(request,{error:'Usa GET o PUT.'},405);
 }catch(e){if(!e.details)throw e;return response(request,{error:e.message,code:e.code,errors:e.details},e.status);}
}
// ── /internal/plano/* · solo por service binding (MCP de flota desde el gate). El autor lo pone el gate.
const internalReply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
// Alcance de flota: los Xpacios del catálogo por admira_store_id (como el ITIL) y, por site_id, SOLO los establecimientos
// permitidos de forma explícita en xpacio_plano_fleet_sites (empezando por el laboratorio de Gran de Gràcia 51, propio de
// Yokup y sin admira_store_id). Un comercio del portal no es de la flota: inexistente y no permitido responden igual (404).
export const fleetAllowed=async(env,siteId)=>!!await statement(env,'SELECT 1 AS ok FROM xpacio_plano_fleet_sites WHERE site_id=? AND revoked_at IS NULL',siteId).first();
async function fleetSite(env,{site_id,admira_store_id}){
 if(!!site_id===!!admira_store_id)bad(400,'site_required','Indica admira_store_id o site_id (uno de los dos).');
 if(admira_store_id){
  if(typeof admira_store_id!=='string'||!STORE.test(admira_store_id))bad(400,'invalid_store','admira_store_id no válido.');
  const s=await xpacioSite(env,admira_store_id);if(!s)bad(404,'xpacio_not_found','Xpacio no encontrado en Yokup.');return s;
 }
 if(typeof site_id!=='string'||!SITE.test(site_id))bad(400,'invalid_site','site_id no válido.');
 const s=await fleetAllowed(env,site_id)?await siteById(env,site_id):null;
 if(!s)bad(404,'site_not_found','Establecimiento no encontrado o no permitido para la flota (por site_id solo los de xpacio_plano_fleet_sites; los Xpacios, por admira_store_id).');return s;
}
export async function handlePlanoInternal(request,env){
 if(!viaBinding(request,INTERNAL_HOST))return internalReply({ok:false,code:'not_found',error:'Ruta no encontrada.'},404);
 try{
  const url=new URL(request.url),q=url.searchParams;
  if(request.method==='GET'&&url.pathname==='/internal/plano/get')return internalReply({ok:true,...await readPlan(env,await fleetSite(env,{site_id:q.get('site_id'),admira_store_id:q.get('admira_store_id')}),{history:q.has('history')?q.get('history'):10,seq:q.get('seq'),fleet:true})});
  if(request.method!=='POST'||url.pathname!=='/internal/plano/upsert')bad(404,'not_found','Ruta no encontrada.');
  const {actor,machine,site_id,admira_store_id,...b}=await planBody(request),who=author({actor,machine});
  return internalReply(await upsertPlan(env,await fleetSite(env,{site_id,admira_store_id}),b,who,'mcp-flota'));
 }catch(e){
  if(!e.status)console.error('plano_internal_failed',e.message);
  return internalReply({ok:false,code:e.code||'unavailable',error:e.status?e.message:'No se pudo aplicar.',...(e.details?{errors:e.details}:{})},e.status||500);
 }
}
// ── Lectura para la Galaxia: GET /api/plano/xpacios/:id, mismo modelo de acceso que GET /api/itil/xpacios/:admira_store_id.
// id = admira_store_id (Xpacio del catálogo) o yokup-<site_id> (establecimiento propio de Yokup, sin admira_store_id): el
// mismo id con el que retailer-map-catalog.js (catalogId) lo publica en el mapa comercial y un prefijo que la sync del
// catálogo ya reserva (isXpacio descarta yokup-*), así que no choca con ningún admira_store_id. Una ruta y un id para todos.
//  · Sin clave: lo mínimo (Xpacio, si hay plano, versión y nº de pantallas), solo si el Xpacio ya es público en los mapas
//    (catálogo, o yokup-* que su titular publicó). Un yokup-* sin publicar o inexistente pide clave (401, sin revelar nada).
//  · Con X-Yokup-Itil-Key: el plano completo SIN datos privados y su cruce con el ITIL. ETag = sha256 (If-None-Match → 304).
//    Un yokup-* solo si está publicado en los mapas o permitido para la flota (xpacio_plano_fleet_sites); si no, 404:
//    la clave de una solución no abre el plano de cualquier comercio del portal.
const OWN=/^yokup-([\w-]{1,80})$/;
export async function handlePlanoPublic(request,env,now=Date.now()){
 const headers=(cache,extra={})=>({...galaxyHeaders(request,cache),'Access-Control-Expose-Headers':'ETag',...extra});
 const out=(body,status=200,cache='no-store',extra={})=>new Response(body===null?null:JSON.stringify(body),{status,headers:headers(cache,extra)});
 const origin=request.headers.get('origin');
 if(origin&&!GALAXY_ORIGINS.has(origin))return out({error:'origin_not_allowed',documentation:PLANO_DOCS},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:headers('no-store')});
 if(request.method!=='GET')return out({error:'method_not_allowed'},405);
 const m=/^\/api\/plano\/xpacios\/([^/]+)$/.exec(new URL(request.url).pathname);let id='';try{id=m?decodeURIComponent(m[1]):'';}catch{}
 if(!STORE.test(id))return out({error:'not_found',documentation:PLANO_DOCS},404);
 const own=OWN.exec(id)?.[1]||null;
 try{
  const access=await galaxyKey(request,env,now,'plano');if(access.error)return out(...access.error);const key=access.key;
  // Un yokup-* es el establecimiento propio (sin Xpacio): el de un Xpacio se lee por su admira_store_id.
  let site=own?await siteById(env,own):await xpacioSite(env,id);if(own&&site?.admira_store_id)site=null;
  const published=!!site&&(!own||!!await statement(env,'SELECT 1 AS ok FROM admira_retailer_locations WHERE site_id=?',site.id).first());
  if(own&&!key&&!published)return out({error:'key_required',documentation:PLANO_DOCS,note:'Un establecimiento propio de Yokup que no está publicado en los mapas solo se lee con la clave de lectura de la Galaxia (X-Yokup-Itil-Key).'},401);
  if(own&&site&&!published&&!await fleetAllowed(env,site.id))site=null;
  const brands=key?.brands?JSON.parse(key.brands):null;
  if(!site||site.xpacio_removed_at||(brands&&!brands.includes(site.brand_key)))return out({error:'xpacio_not_found',documentation:PLANO_DOCS},404,key?'no-store':'public, max-age=60');
  const row=await statement(env,'SELECT * FROM xpacio_planos WHERE site_id=?',site.id).first();
  const brand=site.brand_key?await statement(env,'SELECT name FROM brand_accounts WHERE brand_key=?',site.brand_key).first():null;
  const xpacio=own?{id,name:site.name}:{admira_store_id:site.admira_store_id,name:site.name,brand:brand?.name||site.brand_key};
  const base={schema:PLANO_READ_SCHEMA,generated_at:new Date(now).toISOString(),xpacio,has_plan:!!row,...(row?{plan_schema:row.schema,version:row.version,screens:row.screens}:{}),documentation:PLANO_DOCS};
  if(!key)return out({...base,access:'public',note:'Sin clave solo se publica si hay plano, su versión y cuántas pantallas tiene. Las soluciones de la Galaxia piden su clave de lectura (cabecera X-Yokup-Itil-Key).'},200,'public, max-age=60');
  const full={...base,access:'key',solution:key.solution,xpacio:{...xpacio,city:site.city||null,...(site.twin_url?{twin_url:site.twin_url}:{})}};
  if(!row)return out({...full,plan:null},200,'private, max-age=60');
  const etag='"'+row.sha256+'"';
  if(request.headers.get('if-none-match')===etag)return out(null,304,'private, max-age=60',{ETag:etag});
  const plan=JSON.parse(row.plan_json),check=crossCheck(plan,await ciRows(env,site.id));
  return out({...full,sha256:row.sha256,updated_at:new Date(row.updated_at).toISOString(),summary:planSummary(plan),plan:publicPlan(plan),itil:{cis:check.cis,linked:check.linked,warnings:check.warnings}},200,'private, max-age=60',{ETag:etag});
 }catch(e){
  if(e.status===429)return out({error:'rate_limited'},429);
  console.error('plano_public_failed',e.message);return out({error:'unavailable'},503);
 }
}
