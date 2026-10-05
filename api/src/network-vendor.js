// Adaptador de red vendor-neutral (Teltonika o similar). FLT-101591 · SmithMacMini · 05-oct-2026.
// La implementación activa es el simulador. La real solo habla con RMS si hay token y NETWORK_SOURCE=real.
// Nunca se registra el token ni el cuerpo de RMS.
import {validItilCode,publicNetwork} from './itil-model.js';
export {publicNetwork};

export const RMS_BASE='https://api.rms.teltonika-networks.com';
export const BUCKET_MS=10*60*1000;
export const VENDOR_LABEL='Teltonika o similar';
const MODELS=[{model:'RUT241',radio:'4G'},{model:'RUTX11',radio:'5G'},{model:'RUT956',radio:'4G'}];
const OPERATORS=['Movistar','Vodafone','Orange'];

export function timeBucket(now){return Math.floor(Number(now)/BUCKET_MS);}
function fnv(seed){
 let h=2166136261;const s=String(seed);
 for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
 return h>>>0;
}
function pick(seed,n){return fnv(seed)%n;}
export function fnvHex(seed){return fnv(seed).toString(16).toUpperCase().padStart(8,'0');}

// 2 a 4 bloques de 2-12. El id de tienda cabe en uno o dos bloques; si pasa de 24 cifras, los últimos 8 son hash.
export function routerItilCode(storeId){
 const compact=String(storeId||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 const body=compact.length>=2?compact:(compact+'XX').slice(0,2);
 let blocks;
 if(body.length<=12)blocks=[body];
 else if(body.length<=24){
  const rest=body.length-12;
  blocks=rest>=2?[body.slice(0,12),body.slice(12)]:[body.slice(0,body.length-2),body.slice(-2)];
 }else blocks=[body.slice(0,12),fnvHex(body)];
 const code=[...blocks,'RED','01'].join('-');
 if(!validItilCode(code))throw Object.assign(new Error('Código de router no válido'),{code:'invalid_itil_code'});
 return code;
}
// Si el código natural ya identifica otro equipo, este segundo código sigue siendo determinista.
export function routerItilCodeAlt(storeId){
 const compact=String(storeId||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 const head=(compact+'STOREXX').slice(0,8);
 const code=head+'-'+fnvHex(String(storeId))+'-RED-01';
 if(!validItilCode(code))throw Object.assign(new Error('Código de router no válido'),{code:'invalid_itil_code'});
 return code;
}
export function routerDeviceId(storeId){
 const id='net-'+String(storeId||'');
 return id.length<=180?id:'net-'+fnvHex(storeId)+fnvHex('id:'+storeId);
}

// Señal débil (RSRP ≤ -110 dBm) degrada aunque el vendor diga online. Offline no se maquilla.
export function applySignal(vendorStatus,rsrp){
 if(vendorStatus==='offline')return 'offline';
 if(vendorStatus==='degraded'||(typeof rsrp==='number'&&rsrp<=-110))return 'degraded';
 return 'online';
}
export function lifecycleStatus(vendorStatus){
 if(vendorStatus==='offline')return 'maintenance';
 if(vendorStatus==='degraded')return 'degraded';
 return 'operational';
}

export function simulateRouter(storeId,now){
 const bucket=timeBucket(now),hw=MODELS[pick(storeId+'|model',MODELS.length)];
 const roll=pick(storeId+'|'+bucket+'|roll',10);
 let vendorStatus=roll===0?'offline':roll<=3?'degraded':'online';
 const base=vendorStatus==='online'?-78:vendorStatus==='degraded'?-108:-120;
 const rsrp=vendorStatus==='offline'?-120:base-pick(storeId+'|'+bucket+'|rsrp',12);
 vendorStatus=applySignal(vendorStatus,rsrp);
 const serial=hw.model+'-'+String(fnv(storeId+'|serial')%100000000).padStart(8,'0');
 const imei=(String(fnv(storeId+'|imei')).padStart(10,'0').slice(0,10)+String(fnv(storeId+'|imei2')%100000).padStart(5,'0')).slice(0,15);
 return {admira_store_id:storeId,external_id:'sim-'+storeId,model:hw.model,radio:hw.radio,
  operator:OPERATORS[pick(storeId+'|op',OPERATORS.length)],firmware:'RUTX_R_00.07.'+String(pick(storeId+'|fw',40)).padStart(2,'0'),
  serial,imei,vendor_status:vendorStatus,rsrp,rsrq:vendorStatus==='offline'?-20:-8-pick(storeId+'|'+bucket+'|rsrq',8),
  sinr:vendorStatus==='offline'?0:pick(storeId+'|'+bucket+'|sinr',21),
  data_usage_gb:Math.round((0.4+pick(storeId+'|'+bucket+'|gb',800)/10)*10)/10,
  uptime_s:vendorStatus==='offline'?0:3600+pick(storeId+'|'+bucket+'|up',1200000),
  source:'simulated',vendor:VENDOR_LABEL};
}

function num(v){return typeof v==='number'&&Number.isFinite(v)?v:null;}
export function telemetryPayload(device){
 return {source:device.source==='rms'?'rms':'simulated',vendor:VENDOR_LABEL,model:device.model,serial:device.serial,imei:device.imei,
  firmware:device.firmware,operator:device.operator,radio:device.radio,rsrp:device.rsrp,rsrq:device.rsrq,sinr:device.sinr,
  data_usage_gb:device.data_usage_gb,uptime_s:device.uptime_s,vendor_status:device.vendor_status,
  badge:device.source==='simulated'?'SIMULADO':null};
}
export function mapToItilCi(device){
 return {itil_code:routerItilCode(device.admira_store_id),name:'Router · Teltonika o similar',category:'red',role:'Router de tienda',group_name:'Red',
  status:lifecycleStatus(device.vendor_status)};
}

export function createTeltonikaSimulator(now){
 return {id:'teltonika-rms-simulator',vendor:'teltonika-rms',source:'simulated',ready(){return {ok:true};},
  async listDevices(sites){return {devices:(sites||[]).map(s=>simulateRouter(s.admira_store_id,now))};},
  async getDeviceStatistics(devices){return {devices};},
  mapToItilCi};
}
function rmsFetcher(env){return env.NETWORK_FETCH||fetch;}
export function createTeltonikaReal(env){
 const token=typeof env.TELTONIKA_RMS_TOKEN==='string'?env.TELTONIKA_RMS_TOKEN:'';
 return {id:'teltonika-rms-real',vendor:'teltonika-rms',source:'rms',
  ready(){return token?{ok:true}:{skipped:'no_token'};},
  async listDevices(sites){
   if(!token)return {skipped:'no_token',devices:[]};
   const res=await rmsFetcher(env)(RMS_BASE+'/devices',{headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
   if(!res.ok)return {skipped:'rms_http_'+res.status,devices:[]};
   const body=await res.json();
   const list=Array.isArray(body)?body:Array.isArray(body?.data)?body.data:Array.isArray(body?.devices)?body.devices:[];
   const wanted=new Set((sites||[]).map(s=>s.admira_store_id));
   const devices=[];
   for(const row of list){
    const store=row?.admira_store_id||row?.tags?.admira_store_id||row?.custom?.admira_store_id;
    if(!store||!wanted.has(store))continue;
    const status=String(row.status||row.state||'online').toLowerCase();
    const vendorStatus=status.includes('off')?'offline':status.includes('deg')||status.includes('weak')?'degraded':'online';
    devices.push({admira_store_id:store,external_id:String(row.id||row.serial||store),model:String(row.model||'RUT241').slice(0,40),
     radio:String(row.radio||row.network||'4G').includes('5')?'5G':'4G',operator:String(row.operator||row.carrier||'RMS').slice(0,40),
     firmware:String(row.firmware||'').slice(0,40),serial:String(row.serial||'').slice(0,40),imei:String(row.imei||'').slice(0,20),
     vendor_status:applySignal(vendorStatus,num(row.rsrp)),rsrp:num(row.rsrp),rsrq:num(row.rsrq),sinr:num(row.sinr),
     data_usage_gb:num(row.data_usage_gb),uptime_s:num(row.uptime_s),source:'rms',vendor:VENDOR_LABEL});
   }
   if(!devices.length)return {skipped:'unmapped',devices:[]};
   return {devices};
  },
  async getDeviceStatistics(devices){
   if(!token||!devices.length)return {devices};
   const res=await rmsFetcher(env)(RMS_BASE+'/devices/statistics?charts=status',{headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
   if(!res.ok)return {devices};
   return {devices};
  },
  mapToItilCi};
}
export function createNetworkAdapter(env,now=Date.now()){
 const vendor=env.NETWORK_VENDOR||'teltonika-rms';
 const source=env.NETWORK_SOURCE||'simulated';
 if(vendor!=='teltonika-rms')return {skipped:'vendor_unsupported',vendor,source};
 if(source==='real')return createTeltonikaReal(env);
 if(source!=='simulated')return {skipped:'source_unsupported',vendor,source};
 return createTeltonikaSimulator(now);
}
