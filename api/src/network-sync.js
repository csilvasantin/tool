// Sincronía de routers de tienda: un CI red por Xpacio vivo. Idempotente por itil_code.
// El cron de 2 min la dispara como mucho cada 10 min; si queda cola, la siguiente pasada sigue.
// Un router simulado (created_by network-sync) no retira las pantallas del catálogo ni toma el mando del Xpacio.
import {statement,rows} from './installer-portal.js';
import {createNetworkAdapter,routerItilCodeAlt,routerDeviceId,lifecycleStatus,telemetryPayload,mapToItilCi} from './network-vendor.js';

const JOB='network_router_sync';
const INTERVAL=10*60*1000;
const PAGE=100;
export function emptyStats(){return {ok:true,seen:0,created:0,updated:0,unchanged:0,skipped_retired:0,conflicts:0,done:true,next:null};}
function add(into,part){
 for(const k of ['seen','created','updated','unchanged','skipped_retired','conflicts'])into[k]+=part[k]||0;
 into.done=!!part.done;into.next=part.next||null;into.ok=part.ok!==false;if(part.skipped)into.skipped=part.skipped;
 if(part.source)into.source=part.source;if(part.vendor)into.vendor=part.vendor;
 return into;
}
async function applyOne(env,site,device,now,trigger){
 const mapped=mapToItilCi(device),id=routerDeviceId(site.admira_store_id);
 let code=mapped.itil_code;
 const found=await statement(env,`SELECT i.device_id,i.site_id,lc.status AS lc_status,t.payload FROM itil_items i LEFT JOIN device_lifecycle lc ON lc.device_id=i.device_id LEFT JOIN itil_network_telemetry t ON t.device_id=i.device_id WHERE i.itil_code=?`,code).first();
 if(found&&found.device_id!==id){
  code=routerItilCodeAlt(site.admira_store_id);
  const alt=await statement(env,`SELECT i.device_id,lc.status AS lc_status,t.payload FROM itil_items i LEFT JOIN device_lifecycle lc ON lc.device_id=i.device_id LEFT JOIN itil_network_telemetry t ON t.device_id=i.device_id WHERE i.itil_code=?`,code).first();
  if(alt&&alt.device_id!==id)return 'conflict';
  return write(env,site,device,now,trigger,id,code,alt);
 }
 return write(env,site,device,now,trigger,id,code,found);
}
async function write(env,site,device,now,trigger,id,code,found){
 if(found?.lc_status==='retired')return 'retired';
 const payload=JSON.stringify(telemetryPayload(device));
 if(found&&found.payload===payload)return 'unchanged';
 const status=lifecycleStatus(device.vendor_status),who='network-sync',channel=String(trigger||'cron').slice(0,40);
 const ops=[];
 if(!found){
  ops.push(statement(env,'INSERT INTO installer_devices(id,name,latitude,longitude,address,skill,last_seen,monitoring) VALUES(?,?,?,?,?,?,?,0)',id,'Router · Teltonika o similar',site.latitude,site.longitude,site.address||site.name,'network',now));
  ops.push(statement(env,'INSERT INTO retailer_device_links(device_id,site_id,circuit_id,admira_store_id,admira_device_id,linked_at,created_at) VALUES(?,?,?,?,?,?,?)',id,site.site_id,site.circuit_id||null,site.admira_store_id,code,now,now));
  ops.push(statement(env,"INSERT INTO itil_items(device_id,site_id,itil_code,category,role,group_name,position,orientation,parent_device_id,managed_by,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,'red',?,?,NULL,NULL,NULL,'itil',?,?,?,?)",id,site.site_id,code,'Router de tienda','Red',who,who,now,now));
  ops.push(statement(env,"INSERT INTO device_lifecycle(device_id,category,model,status,updated_at,updated_by) VALUES(?,'red',?,?,?,?)",id,device.model,status,now,who));
  ops.push(statement(env,'INSERT INTO itil_network_telemetry(device_id,source,vendor,payload,updated_at) VALUES(?,?,?,?,?)',id,device.source==='rms'?'rms':'simulated','Teltonika o similar',payload,now));
  ops.push(statement(env,'INSERT INTO itil_audit(id,at,actor,channel,action,itil_code,device_id,site_id,detail) VALUES(?,?,?,?,?,?,?,?,?)',crypto.randomUUID(),now,who,channel,'create',code,id,site.site_id,'router simulado',));
 }else{
  ops.push(statement(env,'UPDATE installer_devices SET last_seen=?,latitude=?,longitude=? WHERE id=?',now,site.latitude,site.longitude,id));
  ops.push(statement(env,"UPDATE device_lifecycle SET category='red',model=?,status=?,updated_at=?,updated_by=? WHERE device_id=? AND status!='retired'",device.model,status,now,who,id));
  ops.push(statement(env,'INSERT INTO itil_network_telemetry(device_id,source,vendor,payload,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(device_id) DO UPDATE SET source=excluded.source,vendor=excluded.vendor,payload=excluded.payload,updated_at=excluded.updated_at',id,device.source==='rms'?'rms':'simulated','Teltonika o similar',payload,now));
  ops.push(statement(env,'UPDATE itil_items SET updated_by=?,updated_at=? WHERE device_id=?',who,now,id));
 }
 await env.DB.batch(ops);
 return found?'updated':'created';
}
export async function syncNetworkRouters(env,{now=Date.now(),after='',limit=PAGE,trigger='cron'}={}){
 const adapter=createNetworkAdapter(env,now);
 if(adapter.skipped)return {ok:false,skipped:adapter.skipped,vendor:adapter.vendor||env.NETWORK_VENDOR||null,source:adapter.source||env.NETWORK_SOURCE||null,done:true};
 const gate=adapter.ready?adapter.ready():{ok:true};
 if(gate.skipped)return {ok:false,skipped:gate.skipped,vendor:adapter.vendor,source:adapter.source,done:true};
 const n=Math.min(500,Math.max(1,Number(limit)||PAGE));
 const sites=await rows(env,`SELECT x.admira_store_id,x.site_id,x.circuit_id,s.name,s.latitude,s.longitude,s.address FROM admira_xpacio_sites x JOIN retailer_sites s ON s.id=x.site_id WHERE x.removed_at IS NULL AND x.admira_store_id>? ORDER BY x.admira_store_id LIMIT ?`,after||'',n);
 const listed=await adapter.listDevices(sites);
 if(listed.skipped)return {ok:false,skipped:listed.skipped,vendor:adapter.vendor,source:adapter.source,seen:sites.length,done:true};
 let devices=listed.devices||[];
 if(adapter.getDeviceStatistics){const stats=await adapter.getDeviceStatistics(devices);if(stats?.devices)devices=stats.devices;}
 const byStore=new Map(devices.map(d=>[d.admira_store_id,d]));
 const stats={ok:true,seen:sites.length,created:0,updated:0,unchanged:0,skipped_retired:0,conflicts:0,vendor:adapter.vendor,source:adapter.source,done:sites.length<n,next:sites.length?sites[sites.length-1].admira_store_id:null};
 for(const site of sites){
  const device=byStore.get(site.admira_store_id);if(!device){stats.conflicts++;continue;}
  let result;try{result=await applyOne(env,site,device,now,trigger);}catch(e){stats.conflicts++;console.error('network_router_skip',site.admira_store_id,e?.message);continue;}
  if(result==='created')stats.created++;
  else if(result==='updated')stats.updated++;
  else if(result==='unchanged')stats.unchanged++;
  else if(result==='retired')stats.skipped_retired++;
  else stats.conflicts++;
 }
 if(stats.done)stats.next=null;
 return stats;
}
export async function syncAllNetworkRouters(env,opts={}){
 const totals=emptyStats();let after='';
 for(let page=0;page<8;page++){
  const part=await syncNetworkRouters(env,{...opts,after,limit:opts.limit||PAGE});
  add(totals,part);
  if(part.skipped||part.done)break;
  after=part.next||'';
  if(!after)break;
 }
 return totals;
}
export async function scheduledNetworkSync(env,now=Date.now()){
 try{
  const job=await statement(env,"SELECT last_run_on,last_run_at FROM scheduled_jobs WHERE name=?",JOB).first();
  const cursor=job?.last_run_on&&job.last_run_on!=='done'?job.last_run_on:'';
  if(!cursor&&job&&now-job.last_run_at<INTERVAL)return {skipped:'recent'};
  let after=cursor,last=null;
  for(let page=0;page<4;page++){
   last=await syncNetworkRouters(env,{now,after,limit:PAGE,trigger:'cron'});
   if(last.skipped||last.done)break;
   after=last.next||'';
   if(!after)break;
  }
  if(last?.skipped)return last;
  const done=!last||last.done;
  await statement(env,"INSERT INTO scheduled_jobs(name,last_run_on,last_run_at) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET last_run_on=excluded.last_run_on,last_run_at=excluded.last_run_at",JOB,done?'done':after,done?now:(cursor?job.last_run_at:now)).run();
  return last;
 }catch(e){console.error('network_sync_failed',e?.message);return null;}
}
