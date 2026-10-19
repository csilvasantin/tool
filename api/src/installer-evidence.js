/** Private R2 objects: no credentials, public URLs, filenames or EXIF in metadata. */
export const PHOTO_MAX=8*1024*1024, PHOTO_COUNT=6;
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const stmt=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
export function photoType(b){
 const dimensions=(w,h)=>w>0&&h>0&&w<=20000&&h<=20000&&w*h<=60000000;
 const tag=(start,end)=>String.fromCharCode(...b.slice(start,end));
 if(b.length>=24&&[137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n)){
  const view=new DataView(b.buffer,b.byteOffset,b.byteLength);let offset=8,header=false,data=false;
  while(offset+12<=b.length){const size=view.getUint32(offset),kind=tag(offset+4,offset+8);if(size>b.length-offset-12)return null;
   if(!header){if(kind!=='IHDR'||size!==13||!dimensions(view.getUint32(offset+8),view.getUint32(offset+12)))return null;header=true;}
   if(kind==='IDAT'&&size>0)data=true;
   if(kind==='IEND')return size===0&&header&&data?'image/png':null;
   offset+=12+size;
  }return null;
 }
 if(b.length>=12&&b[0]===255&&b[1]===216&&b[2]===255&&b.at(-2)===255&&b.at(-1)===217){
  let offset=2,frame=false;
  while(offset+4<=b.length){if(b[offset++]!==255)return null;while(b[offset]===255)offset++;const marker=b[offset++];
   if(marker===218)return frame&&offset+2<b.length?'image/jpeg':null;
   const length=(b[offset]<<8)|b[offset+1];if(length<2||offset+length>b.length)return null;
   if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){if(length<8||!dimensions((b[offset+5]<<8)|b[offset+6],(b[offset+3]<<8)|b[offset+4]))return null;frame=true;}
   offset+=length;
  }return null;
 }
 if(b.length>=25&&tag(0,4)==='RIFF'&&tag(8,12)==='WEBP'){
  const view=new DataView(b.buffer,b.byteOffset,b.byteLength),kind=tag(12,16),size=view.getUint32(16,true);
  if(view.getUint32(4,true)+8!==b.length||size>b.length-20)return null;
  if(kind==='VP8 '&&b.length>=30&&b[23]===157&&b[24]===1&&b[25]===42&&dimensions(view.getUint16(26,true)&16383,view.getUint16(28,true)&16383))return 'image/webp';
  if(kind==='VP8L'&&b[20]===47){const bits=view.getUint32(21,true);if(dimensions((bits&16383)+1,((bits>>>14)&16383)+1))return 'image/webp';}
  if(kind==='VP8X'&&size===10&&b.length>30){const w=1+b[24]+(b[25]<<8)+(b[26]<<16),h=1+b[27]+(b[28]<<8)+(b[29]<<16);if(dimensions(w,h)&&(/VP8 |VP8L/.test(tag(30,34))))return 'image/webp';}
 }
 return null;
}
export const evidenceUrl=(origin,id)=>origin+'/api/installer/evidence/'+encodeURIComponent(id);
export async function evidenceList(env,id,owner,origin){
 const {results=[]}=await stmt(env,'SELECT id,content_type,size,created_at FROM installer_evidence WHERE incident_id=? AND installer_id=? ORDER BY created_at,id',id,owner).all();
 return results.map(r=>({...r,url:evidenceUrl(origin,r.id)}));
}
async function owned(env,id,owner,writing=false){
 const row=await stmt(env,"SELECT status FROM installer_incidents WHERE id=? AND installer_id=? AND status IN ('assigned','resolved')",id,owner).first();
 if(!row||(writing&&row.status!=='assigned'))fail(409,'Solo puedes adjuntar fotos a una intervención en curso asignada a ti.');
}
async function boundedBytes(request){
 if(Number(request.headers.get('content-length'))>PHOTO_MAX)fail(413,'Cada foto admite hasta 8 MB.');
 const reader=request.body?.getReader();if(!reader)fail(400,'Selecciona una foto.');
 const chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>PHOTO_MAX){await reader.cancel();fail(413,'Cada foto admite hasta 8 MB.');}chunks.push(value);}
 if(!size)fail(400,'La foto está vacía.');const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return bytes;
}
export async function uploadPhoto(request,env,incident,owner){
 await owned(env,incident,owner,true);
 if(!env.INSTALLER_EVIDENCE)fail(503,'La subida de fotos no está disponible. Conserva la foto y reintenta.');
 const bytes=await boundedBytes(request),type=photoType(bytes);
 if(!type||request.headers.get('content-type')?.split(';')[0]!==type)fail(415,'Usa una foto JPEG, PNG o WebP válida.');
 const sha=await digest(bytes);
 const existing=await stmt(env,'SELECT id,object_key FROM installer_evidence WHERE incident_id=? AND installer_id=? AND sha256=?',incident,owner,sha).first();
 const id=existing?.id||crypto.randomUUID(),key=existing?.object_key||'interventions/'+id;
 // An interrupted retry repairs the same object; the hash also prevents duplicate photos.
 const count=await stmt(env,'SELECT COUNT(*) AS n FROM installer_evidence WHERE incident_id=? AND installer_id=?',incident,owner).first();
 if(!existing&&count.n>=PHOTO_COUNT)fail(409,'Esta intervención ya tiene seis fotos guardadas.');
 await env.INSTALLER_EVIDENCE.put(key,bytes,{httpMetadata:{contentType:type}});
 const saved=await env.INSTALLER_EVIDENCE.get(key);
 if(!saved||await digest(await saved.arrayBuffer())!==sha)fail(503,'La foto no se ha guardado correctamente. Reintenta la subida.');
 await owned(env,incident,owner,true);
 // Atomic cap, including concurrent requests. Unreferenced objects are never readable.
 await stmt(env,`INSERT OR IGNORE INTO installer_evidence(id,incident_id,installer_id,object_key,sha256,content_type,size,created_at)
 SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM installer_evidence WHERE incident_id=? AND installer_id=?)<?`,id,incident,owner,key,sha,type,bytes.length,Date.now(),incident,owner,PHOTO_COUNT).run();
 const row=await stmt(env,'SELECT id FROM installer_evidence WHERE incident_id=? AND installer_id=? AND sha256=?',incident,owner,sha).first();
 if(!row){await env.INSTALLER_EVIDENCE.delete?.(key);fail(409,'Esta intervención ya tiene seis fotos guardadas.');}
 if(row.id!==id)await env.INSTALLER_EVIDENCE.delete?.(key);
 return {ok:true,photo:(await evidenceList(env,incident,owner,new URL(request.url).origin)).find(p=>p.id===row.id)};
}
export async function readPhoto(env,id,owner){
 const row=await stmt(env,`SELECT e.* FROM installer_evidence e JOIN installer_incidents i ON i.id=e.incident_id
 WHERE e.id=? AND e.installer_id=? AND i.installer_id=? AND i.status IN ('assigned','resolved')`,id,owner,owner).first();
 if(!row)fail(404,'Foto no encontrada.');
 const object=await env.INSTALLER_EVIDENCE?.get(row.object_key);if(!object)fail(404,'Foto no disponible.');
 return {body:object.body,type:row.content_type};
}
export async function verifiedPhotos(env,incident,owner,ids,origin){
 if(!Array.isArray(ids)||!ids.length||ids.length>PHOTO_COUNT||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)fail(422,'Añade entre una y seis fotos guardadas.');
 if(!env.INSTALLER_EVIDENCE)fail(503,'No podemos comprobar las fotos. Reintenta sin cerrar.');
 const photos=[];
 for(const id of ids){
  const r=await stmt(env,'SELECT * FROM installer_evidence WHERE id=? AND incident_id=? AND installer_id=?',id,incident,owner).first();
  if(!r)fail(422,'Una foto no pertenece a esta intervención.');
  const obj=await env.INSTALLER_EVIDENCE.get(r.object_key);
  if(!obj)fail(422,'Una foto ya no está disponible. Vuelve a subirla antes de cerrar.');
  const bytes=new Uint8Array(await obj.arrayBuffer());
  if(bytes.length!==r.size||photoType(bytes)!==r.content_type||await digest(bytes)!==r.sha256)fail(422,'No se ha podido verificar una foto. Vuelve a subirla.');
  photos.push({id,url:evidenceUrl(origin,id)});
 }
 return {ok:true,url:photos[0].url,photos};
}
