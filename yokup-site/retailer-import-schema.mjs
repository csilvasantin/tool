export const MAX_SITES=500;
export const HEADERS=['codigo','nombre','tipo','pais','ciudad','direccion','latitud','longitud'];
const clean=v=>String(v??'').trim();
const fold=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');
const kinds={estanco:'tobacco',tobacco:'tobacco',kiosco:'kiosk',quiosco:'kiosk',kiosk:'kiosk',supermercado:'supermarket',supermarket:'supermarket',hosteleria:'hospitality',hospitality:'hospitality',otro:'other',other:'other'};
const aliases={codigo:'external_ref',code:'external_ref',external_ref:'external_ref',nombre:'name',name:'name',establecimiento:'name',tipo:'kind',kind:'kind',pais:'country',country:'country',ciudad:'city',city:'city',direccion:'address',address:'address',latitud:'latitude',latitude:'latitude',lat:'latitude',longitud:'longitude',longitude:'longitude',lng:'longitude',lon:'longitude'};
export function headerFields(headers){
 const fields=headers.map(v=>aliases[fold(v)]||null),seen=new Set();
 for(const f of fields){if(f&&seen.has(f))throw Error('Hay columnas repetidas: '+f);if(f)seen.add(f);}
 for(const f of ['name','kind','country','city','address','latitude','longitude'])if(!seen.has(f))throw Error('Falta una columna obligatoria: '+Object.keys(aliases).find(k=>aliases[k]===f));
 return fields;
}
export function normalizeSite(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Fila no válida.');
 for(const f of ['external_ref','name','kind','country','city','address','latitude','longitude'])if(input[f]!=null&&!['string','number'].includes(typeof input[f]))throw Error('La fila debe contener valores de texto o números.');
 const s={external_ref:clean(input.external_ref),name:clean(input.name),kind:kinds[fold(input.kind)]||'',country:clean(input.country).toUpperCase(),city:clean(input.city),address:clean(input.address)};
 for(const [key,min,max,label] of [['name',2,120,'Nombre'],['city',2,120,'Ciudad'],['address',5,300,'Dirección'],['external_ref',0,100,'Código']]){
  if(s[key].length<min||s[key].length>max||/[\u0000-\u001f]/.test(s[key]))throw Error(label+': revisa su longitud y contenido.');
 }
 if(!s.kind)throw Error('Tipo: estanco, kiosco, supermercado, hostelería u otro.');
 if(!/^[A-Z]{2}$/.test(s.country))throw Error('País: usa dos letras, por ejemplo ES o PT.');
 for(const [field,limit,label] of [['latitude',90,'Latitud'],['longitude',180,'Longitud']]){
  const raw=clean(input[field]).replace(',','.');
  if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)||!Number.isFinite(Number(raw))||Math.abs(Number(raw))>limit)throw Error(label+': indica una coordenada válida; no se calculan coordenadas desde la dirección.');
  s[field]=Number(raw);
 }
 return s;
}
export const naturalKey=s=>JSON.stringify([s.country,fold(s.city),fold(s.address),fold(s.name)]);
export const siteContent=s=>JSON.stringify([s.name,s.kind,s.country,s.city,s.address,s.latitude,s.longitude]);
