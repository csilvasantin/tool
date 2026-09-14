import {publishStatements} from './retailer-map-catalog.js';
import {fail,hash,statement,rows,text,rateLimit,response} from './installer-portal.js';
import {MAX_SITES,normalizeSite,naturalKey,siteContent} from '../../yokup-site/retailer-import-schema.mjs';

async function body(request){
 const limit=524288;if(Number(request.headers.get('content-length')||0)>limit)fail(413,'Archivo de datos demasiado grande.');
 const reader=request.body?.getReader();if(!reader)fail(400,'Faltan datos.');let size=0,parts=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();fail(413,'Archivo de datos demasiado grande.');}parts.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
 let b;try{b=JSON.parse(new TextDecoder().decode(bytes));}catch{fail(400,'JSON no válido.');}
 if(!b||Array.isArray(b)||!Array.isArray(b.rows)||!b.rows.length||b.rows.length>MAX_SITES)fail(400,`Incluye entre 1 y ${MAX_SITES} establecimientos.`);
 return b;
}
async function review(env,owner,input){
 const existing=await rows(env,'SELECT s.*,i.external_ref FROM retailer_sites s LEFT JOIN retailer_site_import_items i ON i.site_id=s.id WHERE s.retailer_id=?',owner);
 const byPlace=new Map(existing.map(s=>[naturalKey(s),s])),byCode=new Map(existing.filter(s=>s.external_ref).map(s=>[s.external_ref,s]));
 const result=[],fresh=[],existingSites=[];let duplicates=0;
 for(let n=0;n<input.length;n++){
  try{
   const s=normalizeSite(input[n]),key=naturalKey(s),coded=s.external_ref&&byCode.get(s.external_ref),located=byPlace.get(key),previous=coded||located;
   if(coded&&naturalKey(coded)!==key)throw Error('Este código ya identifica otra ubicación. Corrígelo; no se sobrescriben datos.');
   if(previous){if(siteContent(previous)!==siteContent(s))throw Error('Esta ubicación ya existe con datos diferentes. Revisa la fila; no se sobrescribe.');if(previous.id)existingSites.push(previous);duplicates++;result.push({row:Number.isInteger(input[n]?.source_row)?input[n].source_row:n+2,status:'duplicate',site:s,message:'Ya registrada o repetida en esta hoja.'});continue;}
   byPlace.set(key,s);if(s.external_ref)byCode.set(s.external_ref,s);fresh.push(s);result.push({row:Number.isInteger(input[n]?.source_row)?input[n].source_row:n+2,status:'new',site:s,message:'Lista para importar.'});
  }catch(e){result.push({row:Number.isInteger(input[n]?.source_row)?input[n].source_row:n+2,status:'error',message:e.message});}
 }
 return {rows:result,fresh,existingSites,summary:{total:input.length,created:fresh.length,duplicates,errors:result.filter(r=>r.status==='error').length}};
}
export async function siteImports(request,env,owner,path){
 if(path==='/site-imports'&&request.method==='GET'){
  const imports=await rows(env,`SELECT b.id,b.filename,b.created_at,b.result,COUNT(i.site_id) AS sites,SUM(CASE WHEN c.id IS NOT NULL THEN 1 ELSE 0 END) AS published,SUM(CASE WHEN i.sync_status='synced' THEN 1 ELSE 0 END) AS synced FROM retailer_site_imports b LEFT JOIN retailer_site_import_items i ON i.import_id=b.id LEFT JOIN admira_retailer_locations c ON c.site_id=i.site_id WHERE b.retailer_id=? GROUP BY b.id ORDER BY b.created_at DESC LIMIT 20`,owner);
  return response(request,{imports:imports.map(b=>({...b,result:JSON.parse(b.result)}))});
 }
 if(!['/sites/import-preview','/sites/import'].includes(path)||request.method!=='POST')return null;
 await rateLimit(env,'retail-import:'+owner,30,3600000);
 const b=await body(request);let digest,requestKey;
 if(path==='/sites/import'){
  requestKey=text(b.request_key,8,100);digest=await hash(JSON.stringify(b.publish_maps===true?{rows:b.rows,publish_maps:true}:b.rows));
  const previous=await statement(env,'SELECT * FROM retailer_site_imports WHERE retailer_id=? AND request_key=?',owner,requestKey).first();
  if(previous){if(previous.payload_hash!==digest)fail(409,'Este envío ya se utilizó con otros datos.');return response(request,{...JSON.parse(previous.result),replayed:true});}
 }
 const checked=await review(env,owner,b.rows);
 if(path.endsWith('preview'))return response(request,{rows:checked.rows,summary:checked.summary});
 if(checked.summary.errors)return response(request,{error:'Corrige las filas indicadas antes de importar. No se ha guardado ninguna.',rows:checked.rows,summary:checked.summary},422);
 const id=crypto.randomUUID(),now=Date.now(),filename=text(b.filename||'Ubicaciones',1,160);
 const publish=b.publish_maps===true;
 const result={id,...checked.summary,map_status:publish?'published':'private',published:publish?checked.fresh.length+new Set(checked.existingSites.map(s=>s.id)).size:0,admira_status:publish?'catalog_registered':'pending',message:publish?'Ubicaciones guardadas y publicadas en el catálogo de los mapas.':'Ubicaciones guardadas en Yokup. Publicación en mapas pendiente.'};
 const ops=[statement(env,'INSERT INTO retailer_site_imports VALUES(?,?,?,?,?,?,?)',id,owner,requestKey,digest,filename,JSON.stringify(result),now)];
 // Eight rows per statement stay below D1's bound-parameter limit. One atomic batch.
 for(let n=0;n<checked.fresh.length;n+=8){
  const chunk=checked.fresh.slice(n,n+8).map(s=>({...s,id:crypto.randomUUID()}));
  ops.push(statement(env,'INSERT INTO retailer_sites(id,retailer_id,name,kind,country,city,address,latitude,longitude,created_at) VALUES '+chunk.map(()=>'(?,?,?,?,?,?,?,?,?,?)').join(','),...chunk.flatMap(s=>[s.id,owner,s.name,s.kind,s.country,s.city,s.address,s.latitude,s.longitude,now])));
  ops.push(statement(env,'INSERT INTO retailer_site_import_items(site_id,retailer_id,import_id,natural_key,external_ref) VALUES '+chunk.map(()=>'(?,?,?,?,?)').join(','),...chunk.flatMap(s=>[s.id,owner,id,naturalKey(s),s.external_ref])));
  if(publish)ops.push(...publishStatements(env,chunk,now));
 }
 if(publish)ops.push(...publishStatements(env,[...new Map(checked.existingSites.map(s=>[s.id,s])).values()],now));
 try{await env.DB.batch(ops);}catch(e){
  if(String(e).includes('UNIQUE')){
   const receipt=await statement(env,'SELECT * FROM retailer_site_imports WHERE retailer_id=? AND request_key=?',owner,requestKey).first();
   if(receipt?.payload_hash===digest)return response(request,{...JSON.parse(receipt.result),replayed:true});
   fail(409,'Los establecimientos han cambiado. Revisa de nuevo el archivo antes de importar.');
  }throw e;
 }
 return response(request,result,201);
}

// Called only AFTER the central Admira HMAC has been verified by handleCircuit.
export async function circuitSiteImports(request,env,b,circuit){
 const path=new URL(request.url).pathname,owner=text(b.retailer_id,1,80);
 if(path==='/api/circuit/site-imports'){
  const after=typeof b.after==='string'?text(b.after,0,80):'';
  const sites=await rows(env,`SELECT s.*,i.external_ref,i.import_id FROM retailer_site_import_items i JOIN retailer_sites s ON s.id=i.site_id WHERE i.retailer_id=? AND i.sync_status='pending' AND i.site_id>? ORDER BY i.site_id LIMIT 100`,owner,after);
  return response(request,{sites,next_after:sites.length===100?sites.at(-1).id:null});
 }
 if(path==='/api/circuit/site-imports/confirm'){
  const site=text(b.yokup_site_id,1,80),store=text(b.admira_store_id,1,160);
  const item=await statement(env,'SELECT * FROM retailer_site_import_items WHERE site_id=? AND retailer_id=?',site,owner).first();if(!item)fail(404,'Ubicación importada no encontrada para ese titular.');
  if(item.sync_status==='synced'&&(item.circuit_id!==circuit||item.admira_store_id!==store))fail(409,'La ubicación ya tiene otro vínculo autorizado.');
  try{await statement(env,"UPDATE retailer_site_import_items SET sync_status='synced',circuit_id=?,admira_store_id=?,synced_at=? WHERE site_id=? AND retailer_id=? AND sync_status='pending'",circuit,store,Date.now(),site,owner).run();}catch(e){if(String(e).includes('UNIQUE'))fail(409,'La ubicación de Admira ya está vinculada a otro registro.');throw e;}
  const saved=await statement(env,'SELECT circuit_id,admira_store_id FROM retailer_site_import_items WHERE site_id=?',site).first();if(saved.circuit_id!==circuit||saved.admira_store_id!==store)fail(409,'Vínculo modificado por otra operación.');
  return response(request,{ok:true,yokup_site_id:site,admira_store_id:store,circuit_id:circuit});
 }
 return null;
}
