import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {setup} from './test-fixture.mjs';
import {handleRetailer,handleCircuit} from './src/retailer-portal.js';
const site=(n=1)=>({external_ref:'STORE-'+n,name:'Tienda '+n,kind:'estanco',country:'ES',city:'Barcelona',address:'Calle de prueba '+n,latitude:'41,3874',longitude:'2,1686'});
async function req(env,path,body,cookie){const r=await handleRetailer(new Request('https://data.yokup.com/api/retailer'+path,{method:body?'POST':'GET',headers:{Origin:'https://www.yokup.com','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined}),env);return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function owner(env){return req(env,'/register',{name:'Retailer test',email:crypto.randomUUID()+'@example.test',password:'test-retailer-password'});}
async function central(env,path,body,valid=true){const raw=JSON.stringify(body),timestamp=String(Math.floor(Date.now()/1000)),signature=createHmac('sha256',valid?env.ADMIRA_CIRCUIT_SECRET:'wrong').update(timestamp+'.POST\n/api/circuit'+path+'\n'+raw).digest('hex');const r=await handleCircuit(new Request('https://data.yokup.com/api/circuit'+path,{method:'POST',body:raw,headers:{'X-Admira-Timestamp':timestamp,'X-Admira-Signature':signature}}),env);return {status:r.status,body:await r.json()};}
test('preview is read-only, atomic import persists 500 sites and repeats safely without duplicates',async()=>{
 const {env,db}=setup(),a=await owner(env),rows=Array.from({length:500},(_,i)=>site(i)),b={rows,request_key:'bulk-500-sites',filename:'Ubicaciones.xlsx'};
 const preview=await req(env,'/sites/import-preview',b,a.cookie);assert.equal(preview.status,200);assert.equal(preview.body.summary.created,500);assert.equal(db.prepare('SELECT COUNT(*) n FROM retailer_sites').get().n,0);
 const result=await req(env,'/sites/import',b,a.cookie);assert.equal(result.status,201);assert.equal(result.body.created,500);assert.equal(result.body.admira_status,'pending');
 assert.equal((await req(env,'/sites/import',b,a.cookie)).body.replayed,true);
 assert.equal((await req(env,'/sites/import',{...b,request_key:'bulk-new-key'},a.cookie)).body.duplicates,500);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM retailer_sites').get().n,500);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM retailer_site_import_items WHERE sync_status=?').get('pending').n,500);
 assert.equal((await req(env,'/sites/import',{...b,rows:[site(900)]},a.cookie)).status,409);
});
test('invalid row prevents all writes; blank coordinates are not zero; duplicate codes cannot overwrite',async()=>{
 const {env,db}=setup(),a=await owner(env);
 for(const bad of [{...site(2),latitude:''},{...site(2),longitude:181},{...site(2),kind:'invented'},{...site(2),country:'Spain'},{...site(2),name:{secret:'bad'}}]){
  const r=await req(env,'/sites/import',{rows:[site(),bad],request_key:crypto.randomUUID()},a.cookie);assert.equal(r.status,422);assert.equal(db.prepare('SELECT COUNT(*) n FROM retailer_sites').get().n,0);
 }
 const result=await req(env,'/sites/import',{rows:[site(),site()],request_key:'duplicate-rows'},a.cookie);assert.equal(result.body.created,1);assert.equal(result.body.duplicates,1);
 const conflict=await req(env,'/sites/import',{rows:[{...site(2),external_ref:'STORE-1'}],request_key:'duplicate-code'},a.cookie);assert.equal(conflict.status,422);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM retailer_sites').get().n,1);
 assert.equal((await req(env,'/sites/import',{rows:Array.from({length:501},(_,i)=>site(i)),request_key:'over-limit'},a.cookie)).status,400);
});
test('imports require retailer auth and stay isolated; manual sites are detected as existing',async()=>{
 const {env}=setup(),a=await owner(env),b=await owner(env),body={rows:[site()],request_key:'same-key-owners'};
 assert.equal((await req(env,'/sites/import',body)).status,401);
 await req(env,'/sites/import',body,a.cookie);assert.equal((await req(env,'/dashboard',null,b.cookie)).body.sites.length,0);
 assert.equal((await req(env,'/site-imports',null,b.cookie)).body.imports.length,0);
 assert.equal((await req(env,'/sites/import',body,b.cookie)).body.created,1);
 const manual={...site(2),kind:'tobacco',latitude:41.3874,longitude:2.1686};await req(env,'/sites',manual,a.cookie);
 assert.equal((await req(env,'/sites/import-preview',{rows:[site(2)]},a.cookie)).body.summary.duplicates,1);
});
test('failed batch rolls back both sites and receipt so the same request can be retried',async()=>{
 const {env,db}=setup(),a=await owner(env),b={rows:[site()],request_key:'rollback-test'};
 db.exec("CREATE TRIGGER reject_import BEFORE INSERT ON retailer_site_import_items BEGIN SELECT RAISE(ABORT,'test rollback'); END;");
 assert.equal((await req(env,'/sites/import',b,a.cookie)).status,500);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM retailer_sites').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM retailer_site_imports').get().n,0);
 db.exec('DROP TRIGGER reject_import');assert.equal((await req(env,'/sites/import',b,a.cookie)).status,201);
});
test('only central signed receipt marks Admira registered; immutable binding, ownership, and pending pagination',async()=>{
 const {env}=setup(),a=await owner(env),other=await owner(env);env.ADMIRA_CIRCUIT_SECRET='test-circuit-secret';
 await req(env,'/sites/import',{rows:[site(),site(2)],request_key:'central-test'},a.cookie);
 const query={retailer_id:a.body.profile.id,circuit_id:'test-circuit'};
 assert.equal((await central(env,'/site-imports',query,false)).status,401);
 const list=await central(env,'/site-imports',query);assert.equal(list.body.sites.length,2);
 assert.equal((await central(env,'/site-imports',{...query,retailer_id:other.body.profile.id})).body.sites.length,0);
 const confirm={...query,yokup_site_id:list.body.sites[0].id,admira_store_id:'real-store-id'};
 assert.equal((await central(env,'/site-imports/confirm',{...confirm,retailer_id:other.body.profile.id})).status,404);
 assert.equal((await central(env,'/site-imports/confirm',confirm)).status,200);
 assert.equal((await central(env,'/site-imports/confirm',confirm)).status,200);
 assert.equal((await central(env,'/site-imports/confirm',{...confirm,admira_store_id:'different'})).status,409);
 assert.equal((await central(env,'/site-imports/confirm',{...confirm,yokup_site_id:list.body.sites[1].id})).status,409);
 assert.equal((await central(env,'/site-imports',query)).body.sites.length,1);
 assert.equal((await req(env,'/site-imports',null,a.cookie)).body.imports[0].synced,1);
 const d=(await req(env,'/dashboard',null,a.cookie)).body;assert.equal(d.sites.filter(s=>s.sync_status==='synced').length,1);
});
test('publishing an Excel atomically creates public map records; no private account fields escape',async()=>{
 const {env,db}=setup(),a=await owner(env),b={rows:[site(),site(2)],publish_maps:true,request_key:'publish-maps-123'};
 const imported=await req(env,'/sites/import',b,a.cookie);assert.equal(imported.status,201);assert.equal(imported.body.map_status,'published');assert.equal(imported.body.published,2);
 const catalogue=db.prepare('SELECT * FROM admira_retailer_locations').all();assert.equal(catalogue.length,2);
 for(const row of catalogue){const loc=JSON.parse(row.public_json);assert.equal(loc.id,'yokup-'+row.site_id);assert.deepEqual(loc.coords,[2.1686,41.3874]);assert.deepEqual(loc.surfaces,[]);assert.ok(!row.public_json.includes(a.body.profile.email));assert.ok(!row.public_json.includes(a.body.profile.id));}
 const dash=(await req(env,'/dashboard',null,a.cookie)).body;assert.equal(dash.sites.filter(s=>s.catalog_id).length,2);
 assert.equal((await req(env,'/sites/import',b,a.cookie)).body.replayed,true);assert.equal(db.prepare('SELECT COUNT(*) n FROM admira_retailer_locations').get().n,2);
 assert.equal((await req(env,'/sites/import',{...b,publish_maps:false},a.cookie)).status,409);
 assert.equal((await req(env,'/site-imports',null,a.cookie)).body.imports[0].published,2);
});
test('old imports stay private; explicit owner publication and repeated Excel are safe',async()=>{
 const {env,db}=setup(),a=await owner(env),b=await owner(env);
 await req(env,'/sites/import',{rows:[site()],request_key:'legacy-private'},a.cookie);
 const id=db.prepare('SELECT id FROM retailer_sites').get().id;
 assert.equal(db.prepare('SELECT COUNT(*) n FROM admira_retailer_locations').get().n,0);
 assert.equal((await req(env,'/sites/'+id+'/publish',{publish_maps:true},b.cookie)).status,404);
 assert.equal((await req(env,'/sites/'+id+'/publish',{},a.cookie)).status,400);
 assert.equal((await req(env,'/sites/'+id+'/publish',{publish_maps:true},a.cookie)).status,200);
 assert.equal((await req(env,'/sites/'+id+'/publish',{publish_maps:true},a.cookie)).status,200);
 const repeated=await req(env,'/sites/import',{rows:[site()],publish_maps:true,request_key:'republish-safe'},a.cookie);assert.equal(repeated.body.created,0);assert.equal(repeated.body.duplicates,1);assert.equal(repeated.body.published,1);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM admira_retailer_locations').get().n,1);
});
test('catalogue write failure rolls back the private locations and entire import receipt',async()=>{
 const {env,db}=setup(),a=await owner(env);
 db.exec("CREATE TRIGGER reject_catalog BEFORE INSERT ON admira_retailer_locations BEGIN SELECT RAISE(ABORT,'test catalogue rollback'); END;");
 const result=await req(env,'/sites/import',{rows:[site()],publish_maps:true,request_key:'rollback-catalog'},a.cookie);assert.equal(result.status,500);
 for(const table of ['retailer_sites','retailer_site_imports','admira_retailer_locations'])assert.equal(db.prepare('SELECT COUNT(*) n FROM '+table).get().n,0);
});
