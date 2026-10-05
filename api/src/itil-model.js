// ITIL (FLT-101300 · MorfeoMacMini): modelo puro, sin imports, para que lo compartan yokup-api, el gate del
// MCP de flota y las pruebas. Docs: docs/itil-yokup.md.
export const ITIL_SCHEMA='yokup.itil/1';
export const ITIL_CODE_PATTERN='^[A-Z0-9]{2,12}(-[A-Z0-9]{2,12}){1,3}$';
export const ITIL_CODE=new RegExp(ITIL_CODE_PATTERN);
export const ITIL_CATEGORIES=['pantalla','player','tpv','audio','iot','red','kiosk','mobiliario','iluminacion','otro'];
export const ITIL_ORIENTATIONS=['horizontal','vertical'];
export const ITIL_LIFECYCLE_TEXTS={manufacturer:120,model:120,serial:120,supplier:160,invoice_ref:120,installed_by:160};
export const ITIL_LIFECYCLE_DATES=['purchase_date','warranty_start','warranty_end','installed_at'];
export const ITIL_LIFECYCLE_FIELDS=[...Object.keys(ITIL_LIFECYCLE_TEXTS),...ITIL_LIFECYCLE_DATES,'maintenance_interval_days','warranty_months'];
export const ITIL_LIMITS={name:[2,160],role:[0,120],group_name:[0,80],position:[0,160],note:[3,300]};
export const validItilCode=v=>typeof v==='string'&&ITIL_CODE.test(v);
// La ficha de ciclo de vida no tiene 'kiosk': el CI conserva la categoría ITIL y la ficha usa 'otro'.
export const lifecycleCategory=c=>c==='kiosk'?'otro':c;
// Especialidad del técnico que atiende el equipo (installer_devices.skill).
const SKILL={pantalla:'screen',player:'player',audio:'audio',iot:'sensor',red:'network',kiosk:'kiosk'};
export const skillForCategory=c=>SKILL[c]||'kiosk';

// Galaxia: lo que viaja a las soluciones. NUNCA serie, factura, proveedor, fabricante, modelo, importes,
// fechas exactas, direcciones, coordenadas, correos ni ids internos. La garantía viaja como estado.
function networkNumber(v){return typeof v==='number'&&Number.isFinite(v)?v:null;}
// Telemetría operativa de un router. Sin serie, IMEI, coordenadas ni ids internos.
export function publicNetwork(n){
 if(!n||typeof n!=='object')return null;
 const source=n.source==='rms'?'rms':'simulated';
 return {source,vendor:'Teltonika o similar',model:typeof n.model==='string'?n.model.slice(0,40):null,
  operator:typeof n.operator==='string'?n.operator.slice(0,40):null,radio:n.radio==='5G'?'5G':n.radio==='4G'?'4G':null,
  rsrp:networkNumber(n.rsrp),rsrq:networkNumber(n.rsrq),sinr:networkNumber(n.sinr),data_usage_gb:networkNumber(n.data_usage_gb),uptime_s:networkNumber(n.uptime_s),
  firmware:typeof n.firmware==='string'?n.firmware.slice(0,40):null,
  vendor_status:['online','degraded','offline'].includes(n.vendor_status)?n.vendor_status:null,
  badge:source==='simulated'?'SIMULADO':null};
}
export function publicCi(ci){
 const out={id:ci.itil_code||'cat:'+(ci.surface_key||'equipo'),code:ci.itil_code||null,name:ci.name,category:ci.category,role:ci.role||null,
  group:ci.group_name||null,position:ci.position||null,orientation:ci.orientation||null,status:ci.status||'operational',managed_by:ci.managed_by,
  parent:ci.parent_code||null,relations:ci.parent_code?[{type:'depends_on',code:ci.parent_code}]:[],
  warranty:ci.warranty||'none',maintenance_due:!!ci.maintenance_due};
 if(ci.category==='red'&&ci.network){const network=publicNetwork(ci.network);if(network)out.network=network;}
 return out;
}

// Mapeo a admira.cmdb/2 (XpaceOS admira-xp/inventario.html). Lo privado queda vacío: no se inventa.
const CONNECTED=new Set(['pantalla','player','tpv','audio','iot','red','kiosk']);
const CMDB_CLASS={pantalla:'Pantalla',player:'Player',tpv:'TPV',audio:'Audio',iot:'Sensor IoT',red:'Red',kiosk:'Kiosco',mobiliario:'Mobiliario',iluminacion:'Iluminación',otro:'Otro'};
export function toCmdb2Element(ci){
 return {id:ci.id,group:CONNECTED.has(ci.category)?'iot':'analog',ci_class:CMDB_CLASS[ci.category]||'Otro',name:ci.name,
  status:ci.status==='planned'?'maintenance':ci.status,location:[ci.group,ci.position].filter(Boolean).join(' · '),owner:'',vendor:'',model:'',serial:'',
  depends_on:ci.parent?[ci.parent]:[],maintenance:{interval_days:null,last:''},warranty_until:'',purchase_date:'',
  notes:[ci.role,ci.orientation].filter(Boolean).join(' · '),category:CMDB_CLASS[ci.category]||'Otro',yokup:{code:ci.code,warranty:ci.warranty,managed_by:ci.managed_by}};
}
export function toCmdb2Xpacio(inv){return {id:inv.xpacio.admira_store_id,name:inv.xpacio.name,addr:inv.xpacio.city||'',twin:inv.xpacio.twin_url||'',status:'operational',created:'',elements:(inv.cis||[]).map(toCmdb2Element)};}
// Mapeo a admira.xpacio.ci/1 (Pixeria assets/xpaces/ci.mjs).
const CI1_CATEGORY={pantalla:'pantallas',player:'pantallas',tpv:'equipamiento',audio:'equipamiento',kiosk:'equipamiento',iot:'iot',red:'iot',mobiliario:'mobiliario',iluminacion:'iluminacion'};
const CI1_STATE={operational:'operativo',degraded:'averia',maintenance:'mantenimiento',retired:'baja',planned:'pendiente'};
export function toXpacioCi1(ci,prefix){
 const P='pendiente';
 return {schema:'admira.xpacio.ci/1',id:(prefix||'yokup')+':'+ci.id,unidad:ci.id,nombre:ci.name||P,categoria:CI1_CATEGORY[ci.category]||P,fabricante:P,modelo:P,serie:P,
  compra:{fecha:P,proveedor:P,factura:P},garantia:{inicio:P,fin:P,estado:ci.warranty},estado:CI1_STATE[ci.status]||P,ubicacion:[ci.group,ci.position].filter(Boolean).join(' · ')||P,
  responsable:P,red:null,relaciones:ci.parent?[{tipo:'depende-de',id:ci.parent}]:[],incidencias:[],orientacion:ci.orientation||null,sinGeometria:true,modelo3d:null};
}
// Esquemas MCP compartidos (MCP del comercio y MCP de flota): JSON Schema plano, additionalProperties false.
const str=(minLength,maxLength,extra={})=>({type:'string',minLength,maxLength,...extra});
const CODE_BODY='[A-Z0-9]{2,12}(-[A-Z0-9]{2,12}){1,3}';
const DAY={type:'string',maxLength:10,pattern:'^(\\d{4}-\\d{2}-\\d{2})?$'};
export const ITIL_CODE_SCHEMA=str(5,51,{pattern:ITIL_CODE_PATTERN});
export const ITIL_NOTE_SCHEMA=str(3,300);
export const ITIL_LIFECYCLE_SCHEMA={type:'object',properties:{manufacturer:str(0,120),model:str(0,120),serial:str(0,120),supplier:str(0,160),invoice_ref:str(0,120),installed_by:str(0,160),
 purchase_date:DAY,warranty_start:DAY,warranty_end:DAY,installed_at:DAY,maintenance_interval_days:{type:'integer',minimum:0,maximum:3650},warranty_months:{type:'integer',minimum:0,maximum:600}},required:[],additionalProperties:false};
export const ITIL_CI_PROPERTIES={itil_code:ITIL_CODE_SCHEMA,name:str(2,160),category:{type:'string',enum:[...ITIL_CATEGORIES]},role:str(0,120),group_name:str(0,80),position:str(0,160),
 orientation:{type:'string',enum:[...ITIL_ORIENTATIONS,'']},parent_itil_code:str(0,51,{pattern:'^('+CODE_BODY+')?$'}),lifecycle:ITIL_LIFECYCLE_SCHEMA,adopt_device_id:str(1,180,{pattern:'^[\\w:-]+$'})};
export const ITIL_CI_REQUIRED=['itil_code','name','category'];
// maintenance_interval_days 0 = borrar el intervalo (como retailer_device_lifecycle_update); warranty_months 0 = borrar los meses.
export function ciArgs(a){const {request_key,...rest}=a;if(rest.lifecycle){const l={...rest.lifecycle};if(l.maintenance_interval_days===0)l.maintenance_interval_days=null;if(l.warranty_months===0)l.warranty_months=null;rest.lifecycle=l;}return rest;}

// ── Equipo de una incidencia → CI del inventario (01-oct-2026 · ficha de inventario desde la incidencia Yokup).
// Los gemelos de XpaceOS abren incidencias con resource 'demo:<establecimiento del gemelo>:<equipo>[:manual:<uuid>]'
// (admira-xp/scripts/starbucks-incidents.mjs). El slug del gemelo no siempre es el admira_store_id del Xpacio:
// esta tabla los une SOLO cuando el gemelo replica un Xpacio real. No es un dato de equipo; es la correspondencia
// gemelo → Xpacio (Starbucks Paseo de Gracia 103 = alsea-sbux-021, cuyo twin_url es ese gemelo).
export const XPACEOS_TWIN_ALIASES=Object.freeze({'starbucks-alsea-paseo-de-gracia':'alsea-sbux-021'});
// Equipo genérico del gemelo → categoría ITIL (para casar por categoría cuando no hay superficie ni código).
const EQUIPO_CATEGORY=[[/^pantalla(?:-\d+)?$|^screen(?:-\d+)?$|^menu-?board/,'pantalla'],[/^tpv(?:-\d+)?$|^pos(?:-\d+)?$/,'tpv'],[/^player(?:-\d+)?$/,'player'],
 [/^(?:audio|altavoz|altavoces|speaker)(?:-\d+)?$/,'audio'],[/^(?:sensor|camara|cámara|camera|iot)(?:-\d+)?$/,'iot'],[/^(?:router|red|switch|wifi)(?:-\d+)?$/,'red'],[/^(?:kiosko?|kiosk)(?:-\d+)?$/,'kiosk']];
export const equipoCategory=e=>{const k=String(e||'').toLowerCase();for(const [re,c] of EQUIPO_CATEGORY)if(re.test(k))return c;return null;};
const EQUIPO_LABEL={pantalla:'Pantalla',tpv:'TPV',player:'Player',audio:'Audio',iot:'Sensor IoT',red:'Red',kiosk:'Kiosco'};
// Nombre propuesto para el alta (sale del propio id del equipo, nunca se inventa): 'pantalla-3' → 'Pantalla 3', 'tpv' → 'TPV'.
export function equipoLabel(e){const k=String(e||'').toLowerCase(),c=equipoCategory(k),n=/-(\d+)$/.exec(k)?.[1];return c?EQUIPO_LABEL[c]+(n?' '+n:''):String(e||'').slice(0,60);}
// 'demo:<store>:<equipo>[:manual:<uuid>]' | '<store>:<equipo>' → {store, equipo, twin}. null si no tiene esa forma.
export function parseEquipoRef(ref){
 const s=String(ref||'').trim();if(!s||s.length>200)return null;
 const parts=s.split(':'),twin=parts[0]==='demo';if(twin)parts.shift();
 if(parts.length<2||!/^[A-Za-z0-9][\w.-]{0,159}$/.test(parts[0])||!/^[A-Za-z0-9][\w.-]{0,59}$/.test(parts[1]))return null;
 const store=parts[0];return {store,admira_store_id:XPACEOS_TWIN_ALIASES[store]||store,equipo:parts[1],twin,manual:parts[2]==='manual'};
}
