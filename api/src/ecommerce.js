import {statement,rows,hash,jsonBody,fail,response,rateLimit} from './installer-portal.js';

// Categories are specifications for a purchase request, not products with invented stock or prices.
export const CATEGORIES = [
 {id:'screen',name:'Pantallas',hint:'Pulgadas, resolución, orientación, VESA y horas de uso.'},
 {id:'camera',name:'Cámaras',hint:'Resolución, PoE o alimentación, óptica y compatibilidad.'},
 {id:'power',name:'Regletas y alimentación',hint:'Número de tomas, potencia, protección y longitud.'},
 {id:'audio',name:'Altavoces y audio',hint:'Potencia, impedancia, amplificación y montaje.'},
 {id:'player',name:'Players y conectividad',hint:'Sistema, salidas de vídeo, red y alimentación.'},
 {id:'cable',name:'Cables y soportes',hint:'Conectores, longitud, carga y medidas de montaje.'},
 {id:'other',name:'Otros repuestos',hint:'Referencia, modelo y requisitos de compatibilidad.'}
];
const STATUSES=['requested','approved','ordered','received','installed','rejected','cancelled'];
const BUYERS=new Set(['owner','manager','superuser']);
const str=(v,min,max)=>{if(typeof v!=='string'||v.trim().length<min||v.trim().length>max)fail(400,'Revisa los campos de texto de la solicitud.');return v.trim();};
const optional=(v,max)=>v==null?'':str(v,0,max);
const integer=(v,min,max)=>{if(!Number.isSafeInteger(v)||v<min||v>max)fail(400,'Cantidad o importe no válido.');return v;};
const key=v=>{const s=str(v,8,100);if(!/^[A-Za-z0-9_-]+$/.test(s))fail(400,'Identificador de operación no válido.');return s;};
function link(v){const s=optional(v,1000);if(!s)return '';try{const u=new URL(s);if(u.protocol==='https:'&&!u.username&&!u.password)return u.href;}catch{}fail(400,'Usa un enlace HTTPS sin credenciales.');}
export function normalizeItems(items){
 if(!Array.isArray(items)||!items.length||items.length>20)fail(400,'Añade entre 1 y 20 artículos.');
 return items.map(i=>{if(!i||!CATEGORIES.some(c=>c.id===i.category))fail(400,'Categoría no válida.');return {category:i.category,name:str(i.name,2,160),specification:optional(i.specification,1000),quantity:integer(i.quantity,1,100),unit_price_cents:null};});
}
const JOINS=` FROM ecommerce_requests p JOIN installer_incidents i ON i.id=p.incident_id
 JOIN retailer_device_links l ON l.device_id=i.device_id AND l.site_id=p.site_id
 JOIN retailer_sites s ON s.id=p.site_id AND s.retailer_id=p.retailer_id
 JOIN installer_devices d ON d.id=i.device_id`;
const SELECT=`SELECT p.*,i.title AS incident_title,i.status AS incident_status,i.installer_id,s.name AS site_name,s.address AS delivery_address,s.city,s.country,d.name AS device_name${JOINS}`;
const scope=(who)=>who.kind==='retailer'?'p.retailer_id=?':'i.installer_id=?';
const buyer=who=>who.kind==='retailer'&&BUYERS.has(who.access?.role||'owner');
const actor=who=>who.access?.actor_email||who.account.name;
function present(p){const {payload_hash,request_key,last_action,...rest}=p;return {...rest,items:JSON.parse(p.items)};}
async function purchase(env,id,who){const p=await statement(env,SELECT+` WHERE p.id=? AND ${scope(who)}`,id,who.account.id).first();if(!p)fail(404,'Solicitud no encontrada en tu cuenta.');return p;}
async function context(env,id,who){
 const condition=who.kind==='retailer'?'s.retailer_id=?':'i.installer_id=?';
 const i=await statement(env,`SELECT i.id,i.title,i.status,i.installer_id,d.name AS device_name,s.id AS site_id,s.name AS site_name,s.retailer_id,s.address,s.city,s.country
 FROM installer_incidents i JOIN installer_devices d ON d.id=i.device_id JOIN retailer_device_links l ON l.device_id=d.id JOIN retailer_sites s ON s.id=l.site_id WHERE i.id=? AND ${condition}`,id,who.account.id).first();
 if(!i)fail(404,'Incidencia no encontrada o sin comercio vinculado.');return i;
}
async function detail(env,id,who){const p=await purchase(env,id,who);return {request:present(p),can_approve:buyer(who),events:await rows(env,'SELECT action,actor_name,note,created_at,version FROM ecommerce_events WHERE request_id=? ORDER BY version',id)};}
async function create(env,b,who){
 if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'Solicitud no válida.');
 if(who.kind==='retailer'&&!buyer(who))fail(403,'Solo el titular o administrador puede solicitar compras.');
 const incident_id=str(b.incident_id,1,120),request_key=key(b.request_key),items=normalizeItems(b.items),reason=str(b.reason,10,2000),delivery_notes=optional(b.delivery_notes,1000),priority=b.priority||'normal';
 if(!['normal','urgent'].includes(priority))fail(400,'Prioridad no válida.');
 const payload_hash=await hash(JSON.stringify({incident_id,items,reason,delivery_notes,priority}));
 const existing=await statement(env,'SELECT id,payload_hash FROM ecommerce_requests WHERE requester_kind=? AND requester_id=? AND request_key=?',who.kind,who.account.id,request_key).first();
 if(existing){if(existing.payload_hash!==payload_hash)fail(409,'Esta operación ya se usó con otros datos.');return [await detail(env,existing.id,who),200];}
 const i=await context(env,incident_id,who);
 if(i.status==='resolved')fail(409,'La incidencia está cerrada. Abre una revisión antes de solicitar material.');
 if(who.kind==='installer'&&i.status!=='assigned')fail(409,'Acepta la intervención antes de solicitar material.');
 const id='BUY-'+crypto.randomUUID(),now=Date.now();
 const eligible=who.kind==='installer'?"AND i.status='assigned' AND i.installer_id=?":'AND s.retailer_id=?';
 const changes=await env.DB.batch([
  statement(env,`INSERT OR IGNORE INTO ecommerce_requests(id,incident_id,retailer_id,site_id,requester_kind,requester_id,requester_name,request_key,payload_hash,items,reason,priority,delivery_notes,last_action,created_at,updated_at)
   SELECT ?,i.id,s.retailer_id,s.id,?,?,?,?,?,?,?,?,?,?,?,? FROM installer_incidents i JOIN retailer_device_links l ON l.device_id=i.device_id JOIN retailer_sites s ON s.id=l.site_id WHERE i.id=? AND s.id=? AND s.retailer_id=? AND i.status!='resolved' ${eligible}`,
   id,who.kind,who.account.id,actor(who),request_key,payload_hash,JSON.stringify(items),reason,priority,delivery_notes,request_key,now,now,incident_id,i.site_id,i.retailer_id,who.account.id),
  statement(env,`INSERT INTO ecommerce_events SELECT ?,id,?,?,'requested',?,?,?,'Solicitud de material registrada.',?,1 FROM ecommerce_requests WHERE id=?`,crypto.randomUUID(),request_key,payload_hash,who.kind,who.account.id,actor(who),now,id)
 ]);
 if(!changes[0].meta.changes){const old=await statement(env,'SELECT id,payload_hash FROM ecommerce_requests WHERE requester_kind=? AND requester_id=? AND request_key=?',who.kind,who.account.id,request_key).first();if(old?.payload_hash===payload_hash)return [await detail(env,old.id,who),200];fail(409,'La incidencia o la operación ha cambiado. Actualiza antes de continuar.');}
 return [await detail(env,id,who),201];
}
async function change(env,id,b,who){
 if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'Operación no válida.');
 const p=await purchase(env,id,who),request_key=key(b.request_key),version=integer(b.version,1,1e9),action=str(b.action,3,20),note=optional(b.note,2000);
 // Hash the complete action: a retry can never silently replace a different quote or state.
 const payload_hash=await hash(JSON.stringify(b));
 const existing=await statement(env,'SELECT * FROM ecommerce_events WHERE request_id=? AND request_key=?',id,request_key).first();
 if(existing){if(existing.payload_hash!==payload_hash||existing.actor_id!==who.account.id||existing.actor_kind!==who.kind)fail(409,'Esta operación ya está registrada con otros datos.');return await detail(env,id,who);}
 if(p.version!==version)fail(409,'La solicitud ha cambiado. Actualiza antes de continuar.');
 if(who.access?.role==='viewer')fail(403,'Acceso de solo lectura.');
 if(!buyer(who)&&!['received','installed','cancelled'].includes(action))fail(403,'La aprobación y el pedido corresponden al titular o administrador del comercio.');
 let fields={status:p.status},eventNote=note;
 if(action==='quote'){
  if(p.status!=='requested')fail(409,'Solo se puede presupuestar una solicitud pendiente.');
  const items=JSON.parse(p.items);
  if(!Array.isArray(b.prices_cents)||b.prices_cents.length!==items.length)fail(400,'Indica el precio de cada artículo.');
  items.forEach((item,n)=>item.unit_price_cents=integer(b.prices_cents[n],0,100000000));
  const shipping_cents=integer(b.shipping_cents??0,0,100000000),tax_cents=integer(b.tax_cents??0,0,100000000),total_cents=items.reduce((s,i)=>s+i.quantity*i.unit_price_cents,shipping_cents+tax_cents);
  fields={...fields,items:JSON.stringify(items),shipping_cents,tax_cents,total_cents,supplier:str(b.supplier,2,200),quote_reference:str(b.quote_reference,2,200),quote_url:link(b.quote_url)};
  eventNote=`Presupuesto ${fields.quote_reference}: ${(total_cents/100).toFixed(2)} EUR (impuestos y envío incluidos).`+(note?' '+note:'');
 }else{
  const transitions={approved:['requested'],ordered:['approved'],received:['ordered'],installed:['received'],rejected:['requested'],cancelled:['requested','approved']};
  if(!transitions[action]?.includes(p.status))fail(409,'Cambio de estado no permitido.');
  if(['approved','ordered'].includes(action)&&p.incident_status==='resolved')fail(409,'La incidencia ya está cerrada. Revisa la necesidad antes de comprar.');
  if(action==='approved'){
   if(p.total_cents===null||!p.supplier||!p.quote_reference)fail(400,'Registra un presupuesto completo antes de aprobar.');
   fields.approved_total_cents=p.total_cents;
  }
  if(action==='ordered'){
   if(p.approved_total_cents!==p.total_cents)fail(409,'El presupuesto aprobado no coincide.');
   fields.order_reference=str(b.order_reference,2,200);fields.tracking_url=link(b.tracking_url);
  }
  if(['rejected','cancelled','received','installed'].includes(action)&&note.length<5)fail(400,'Añade una nota de al menos 5 caracteres para dejar constancia.');
  if(action==='cancelled'&&!buyer(who)&&(p.status!=='requested'||p.requester_kind!==who.kind||p.requester_id!==who.account.id))fail(403,'Solo puedes cancelar tu propia solicitud pendiente.');
  fields.status=action;
 }
 const now=Date.now(),cols=Object.keys(fields);
 const changed=await env.DB.batch([
  statement(env,`UPDATE ecommerce_requests SET ${cols.map(c=>c+'=?').join(',')},version=version+1,last_action=?,updated_at=? WHERE id=? AND version=? AND id IN (SELECT p.id${JOINS} WHERE ${scope(who)})`,...cols.map(c=>fields[c]),request_key,now,id,version,who.account.id),
  statement(env,`INSERT OR IGNORE INTO ecommerce_events SELECT ?,id,?,?,?,?,?,?,?,?,version FROM ecommerce_requests WHERE id=? AND version=? AND last_action=?`,crypto.randomUUID(),request_key,payload_hash,action,who.kind,who.account.id,actor(who),eventNote,now,id,version+1,request_key)
 ]);
 if(!changed[0].meta.changes)fail(409,'Otra persona ha actualizado esta solicitud. Recarga para ver el resultado.');
 return await detail(env,id,who);
}
export async function handleEcommerce(request,env,who,path){
 const method=request.method,q=new URL(request.url).searchParams;
 if(path==='/ecommerce/catalog'&&method==='GET')return response(request,{categories:CATEGORIES,statuses:STATUSES,can_approve:buyer(who)});
 if(path==='/ecommerce/context'&&method==='GET')return response(request,{incident:await context(env,str(q.get('incident'),1,120),who)});
 if(path==='/ecommerce/requests'&&method==='GET'){
  const args=[who.account.id],filters=[scope(who)];
  if(q.get('incident')){filters.push('p.incident_id=?');args.push(str(q.get('incident'),1,120));}
  if(q.get('status')){if(!STATUSES.includes(q.get('status')))fail(400,'Estado desconocido.');filters.push('p.status=?');args.push(q.get('status'));}
  const offset=Number(q.get('offset')||0);integer(offset,0,100000);
  const list=await rows(env,SELECT+' WHERE '+filters.join(' AND ')+' ORDER BY p.updated_at DESC,p.id LIMIT 51 OFFSET ?',...args,offset);
  return response(request,{requests:list.slice(0,50).map(present),next_offset:list.length>50?offset+50:null,can_approve:buyer(who)});
 }
 if(path==='/ecommerce/requests'&&method==='POST'){await rateLimit(env,'ecommerce:create:'+who.kind+':'+who.account.id,30,3600000);return response(request,...await create(env,await jsonBody(request),who));}
 const match=/^\/ecommerce\/requests\/(BUY-[a-f0-9-]{36})$/.exec(path);
 if(match&&method==='GET')return response(request,await detail(env,match[1],who));
 if(match&&method==='POST'){await rateLimit(env,'ecommerce:change:'+who.kind+':'+who.account.id,120,3600000);return response(request,await change(env,match[1],await jsonBody(request),who));}
 fail(404,'Ruta de compras no encontrada.');
}
