// Plano maestro del Xpacio (DCL-fbee86b0016fa4cef7a7726c · Hoy #186 · SubNeoMBP14 · 14-oct-2026): modelo puro, sin más
// imports que el del ITIL, para que lo compartan yokup-api, el gate del MCP de flota y las pruebas. Docs: docs/plano-yokup.md.
// Validación ESTRUCTURAL de admira.xpacio-plano/1: esquema, tamaños, tipos, ids, paredes, pantallas y límites. La
// geométrica (solapes, techo, puertas tapadas…) vive en plano-core.mjs de clearchannel-tv y aquí no se copia.
import {validItilCode,ITIL_CATEGORIES} from './itil-model.js';
export const PLANO_SCHEMA='admira.xpacio-plano/1';
export const PLANO_READ_SCHEMA='yokup.plano/1';
export const PLANO_DOCS='https://www.yokup.com/mcp/llms.txt';
export const PLANO_MAX_BYTES=262144; // 256 KB del JSON compacto
export const PLANO_LIMITS=Object.freeze({walls:200,items:2000,depth:12,string:4000,key:80,coord:1000,ancho:500,fondo:500,alto:30,pulgadas:1000,pixels:100000,errors:20});
export const PLAN_ID=/^[A-Za-z0-9][\w.-]{0,159}$/;
const L=PLANO_LIMITS,CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;
const num=v=>typeof v==='number'&&Number.isFinite(v);
const pos=v=>num(v)&&v>0;
const isObj=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const coord=v=>num(v)&&Math.abs(v)<=L.coord;
const point=p=>Array.isArray(p)&&p.length===2&&p.every(coord);
const pair=p=>Array.isArray(p)&&p.length===2&&p.every(v=>pos(v)&&v<=L.pixels);
const label=v=>'«'+String(v??'').slice(0,40)+'»';
const kb=n=>Math.ceil(n/1024);

// Recorre el JSON entero: profundidad, claves, textos (longitud y caracteres de control) y números finitos
// (JSON.parse('1e400') da Infinity). Para en el primer fallo: con eso basta para rechazarlo.
function walk(v,depth,errors){
 if(depth>L.depth){errors.push('El plano anida más de '+L.depth+' niveles.');return false;}
 if(typeof v==='string'){if(v.length>L.string||CONTROL.test(v)){errors.push('Hay un texto de más de '+L.string+' caracteres o con caracteres de control.');return false;}return true;}
 if(typeof v==='number'){if(!Number.isFinite(v)){errors.push('Hay un número no finito.');return false;}return true;}
 if(v===null||v===undefined||typeof v==='boolean')return true; // undefined: JSON.stringify lo quita
 if(Array.isArray(v)){for(const x of v)if(!walk(x,depth+1,errors))return false;return true;}
 if(isObj(v)){for(const [k,x] of Object.entries(v)){if(!k||k.length>L.key||CONTROL.test(k)){errors.push('Hay una clave vacía, de más de '+L.key+' caracteres o con caracteres de control.');return false;}if(!walk(x,depth+1,errors))return false;}return true;}
 errors.push('Tipo no admitido en el JSON.');return false;
}
const optText=(v,max)=>v===undefined||v===null||(typeof v==='string'&&v.length<=max);
const itilOk=v=>v===undefined||v===null||v===''||validItilCode(v);

// Valida y normaliza: el plano se reduce a su JSON compacto (fuera undefined, funciones…), en el orden en que llegó.
// Devuelve {ok, errors[], plan (normalizado), json, bytes, summary}. No añade ni corrige nada del autor.
export function validatePlan(input){
 const errors=[],err=m=>{if(errors.length<L.errors)errors.push(m);};
 if(!isObj(input))return {ok:false,errors:['El plano debe ser un objeto JSON.']};
 let json,plan;try{json=JSON.stringify(input);plan=JSON.parse(json);}catch{return {ok:false,errors:['El plano no se puede serializar como JSON.']};}
 const bytes=new TextEncoder().encode(json).length;
 if(bytes>PLANO_MAX_BYTES)return {ok:false,too_large:true,bytes,errors:['El plano ocupa '+kb(bytes)+' KB y el máximo es '+kb(PLANO_MAX_BYTES)+' KB.']};
 if(!walk(input,0,errors))return {ok:false,errors}; // antes de normalizar: JSON.stringify convertiría Infinity en null
 if(plan.schema!==PLANO_SCHEMA)return {ok:false,errors:['El esquema debe ser «'+PLANO_SCHEMA+'» y es '+label(plan.schema??'ninguno')+'.']};
 if(typeof plan.id!=='string'||!PLAN_ID.test(plan.id))err('El plano necesita un «id» válido (letras, cifras, punto, guion o guion bajo; hasta 160).');
 if(typeof plan.version!=='string'||!plan.version.trim()||plan.version.length>80)err('El plano necesita «version» (texto de 1 a 80 caracteres).');
 if(!optText(plan.nombre,160))err('«nombre» debe ser un texto de hasta 160 caracteres.');
 const p=plan.planta;
 if(!isObj(p)||!pos(p.ancho)||!pos(p.fondo)||!pos(p.alto)||p.ancho>L.ancho||p.fondo>L.fondo||p.alto>L.alto)err('Falta la sala: «planta» con ancho y fondo (hasta '+L.ancho+' m) y alto (hasta '+L.alto+' m), mayores que 0.');
 // Paredes: al menos 3, con id único y extremos a/b en metros.
 const walls=new Set();
 if(!Array.isArray(plan.paredes)||plan.paredes.length<3||plan.paredes.length>L.walls)err('«paredes» debe ser una lista de 3 a '+L.walls+' paredes.');
 else plan.paredes.forEach((w,i)=>{
  if(!isObj(w)||typeof w.id!=='string'||!w.id.trim()||w.id.length>40){err('La pared '+(i+1)+' no tiene id (hasta 40 caracteres).');return;}
  if(walls.has(w.id))err('El id de pared '+label(w.id)+' está repetido.');walls.add(w.id);
  if(!point(w.a)||!point(w.b))err('La pared '+label(w.id)+' necesita sus extremos a y b como [x, y] en metros.');
  else if(Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1])<0.05)err('La pared '+label(w.id)+' mide menos de 5 cm.');
  if(w.alto!==undefined&&!(pos(w.alto)&&w.alto<=L.alto))err('El alto de la pared '+label(w.id)+' debe ser mayor que 0 y de hasta '+L.alto+' m.');
 });
 const onWall=(v,what)=>{if(walls.size&&!walls.has(v))err(what+' está en una pared que no existe ('+label(v)+').');};
 // Pantallas: cada una es un CI del inventario (itil null mientras no se cruce con Yokup).
 let screens=0,devices=0;
 if(plan.pantallas!==undefined){
  if(!Array.isArray(plan.pantallas)||plan.pantallas.length>L.items)err('«pantallas» debe ser una lista de hasta '+L.items+'.');
  else{const ids=new Set();screens=plan.pantallas.length;plan.pantallas.forEach((s,i)=>{
   if(!isObj(s)||typeof s.id!=='string'||!s.id.trim()||s.id.length>80){err('La pantalla '+(i+1)+' no tiene id (hasta 80 caracteres).');return;}
   const n='La pantalla '+label(s.id);
   if(ids.has(s.id))err(n+' tiene el id repetido.');ids.add(s.id);
   onWall(s.pared,n);
   if(!coord(s.s)||!num(s.z)||s.z<-1||s.z>L.alto)err(n+' necesita «s» (centro desde la izquierda) y «z» (base, de -1 a '+L.alto+') en metros.');
   if(s.orientacion!=='vertical'&&s.orientacion!=='horizontal')err(n+' necesita «orientacion» vertical u horizontal.');
   if(!pos(s.pulgadas)||s.pulgadas>L.pulgadas)err(n+' necesita su diagonal en «pulgadas» (hasta '+L.pulgadas+').');
   if(s.resolucion!==undefined&&!pair(s.resolucion))err(n+': «resolucion» debe ser [ancho, alto] en píxeles.');
   if(s.aspecto!==undefined&&!pair(s.aspecto))err(n+': «aspecto» debe ser [16, 9] o similar.');
   if(s.dimensiones!==undefined&&!(isObj(s.dimensiones)&&pos(s.dimensiones.ancho)&&pos(s.dimensiones.alto)))err(n+': «dimensiones» debe llevar ancho y alto en metros.');
   if(!itilOk(s.itil))err(n+': «itil» debe ser null o un código ITIL (p. ej. PDG103-PAN-01).');
  });}
 }
 // Dispositivos (players, webcam…): opcionales; con pared, s y z si se sitúan.
 if(plan.dispositivos!==undefined){
  if(!Array.isArray(plan.dispositivos)||plan.dispositivos.length>L.items)err('«dispositivos» debe ser una lista de hasta '+L.items+'.');
  else{const ids=new Set();devices=plan.dispositivos.length;plan.dispositivos.forEach((d,i)=>{
   if(!isObj(d)||typeof d.id!=='string'||!d.id.trim()||d.id.length>80){err('El dispositivo '+(i+1)+' no tiene id (hasta 80 caracteres).');return;}
   const n='El dispositivo '+label(d.id);
   if(ids.has(d.id))err(n+' tiene el id repetido.');ids.add(d.id);
   if(d.pared!==undefined&&d.pared!==null)onWall(d.pared,n);
   if(!optText(d.categoria,40))err(n+': «categoria» debe ser un texto corto.');
   if((d.s!==undefined&&!coord(d.s))||(d.z!==undefined&&!(num(d.z)&&d.z>=-1&&d.z<=L.alto)))err(n+': «s» y «z» deben ser metros.');
   if(!itilOk(d.itil))err(n+': «itil» debe ser null o un código ITIL.');
  });}
 }
 // Huecos (puertas, escaparates) y mobiliario: opcionales, pero bien formados.
 for(const [key,fields,what] of [['huecos',['desde','ancho','alto'],'El hueco'],['mobiliario',['x','y','w','d','alto'],'El mueble']]){
  if(plan[key]===undefined)continue;
  if(!Array.isArray(plan[key])||plan[key].length>L.items){err('«'+key+'» debe ser una lista de hasta '+L.items+'.');continue;}
  plan[key].forEach((h,i)=>{
   const n=what+' '+(isObj(h)&&h.id?label(h.id):i+1);
   if(!isObj(h)||!fields.every(f=>coord(h[f]))){err(n+' necesita '+fields.join(', ')+' en metros.');return;}
   if(key==='huecos')onWall(h.pared,n);
   if(h.base!==undefined&&!coord(h.base))err(n+': «base» debe ser un número.');
  });
 }
 if(plan.criterios!==undefined&&!isObj(plan.criterios))err('«criterios» debe ser un objeto.');
 if(plan.yokup!==undefined&&!(isObj(plan.yokup)&&optText(plan.yokup.site_id,80)))err('«yokup» debe ser un objeto (site_id como texto).');
 return {ok:!errors.length,errors,plan,json,bytes,summary:{walls:Array.isArray(plan.paredes)?plan.paredes.length:0,screens,devices}};
}

// JSON canónico (claves ordenadas, sin espacios): el mismo plano con otro orden de claves o sangría tiene el mismo hash.
export const canonicalJson=v=>Array.isArray(v)?'['+v.map(canonicalJson).join(',')+']':isObj(v)?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonicalJson(v[k])).join(',')+'}':JSON.stringify(v);
export async function planHash(plan){
 const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalJson(plan)));
 return [...new Uint8Array(d)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export const planSummary=plan=>({walls:(plan.paredes||[]).length,screens:(plan.pantallas||[]).length,devices:(plan.dispositivos||[]).length,
 itil_linked:[...(plan.pantallas||[]),...(plan.dispositivos||[])].filter(e=>e&&e.itil).length});

// Cruce con el ITIL del MISMO establecimiento. Solo avisos: el plano se guarda igual. cis = [{itil_code, category, status, name, managed_by}].
export function crossCheck(plan,cis){
 const byCode=new Map(cis.filter(c=>c.itil_code).map(c=>[c.itil_code,c])),used=new Map(),warnings=[];
 const elements=[...(plan.pantallas||[]).map(el=>['pantalla',el]),...(plan.dispositivos||[]).map(el=>['dispositivo',el])];
 let linked=0,pending=0;
 for(const [kind,el] of elements){
  const code=el.itil,who=(kind==='pantalla'?'La pantalla ':'El dispositivo ')+label(el.id);
  if(!code){if(kind==='pantalla')pending++;continue;}
  if(used.has(code)){warnings.push({code:'itil_duplicated',itil:code,element:el.id,text:who+' repite el código '+code+', que ya usa '+label(used.get(code))+'.'});continue;}
  used.set(code,el.id);
  const ci=byCode.get(code);
  if(!ci){warnings.push({code:'itil_not_found',itil:code,element:el.id,text:who+' apunta a '+code+', que no es un CI de este establecimiento.'});continue;}
  linked++;
  if(ci.status==='retired')warnings.push({code:'itil_retired',itil:code,element:el.id,text:who+' apunta a '+code+', que está retirado en el inventario.'});
  const expected=kind==='pantalla'?'pantalla':ITIL_CATEGORIES.includes(el.categoria)?el.categoria:null;
  if(expected&&ci.category!==expected)warnings.push({code:'itil_category',itil:code,element:el.id,text:who+' apunta a '+code+', que es un CI de categoría '+ci.category+'.'});
 }
 const active=cis.filter(c=>c.status!=='retired');
 for(const ci of active)if(ci.itil_code&&ci.category==='pantalla'&&!used.has(ci.itil_code))warnings.push({code:'ci_screen_missing',itil:ci.itil_code,text:'El CI '+ci.itil_code+' ('+ci.name+') es una pantalla de este establecimiento y no está en el plano.'});
 const provisional=active.filter(c=>!c.itil_code&&c.category==='pantalla').length;
 if(provisional)warnings.push({code:'catalog_screens',count:provisional,text:provisional+' pantalla(s) provisionales del catálogo sin código ITIL: no se pueden cruzar con el plano hasta darles código.'});
 if(pending)warnings.push({code:'itil_pending',count:pending,text:pending+' pantalla(s) del plano sin código ITIL: por cruzar con Yokup.'});
 return {cis:active.length,linked,warnings};
}

// Galaxia: el plano SIN datos privados, por LISTA BLANCA (como publicCi del ITIL): solo viajan los campos conocidos de
// admira.xpacio-plano/1 y con su tipo (texto, número, [x, y]…). Todo lo demás se queda en Yokup: dirección, contactos,
// coordenadas, series, MAC/IP, NIF, ids internos (yokup.site_id), la máquina de flota de un dispositivo (fleet) o
// cualquier campo que un autor añada mañana. Un campo nuevo del esquema que deba viajar se añade aquí, con su prueba.
const text=v=>typeof v==='string'?v:undefined;
const number=v=>num(v)?v:undefined;
const numbers=v=>Array.isArray(v)&&v.length<=4&&v.every(num)?[...v]:undefined;
const flag=v=>typeof v==='boolean'?v:undefined;
const textOrNull=v=>v===null||typeof v==='string'?v:undefined;
const pick=spec=>v=>{if(!isObj(v))return undefined;const out={};for(const [k,f] of Object.entries(spec))if(Object.hasOwn(v,k)){const x=f(v[k]);if(x!==undefined)out[k]=x;}return out;};
const list=f=>v=>Array.isArray(v)?v.map(f).filter(x=>x!==undefined):undefined;
export const PLANO_PUBLIC_FIELDS=Object.freeze({
 schema:text,id:text,version:text,nombre:text,
 fuente:pick({titulo:text,medidas:text,pantallas:text,itil:text}),
 planta:pick({ancho:number,fondo:number,alto:number}),
 criterios:pick({alturaMinima:number,alturaMinimaEscaparate:number,holguraTecho:number,separacionMinima:number,profundidadMueble:number}),
 paredes:list(pick({id:text,nombre:text,a:numbers,b:numbers,alto:number})),
 huecos:list(pick({id:text,tipo:text,nombre:text,pared:text,desde:number,ancho:number,base:number,alto:number})),
 mobiliario:list(pick({id:text,tipo:text,nombre:text,x:number,y:number,w:number,d:number,alto:number})),
 contenidos:pick({instalacion:text,grupo:text,url:text}),
 pantallas:list(pick({id:text,itil:textOrNull,screenId:text,nombre:text,corto:text,tipo:text,grupo:text,grupoNombre:text,subgrupo:text,player:text,
  orientacion:text,pulgadas:number,resolucion:numbers,aspecto:numbers,dimensiones:pick({ancho:number,alto:number}),escaparate:flag,estado:text,pared:text,s:number,z:number,fuente:text})),
 dispositivos:list(pick({id:text,nombre:text,categoria:text,rol:text,pared:text,s:number,z:number,itil:textOrNull})),
 yokup:pick({managed_by:text,cis:number})
});
const publicRoot=pick(PLANO_PUBLIC_FIELDS);
export const publicPlan=plan=>publicRoot(plan)||{};

// Esquemas MCP (gate de flota): JSON Schema plano. plan es un objeto libre: lo valida yokup-api (validatePlan).
const str=(minLength,maxLength,extra={})=>({type:'string',minLength,maxLength,...extra});
export const PLANO_TARGET_PROPERTIES={admira_store_id:str(1,160,{pattern:'^[A-Za-z0-9][\\w.:-]{0,159}$'}),site_id:str(1,80,{pattern:'^[\\w-]{1,80}$'})};
export const PLANO_GET_PROPERTIES={...PLANO_TARGET_PROPERTIES,history:{type:'integer',minimum:0,maximum:50},seq:{type:'integer',minimum:1,maximum:1000000}};
export const PLANO_UPSERT_PROPERTIES={...PLANO_TARGET_PROPERTIES,plan:{type:'object',additionalProperties:true},base_sha256:str(0,64,{pattern:'^([a-f0-9]{64})?$'})};
