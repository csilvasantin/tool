// Ciclo de vida de los equipos del comercio (FLT-101292): ficha, estado de garantía y
// mantenimiento, y barrido diario de avisos. Fechas ISO 'YYYY-MM-DD' (día UTC). Nada de
// datos inventados: una ficha sin fechas se muestra «sin datos», nunca como vigente.
import {statement,rows,fail} from './installer-portal.js';
export const CATEGORIES=['pantalla','player','iot','audio','tpv','red','mobiliario','iluminacion','otro'];
export const STATUSES=['operational','degraded','maintenance','retired','planned'];
const TEXTS={manufacturer:120,model:120,serial:120,supplier:160,invoice_ref:120,installed_by:160,notes:2000};
const DATES=['purchase_date','warranty_start','warranty_end','installed_at','last_maintenance_at','retired_at'];
// warranty_months (0021, 01-oct-2026): duración de la garantía en meses; opcional y aditivo.
export const LIFECYCLE_FIELDS=['category','status',...Object.keys(TEXTS),...DATES,'maintenance_interval_days','warranty_months'];
const SKILL_CATEGORY={screen:'pantalla',player:'player',network:'red',audio:'audio',sensor:'iot',kiosk:'otro',hvac:'otro'};
export const categoryForSkill=skill=>SKILL_CATEGORY[skill]||'otro';
export const isoDay=ms=>new Date(ms).toISOString().slice(0,10);
export const validDay=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&isoDay(Date.parse(v+'T00:00:00Z'))===v;
const dayDiff=(a,b)=>Math.round((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000);
export function maintenanceDueOn(lc){const base=lc?.last_maintenance_at||lc?.installed_at;return base&&lc?.maintenance_interval_days?isoDay(Date.parse(base+'T00:00:00Z')+lc.maintenance_interval_days*86400000):null;}
// Suma meses a un día ISO sin desbordar (31-ene + 1 mes = 28/29-feb).
export function addMonths(day,months){
 if(!validDay(day)||!Number.isInteger(months)||months<1)return null;
 const [y,m,d]=day.split('-').map(Number),t=new Date(Date.UTC(y,m-1+months,1)),last=new Date(Date.UTC(t.getUTCFullYear(),t.getUTCMonth()+1,0)).getUTCDate();
 return isoDay(Date.UTC(t.getUTCFullYear(),t.getUTCMonth(),Math.min(d,last)));
}
// Fin de garantía efectivo: el registrado o, si falta, (inicio de garantía | compra) + meses. Nunca se inventa.
export function warrantyUntil(lc){
 if(lc?.warranty_end)return {until:lc.warranty_end,derived:false};
 const until=addMonths(lc?.warranty_start||lc?.purchase_date,lc?.warranty_months);
 return {until,derived:!!until};
}
// warranty: none (sin fecha) · valid · expiring (≤30 días) · expired.
export function lifecycleState(lc,today=isoDay(Date.now())){
 const w=warrantyUntil(lc),days=w.until?dayDiff(w.until,today):null,due=maintenanceDueOn(lc);
 return {warranty:days===null?'none':days<0?'expired':days<=30?'expiring':'valid',warranty_days:days,warranty_until:w.until,warranty_until_derived:w.derived,maintenance_due_on:due,maintenance_due:!!due&&due<=today&&lc?.status!=='retired'};
}
export function lifecycleView(row,skill,today){
 const lc={category:row?.category??categoryForSkill(skill),status:row?.status||'operational'};
 for(const f of LIFECYCLE_FIELDS)if(!Object.hasOwn(lc,f))lc[f]=row?.[f]??null;
 lc.updated_at=row?.updated_at??null;lc.updated_by=row?.updated_by??null;lc.recorded=!!row;
 return {...lc,...lifecycleState(lc,today)};
}
export const LIFECYCLE_COLUMNS=LIFECYCLE_FIELDS.map(f=>'lc.'+f+' AS lc_'+f).join(',')+',lc.updated_at AS lc_updated_at,lc.updated_by AS lc_updated_by,lc.device_id AS lc_device_id';
// Separa las columnas lc_* de una fila de equipo y le añade su ficha calculada.
export function withLifecycle(device,today){
 const out={},lc={};for(const [k,v] of Object.entries(device)){if(k.startsWith('lc_'))lc[k.slice(3)]=v;else out[k]=v;}
 out.lifecycle=lifecycleView(lc.device_id?lc:null,device.skill,today);return out;
}
export function lifecycleStats(devices){
 const active=devices.filter(d=>d.lifecycle.status!=='retired');
 return {warranty_expiring:active.filter(d=>d.lifecycle.warranty==='expiring').length,warranty_expired:active.filter(d=>d.lifecycle.warranty==='expired').length,maintenance_due:active.filter(d=>d.lifecycle.maintenance_due).length};
}
function parse(b){
 const keys=Object.keys(b);if(!keys.length||keys.some(k=>!LIFECYCLE_FIELDS.includes(k)))fail(400,'Campos no válidos en la ficha del equipo.');
 const v={};
 for(const k of keys){
  const x=b[k];
  if(x===null||x===''){if(k==='status')fail(400,'Indica el estado del equipo.');v[k]=null;continue;}
  if(k==='category'||k==='status'){if(!(k==='category'?CATEGORIES:STATUSES).includes(x))fail(400,k==='category'?'Categoría no válida.':'Estado no válido.');v[k]=x;}
  else if(DATES.includes(k)){if(!validDay(x))fail(400,'Fecha no válida en '+k+' (usa AAAA-MM-DD).');v[k]=x;}
  else if(k==='maintenance_interval_days'){if(!Number.isInteger(x)||x<1||x>3650)fail(400,'El intervalo de mantenimiento debe ser de 1 a 3650 días.');v[k]=x;}
  else if(k==='warranty_months'){if(!Number.isInteger(x)||x<1||x>600)fail(400,'La garantía debe ser de 1 a 600 meses.');v[k]=x;}
  else{if(typeof x!=='string'||x.trim().length>TEXTS[k]||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x))fail(400,'Revisa el campo '+k+' (máximo '+TEXTS[k]+' caracteres).');v[k]=x.trim()||null;}
 }
 return v;
}
export async function readLifecycle(env,device,now=Date.now()){
 const today=isoDay(now),row=await statement(env,'SELECT * FROM device_lifecycle WHERE device_id=?',device.id).first();
 const alerts=await rows(env,'SELECT kind,due_on,created_at,acknowledged_at FROM device_lifecycle_alerts WHERE device_id=? ORDER BY due_on DESC,kind LIMIT 20',device.id);
 return {device:{id:device.id,name:device.name,skill:device.skill,site_id:device.site_id},lifecycle:lifecycleView(row,device.skill,today),alerts};
}
// PUT parcial: solo cambian los campos enviados; null o '' vacían un dato.
export async function updateLifecycle(env,device,body,actor,now=Date.now()){
 const v=parse(body),today=isoDay(now),current=await statement(env,'SELECT * FROM device_lifecycle WHERE device_id=?',device.id).first()||{};
 if(Object.hasOwn(v,'status'))v.retired_at=v.status==='retired'?(v.retired_at||current.retired_at||today):null;
 const merged={...current,...v};
 if(merged.warranty_start&&merged.warranty_end&&merged.warranty_end<merged.warranty_start)fail(400,'La garantía no puede terminar antes de empezar.');
 if(merged.retired_at&&merged.status!=='retired'&&!Object.hasOwn(v,'status'))fail(400,'Para registrar la retirada, marca el estado «Retirado».');
 const cols=Object.keys(v),insert=['device_id',...cols,...(cols.includes('category')?[]:['category']),'updated_at','updated_by'];
 const values=[device.id,...cols.map(c=>v[c]),...(cols.includes('category')?[]:[categoryForSkill(device.skill)]),now,String(actor||'').slice(0,254)||'retailer'];
 await statement(env,`INSERT INTO device_lifecycle(${insert.join(',')}) VALUES(${insert.map(()=>'?').join(',')}) ON CONFLICT(device_id) DO UPDATE SET ${[...cols,'updated_at','updated_by'].map(c=>c+'=excluded.'+c).join(',')}`,...values).run();
 return readLifecycle(env,device,now);
}
const LIST_STATUS=new Set(STATUSES);
// Inventario filtrable del titular (MCP retailer_inventory_list y REST /inventory).
export async function inventory(env,owner,q,now=Date.now()){
 const today=isoDay(now),site=q.get('site_id'),status=q.get('status'),within=q.get('warranty_within_days'),due=q.get('maintenance_due'),limit=q.has('limit')?Number(q.get('limit')):200;
 if(status&&!LIST_STATUS.has(status))fail(400,'Estado no válido: '+STATUSES.join(', ')+'.');
 if(within!==null&&!/^\d{1,4}$/.test(within))fail(400,'warranty_within_days debe ser un número de días (0-3650).');
 if(due!==null&&!['true','false'].includes(due))fail(400,'maintenance_due debe ser true o false.');
 if(!Number.isInteger(limit)||limit<1||limit>500)fail(400,'limit debe ser de 1 a 500.');
 const found=(await rows(env,`SELECT d.id,d.name,d.skill,d.monitoring,l.site_id,l.circuit_id,l.admira_store_id,l.admira_device_id,s.name AS site_name,s.city,${LIFECYCLE_COLUMNS} FROM installer_devices d JOIN retailer_device_links l ON l.device_id=d.id JOIN retailer_sites s ON s.id=l.site_id LEFT JOIN device_lifecycle lc ON lc.device_id=d.id WHERE s.retailer_id=?${site?' AND s.id=?':''} ORDER BY s.name,d.name,d.id`,owner,...(site?[String(site).slice(0,80)]:[]))).map(d=>withLifecycle(d,today));
 const days=within===null?null:Math.min(3650,Number(within));
 const devices=found.filter(d=>(!status||d.lifecycle.status===status)&&(days===null||(d.lifecycle.warranty_days!==null&&d.lifecycle.warranty_days>=0&&d.lifecycle.warranty_days<=days))&&(due===null||d.lifecycle.maintenance_due===(due==='true')));
 return {today,total:devices.length,limit,devices:devices.slice(0,limit),stats:lifecycleStats(found)};
}
export async function alerts(env,owner,q){
 const all=q.get('include_acknowledged')==='true',limit=q.has('limit')?Number(q.get('limit')):100;
 if(!Number.isInteger(limit)||limit<1||limit>500)fail(400,'limit debe ser de 1 a 500.');
 return {alerts:await rows(env,`SELECT a.device_id,a.kind,a.due_on,a.created_at,a.acknowledged_at,d.name AS device_name,s.id AS site_id,s.name AS site_name FROM device_lifecycle_alerts a JOIN installer_devices d ON d.id=a.device_id JOIN retailer_device_links l ON l.device_id=d.id JOIN retailer_sites s ON s.id=l.site_id WHERE s.retailer_id=?${all?'':' AND a.acknowledged_at IS NULL'} ORDER BY a.due_on,a.kind LIMIT ?`,owner,limit)};
}
// Barrido diario desde el cron: avisos de garantía (30 y 7 días, vencida) y mantenimiento. PK = sin duplicados.
export async function sweepLifecycleAlerts(env,{now=Date.now(),force=false}={}){
 const today=isoDay(now),plus=d=>isoDay(now+d*86400000);
 const job=await statement(env,"SELECT last_run_on FROM scheduled_jobs WHERE name='lifecycle_alerts'").first();
 if(!force&&job?.last_run_on===today)return {skipped:true};
 const base=`FROM device_lifecycle WHERE status!='retired' AND warranty_end IS NOT NULL`,next=`date(COALESCE(last_maintenance_at,installed_at),'+'||maintenance_interval_days||' days')`;
 const out=await env.DB.batch([
  statement(env,`INSERT OR IGNORE INTO device_lifecycle_alerts(device_id,kind,due_on,created_at) SELECT device_id,'warranty_expired',warranty_end,? ${base} AND warranty_end<?`,now,today),
  statement(env,`INSERT OR IGNORE INTO device_lifecycle_alerts(device_id,kind,due_on,created_at) SELECT device_id,'warranty_30',warranty_end,? ${base} AND warranty_end BETWEEN ? AND ?`,now,today,plus(30)),
  statement(env,`INSERT OR IGNORE INTO device_lifecycle_alerts(device_id,kind,due_on,created_at) SELECT device_id,'warranty_7',warranty_end,? ${base} AND warranty_end BETWEEN ? AND ?`,now,today,plus(7)),
  statement(env,`INSERT OR IGNORE INTO device_lifecycle_alerts(device_id,kind,due_on,created_at) SELECT device_id,'maintenance_due',${next},? FROM device_lifecycle WHERE status!='retired' AND maintenance_interval_days IS NOT NULL AND COALESCE(last_maintenance_at,installed_at) IS NOT NULL AND ${next}<=?`,now,today),
  statement(env,'DELETE FROM retailer_session_actors WHERE token_hash NOT IN (SELECT token_hash FROM retailer_sessions)'),
  statement(env,"INSERT INTO scheduled_jobs(name,last_run_on,last_run_at) VALUES('lifecycle_alerts',?,?) ON CONFLICT(name) DO UPDATE SET last_run_on=excluded.last_run_on,last_run_at=excluded.last_run_at",today,now)
 ]);
 return {created:out.slice(0,4).reduce((n,r)=>n+(r.meta?.changes||0),0)};
}
