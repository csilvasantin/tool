// ITIL (FLT-101300 · MorfeoMacMini): modelo puro, sin imports, para que lo compartan yokup-api, el gate del
// MCP de flota y las pruebas. Docs: docs/itil-yokup.md.
export const ITIL_SCHEMA='yokup.itil/1';
export const ITIL_CODE_PATTERN='^[A-Z0-9]{2,12}(-[A-Z0-9]{2,12}){1,3}$';
export const ITIL_CODE=new RegExp(ITIL_CODE_PATTERN);
export const ITIL_CATEGORIES=['pantalla','player','tpv','audio','iot','red','kiosk','mobiliario','iluminacion','otro'];
export const ITIL_ORIENTATIONS=['horizontal','vertical'];
export const ITIL_LIFECYCLE_TEXTS={manufacturer:120,model:120,serial:120,supplier:160,invoice_ref:120,installed_by:160};
export const ITIL_LIFECYCLE_DATES=['purchase_date','warranty_start','warranty_end','installed_at'];
export const ITIL_LIFECYCLE_FIELDS=[...Object.keys(ITIL_LIFECYCLE_TEXTS),...ITIL_LIFECYCLE_DATES,'maintenance_interval_days'];
export const ITIL_LIMITS={name:[2,160],role:[0,120],group_name:[0,80],position:[0,160],note:[3,300]};
export const validItilCode=v=>typeof v==='string'&&ITIL_CODE.test(v);
// La ficha de ciclo de vida no tiene 'kiosk': el CI conserva la categoría ITIL y la ficha usa 'otro'.
export const lifecycleCategory=c=>c==='kiosk'?'otro':c;
// Especialidad del técnico que atiende el equipo (installer_devices.skill).
const SKILL={pantalla:'screen',player:'player',audio:'audio',iot:'sensor',red:'network',kiosk:'kiosk'};
export const skillForCategory=c=>SKILL[c]||'kiosk';

// Galaxia: lo que viaja a las soluciones. NUNCA serie, factura, proveedor, fabricante, modelo, importes,
// fechas exactas, direcciones, coordenadas, correos ni ids internos. La garantía viaja como estado.
export function publicCi(ci){
 return {id:ci.itil_code||'cat:'+(ci.surface_key||'equipo'),code:ci.itil_code||null,name:ci.name,category:ci.category,role:ci.role||null,
  group:ci.group_name||null,position:ci.position||null,orientation:ci.orientation||null,status:ci.status||'operational',managed_by:ci.managed_by,
  parent:ci.parent_code||null,relations:ci.parent_code?[{type:'depends_on',code:ci.parent_code}]:[],
  warranty:ci.warranty||'none',maintenance_due:!!ci.maintenance_due};
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
 purchase_date:DAY,warranty_start:DAY,warranty_end:DAY,installed_at:DAY,maintenance_interval_days:{type:'integer',minimum:0,maximum:3650}},required:[],additionalProperties:false};
export const ITIL_CI_PROPERTIES={itil_code:ITIL_CODE_SCHEMA,name:str(2,160),category:{type:'string',enum:[...ITIL_CATEGORIES]},role:str(0,120),group_name:str(0,80),position:str(0,160),
 orientation:{type:'string',enum:[...ITIL_ORIENTATIONS,'']},parent_itil_code:str(0,51,{pattern:'^('+CODE_BODY+')?$'}),lifecycle:ITIL_LIFECYCLE_SCHEMA,adopt_device_id:str(1,180,{pattern:'^[\\w:-]+$'})};
export const ITIL_CI_REQUIRED=['itil_code','name','category'];
// maintenance_interval_days 0 = borrar el intervalo (como retailer_device_lifecycle_update).
export function ciArgs(a){const {request_key,...rest}=a;if(rest.lifecycle&&rest.lifecycle.maintenance_interval_days===0)rest.lifecycle={...rest.lifecycle,maintenance_interval_days:null};return rest;}
