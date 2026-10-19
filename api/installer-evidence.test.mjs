import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup,call,account,event,signed} from './test-fixture.mjs';
import {ingestEvent,dispatchNotifications,handleInstaller} from './src/installer-portal.js';
// Synthetic PNG fixture, never a private photo. Storage implements the R2 byte contract.
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ZkAAAAASUVORK5CYII=','base64'));
async function fixture(){
 const {env,db}=setup(),objects=new Map();
 env.INSTALLER_EVIDENCE={async put(k,b){objects.set(k,Uint8Array.from(b));},async get(k){const b=objects.get(k);return b?{body:b,arrayBuffer:async()=>b.slice().buffer}:null;}};
 const a=await call(env,'/register',account()),b=await call(env,'/register',account());
 await ingestEvent(await signed(env,event()),env);await dispatchNotifications(env);
 const id=db.prepare('SELECT id FROM installer_incidents').get().id;
 const photo=async(cookie=a.cookie,bytes=png,type='image/png',job=id,origin='https://www.admira.app')=>handleInstaller(new Request('https://data.admira.app/api/installer/incidents/'+job+'/photos',{method:'POST',headers:{Origin:origin,Cookie:cookie||'','Content-Type':type},body:bytes}),env);
 return {env,db,objects,a,b,id,photo};
}
test('photo lifecycle: server ownership, real bytes, retry dedupe, private read, associated closure and history',async()=>{
 const f=await fixture(),{env,db,a,b,id,photo,objects}=f;
 assert.equal((await photo()).status,409);
 let detail=await call(env,'/incidents/'+id,undefined,a.cookie);assert.equal(detail.body.incident.address,null);assert.equal(detail.body.incident.latitude,null);assert.deepEqual(detail.body.photos,[]);
 assert.equal((await call(env,'/incidents/'+id+'/accept',{},a.cookie)).status,200);
 assert.equal((await photo(b.cookie)).status,409);assert.equal((await photo(null)).status,401);assert.equal((await photo(a.cookie,png,'image/png',id,'https://evil.test')).status,403);
 const uploaded=await photo();assert.equal(uploaded.status,201);const data=await uploaded.json();assert(data.photo.id);assert.equal(objects.size,1);
 const again=await(await photo()).json();assert.equal(again.photo.id,data.photo.id);assert.equal(db.prepare('SELECT COUNT(*) n FROM installer_evidence').get().n,1);
 const read=async cookie=>handleInstaller(new Request(data.photo.url,{headers:{Cookie:cookie||''}}),env);
 assert.equal((await read(null)).status,401);assert.equal((await read(b.cookie)).status,404);const image=await read(a.cookie);assert.equal(image.status,200);assert.equal(image.headers.get('cache-control'),'no-store');assert.deepEqual(new Uint8Array(await image.arrayBuffer()),png);
 detail=await call(env,'/incidents/'+id,undefined,a.cookie);assert.equal(detail.body.incident.address,'Dirección privada 12');assert.equal(detail.body.photos.length,1);
 const other=await call(env,'/incidents/'+id,undefined,b.cookie);assert.equal(other.body.incident.address,null);assert.deepEqual(other.body.photos,[]);assert.deepEqual(other.body.timeline,[]);
 assert.equal((await call(env,'/incidents/'+id+'/progress',{note:'Cable sustituido; comprobando imagen.'},a.cookie)).status,200);
 const resolution='Cable sustituido y señal de imagen comprobada en el equipo aislado.';
 assert.equal((await call(env,'/incidents/'+id+'/resolve',{resolution,evidence_ids:[data.photo.id]},b.cookie)).status,409);
 assert.equal((await call(env,'/incidents/'+id+'/resolve',{resolution,evidence_ids:['unknown']},a.cookie)).status,422);
 const key=[...objects.keys()][0],original=objects.get(key);objects.delete(key);
 assert.equal((await call(env,'/incidents/'+id+'/resolve',{resolution,evidence_ids:[data.photo.id]},a.cookie)).status,422);assert.equal(db.prepare('SELECT status FROM installer_incidents').get().status,'assigned');
 objects.set(key,new Uint8Array([1,2,3]));assert.equal((await call(env,'/incidents/'+id+'/resolve',{resolution,evidence_ids:[data.photo.id]},a.cookie)).status,422);
 objects.set(key,original);const done=await call(env,'/incidents/'+id+'/resolve',{resolution,evidence_ids:[data.photo.id]},a.cookie);assert.equal(done.status,200);assert.equal(new URL(done.body.evidence_url).pathname,new URL(data.photo.url).pathname);
 assert.equal((await read(a.cookie)).status,200);assert.equal((await photo()).status,409);
 detail=await call(env,'/incidents/'+id,undefined,a.cookie);assert.equal(detail.body.incident.status,'resolved');assert(detail.body.timeline.some(e=>e.kind==='avance'));assert.equal(detail.body.photos.length,1);
 db.prepare('UPDATE installer_incidents SET installer_id=?').run(b.body.profile.id);assert.equal((await read(a.cookie)).status,404);assert.equal((await read(b.cookie)).status,404);
});
test('uploads fail closed for invalid type, spoofed headers, empty/oversize bodies, unavailable storage and cross-job references',async()=>{
 const {env,db,a,id,photo}=await fixture();await call(env,'/incidents/'+id+'/accept',{},a.cookie);
 for(const [bytes,type,status] of [[new Uint8Array(),'image/png',400],[new TextEncoder().encode('<svg>not a photo</svg>'),'image/svg+xml',415],[png,'image/jpeg',415],[new Uint8Array([255,216,255,224,0,2,255,217]),'image/jpeg',415],[png.slice(0,24),'image/png',415],[new Uint8Array(8388609),'image/png',413]])assert.equal((await photo(a.cookie,bytes,type)).status,status);
 const stored=await(await photo()).json();const saved=env.INSTALLER_EVIDENCE;delete env.INSTALLER_EVIDENCE;assert.equal((await photo()).status,503);
 env.INSTALLER_EVIDENCE=saved;
 const ev=event({device:{id:'second',name:'Another screen',latitude:41.3874,longitude:2.1686,address:'Another private address',skill:'screen'}});await ingestEvent(await signed(env,ev),env);await dispatchNotifications(env);const second=db.prepare("SELECT id FROM installer_incidents WHERE device_id='second'").get().id;await call(env,'/incidents/'+second+'/accept',{},a.cookie);
 assert.equal((await call(env,'/incidents/'+second+'/resolve',{resolution:'Probado el funcionamiento del segundo equipo de prueba.',evidence_ids:[stored.photo.id]},a.cookie)).status,422);
 assert.equal((await call(env,'/incidents/nonexistent',undefined,a.cookie)).status,404);
});
test('storage write/read failures never create successful evidence; cap applies to distinct persisted photos',async()=>{
 const {env,db,a,id,photo,objects}=await fixture();await call(env,'/incidents/'+id+'/accept',{},a.cookie);
 const original=env.INSTALLER_EVIDENCE.put;env.INSTALLER_EVIDENCE.put=async()=>{};assert.equal((await photo()).status,503);assert.equal(db.prepare('SELECT COUNT(*) n FROM installer_evidence').get().n,0);env.INSTALLER_EVIDENCE.put=original;
 const ids=[];for(let n=0;n<6;n++){const bytes=new Uint8Array([...png,n]);const r=await photo(a.cookie,bytes);assert.equal(r.status,201);ids.push((await r.json()).photo.id);}
 assert.equal((await photo(a.cookie,new Uint8Array([...png,7]))).status,409);assert.equal(objects.size,6);
 assert.equal((await photo(a.cookie,new Uint8Array([...png,0]))).status,201);
 assert.equal((await call(env,'/incidents/'+id+'/resolve',{resolution:'Probadas las seis fotos persistidas en este trabajo aislado.',evidence_ids:ids},a.cookie)).status,200);
});
