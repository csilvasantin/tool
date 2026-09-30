import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from './src/index.js';
import {setup} from './test-fixture.mjs';
import {handleRetailer} from './src/retailer-portal.js';
import {handlePortalMcp} from './src/portal-mcp.js';
import {hash} from './src/installer-portal.js';
import {syncXpacios} from './src/admira-xpacio-sync.js';
import {handleItilInternal,handleItilPublic,GALAXY_ORIGINS,parseCi} from './src/itil.js';
import {validItilCode,toCmdb2Element,toCmdb2Xpacio,toXpacioCi1,publicCi,ITIL_CATEGORIES} from './src/itil-model.js';

// ITIL (FLT-101300): Yokup es el maestro de los equipos de cada Xpacio. Ver docs/itil-yokup.md.
const ORIGIN='https://www.yokup.com';
const surfaces=names=>names.map(([name,surface])=>({name,desc:'',status:'sched',surface}));
const sbux=(extra={})=>({id:'alsea-sbux-021',name:'Starbucks Paseo de Gracia',kind:'Cafetería · Starbucks',addr:'Paseo de Gracia 103 · Barcelona · 08008',coords:[2.15979,41.39574],city:'Barcelona',circuit:'alsea_starbucks',external:{brand:'Starbucks',operator:'Alsea'},twin:'https://www.xpaceos.com/admira-xp/?loc=alsea-sbux-021',surfaces:surfaces([['Menu board digital','pantalla'],['Pantalla recogida','pantalla'],['Escaparate','escaparate']]),...extra});
const jti=(extra={})=>({id:'jti-xtanco-001',name:'Estanco Juan Florez',kind:'Estanco · Xtanco',addr:'Rúa Juan Flórez 40 · A Coruña',coords:[-8.408523,43.365151],city:'A Coruña',circuit:'jti_xtanco',external:{brand:'Xtanco',sponsor:'JTI'},twin:'https://www.xpaceos.com/admira-xp/?loc=jti-xtanco-001',surfaces:surfaces([['LED Frontal','pantalla'],['Mostrador panel','mostrador']]),...extra});
const serve=list=>async()=>new Response(JSON.stringify({locations:list}),{status:200});
const count=(db,sql,...a)=>db.prepare(sql).get(...a).n;
const internal=(path,body,{host='yokup-api.internal',headers={}}={})=>new Request('https://'+host+'/internal/itil'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});
const fleet=async(env,path,body)=>{const r=await handleItilInternal(internal(path,body&&{actor:'OraculoMacMini',machine:'MacMini',...body}),env);return {status:r.status,body:await r.json()};};
const deviceBySurface=(db,store,key)=>db.prepare('SELECT device_id FROM admira_xpacio_devices WHERE admira_store_id=? AND surface_key=?').get(store,key).device_id;
const lc=(db,id)=>db.prepare('SELECT * FROM device_lifecycle WHERE device_id=?').get(id);
async function seeded(list=[sbux(),jti()]){const h=setup();const r=await syncXpacios(h.env,{fetcher:serve(list)});assert.equal(r.error,null);return h;}
const pan={admira_store_id:'alsea-sbux-021',itil_code:'PDG103-PAN-01',name:'Menu board caja',category:'pantalla',role:'menu board',group_name:'Caja',position:'Pared caja · izquierda',orientation:'horizontal',
 lifecycle:{manufacturer:'Samsung',model:'QM55C',serial:'SN-SECRETO-9911',supplier:'Proveedor Oculto SL',invoice_ref:'FAC-2026-777',purchase_date:'2026-01-10',warranty_start:'2026-01-10',warranty_end:'2026-10-15',installed_at:'2026-01-20',installed_by:'Instalaciones Norte',maintenance_interval_days:90}};

test('código ITIL: único global y con formato ^[A-Z0-9]{2,12}(-[A-Z0-9]{2,12}){1,3}$',()=>{
 for(const ok of ['PDG103-PAN-01','AB-CD','A1-B2-C3-D4','ABCDEFGHIJKL-01'])assert.ok(validItilCode(ok),ok);
 for(const ko of ['pdg103-pan-01','PDG103','A-BC','ABCDEFGHIJKLM-01','AB-CD-EF-GH-IJ','AB_CD','AB-CD ',' AB-CD','AB--CD',7,null])assert.ok(!validItilCode(ko),String(ko));
 assert.throws(()=>parseCi({itil_code:'pdg-01',name:'X pantalla',category:'pantalla'}),e=>e.status===400&&e.code==='invalid_itil_code');
 assert.throws(()=>parseCi({itil_code:'AB-01',name:'X pantalla',category:'monitor'}),e=>e.code==='invalid_category');
 assert.throws(()=>parseCi({itil_code:'AB-01',name:'X pantalla',category:'pantalla',orientation:'diagonal'}),e=>e.code==='invalid_orientation');
 assert.throws(()=>parseCi({itil_code:'AB-01',name:'X pantalla',category:'pantalla',parent_itil_code:'AB-01'}),e=>e.code==='invalid_parent');
 assert.throws(()=>parseCi({itil_code:'AB-01',name:'X pantalla',category:'pantalla',lifecycle:{warranty_end:'2026-02-30'}}),e=>e.code==='invalid_date');
 assert.throws(()=>parseCi({itil_code:'AB-01',name:'X pantalla',category:'pantalla',owner:'x'}),e=>e.code==='unknown_fields');
 assert.equal(ITIL_CATEGORIES.length,10);
});

test('migración 0020 idempotente: re-ejecutada no duplica y siembra como catalogo lo que ya había sembrado la sync',async()=>{
 const {env,db}=await seeded();const before=count(db,'SELECT COUNT(*) n FROM itil_items');assert.equal(before,5);
 db.exec('DELETE FROM itil_items');const sql=readFileSync(new URL('./migrations/0020_itil.sql',import.meta.url),'utf8');db.exec(sql);db.exec(sql);
 assert.equal(count(db,"SELECT COUNT(*) n FROM itil_items WHERE managed_by='catalogo' AND itil_code IS NULL AND created_by='migracion-0020'"),5);
 assert.throws(()=>db.prepare("INSERT INTO itil_items(device_id,site_id,itil_code,category,managed_by,created_by,updated_by,created_at,updated_at) VALUES('x','y',NULL,'pantalla','itil','t','t',1,1)").run(),/CHECK/);
 assert.ok(env);
});

test('sync sin ITIL: siembra un CI catalogo (sin código) por superficie; con ITIL no siembra, no renombra, no retira ni reactiva',async()=>{
 const {env,db}=await seeded();
 assert.equal(count(db,"SELECT COUNT(*) n FROM itil_items i JOIN admira_xpacio_devices x ON x.device_id=i.device_id WHERE x.admira_store_id='alsea-sbux-021' AND i.managed_by='catalogo' AND i.itil_code IS NULL"),3);
 assert.equal(db.prepare('SELECT category FROM itil_items WHERE device_id=?').get(deviceBySurface(db,'jti-xtanco-001','mostrador-panel')).category,'pantalla');
 const created=await fleet(env,'/ci/upsert',pan);assert.equal(created.status,200);assert.equal(created.body.created,true);
 const devices=count(db,'SELECT COUNT(*) n FROM installer_devices'),menu=deviceBySurface(db,'alsea-sbux-021','menu-board-digital');
 // El catálogo cambia: renombra, quita una superficie y añade otra; y el Xpacio cambia de nombre.
 const r=await syncXpacios(env,{fetcher:serve([sbux({name:'Starbucks PdG 103',surfaces:surfaces([['Menu board NUEVO','pantalla'],['Totem nuevo','pantalla']])}),jti()]),force:true});
 assert.equal(r.error,null);assert.equal(r.updated,1);assert.equal(r.itil_managed,1);
 assert.equal(count(db,'SELECT COUNT(*) n FROM installer_devices'),devices,'no siembra');
 assert.equal(db.prepare('SELECT name FROM installer_devices WHERE id=?').get(menu).name,'Menu board digital','no renombra');
 assert.equal(db.prepare("SELECT s.name FROM retailer_sites s JOIN admira_xpacio_sites x ON x.site_id=s.id WHERE x.admira_store_id='alsea-sbux-021'").get().name,'Starbucks PdG 103','el establecimiento sí se refresca');
 assert.equal(lc(db,menu).status,'retired');assert.equal(lc(db,menu).updated_by,'OraculoMacMini · MacMini','no la reactiva la sync');
 assert.equal(count(db,"SELECT COUNT(*) n FROM admira_xpacio_devices WHERE admira_store_id='alsea-sbux-021' AND removed_at IS NOT NULL"),0,'no marca retiradas del catálogo');
 const itil=db.prepare("SELECT i.*,d.name FROM itil_items i JOIN installer_devices d ON d.id=i.device_id WHERE itil_code='PDG103-PAN-01'").get();
 assert.equal(itil.name,'Menu board caja');assert.equal(itil.managed_by,'itil');assert.equal(lc(db,itil.device_id).status,'operational');
 // El Xpacio sin ITIL sigue el catálogo como siempre.
 await syncXpacios(env,{fetcher:serve([sbux(),jti({surfaces:surfaces([['LED Frontal','pantalla']])})]),force:true});
 assert.equal(lc(db,deviceBySurface(db,'jti-xtanco-001','mostrador-panel')).status,'retired');
});

test('primer CI ITIL: retira los equipos del catálogo («Sustituido por ITIL») salvo los que tienen incidencias abiertas',async()=>{
 const {env,db}=await seeded();
 const [menu,pickup,window]=['menu-board-digital','pantalla-recogida','escaparate'].map(k=>deviceBySurface(db,'alsea-sbux-021',k));
 db.prepare("INSERT INTO installer_incidents(id,device_id,title,reason,status,created_at) VALUES('inc-open',?,'Sin imagen','retailer','open',1)").run(window);
 const r=await fleet(env,'/ci/upsert',pan);
 assert.deepEqual(r.body.retired_catalog.map(x=>x.device_id).sort(),[menu,pickup].sort());
 for(const id of [menu,pickup]){const row=lc(db,id);assert.equal(row.status,'retired');assert.equal(row.notes,'Sustituido por ITIL');assert.ok(row.retired_at);}
 assert.equal(lc(db,window).status,'operational','con incidencia abierta se conserva');
 assert.equal(count(db,"SELECT COUNT(*) n FROM itil_audit WHERE action='retire-catalog'"),2);
 const inv=await fleet(env,'/xpacios/alsea-sbux-021');assert.equal(inv.body.managed_by,'itil');assert.equal(inv.body.stats.catalogo,1);
 // Cerrada la incidencia, el siguiente alta ITIL retira el que quedaba (y el jti no se toca).
 db.prepare("UPDATE installer_incidents SET status='resolved',resolved_at=2 WHERE id='inc-open'").run();
 const second=await fleet(env,'/ci/upsert',{admira_store_id:'alsea-sbux-021',itil_code:'PDG103-PLY-01',name:'Player caja',category:'player'});
 assert.deepEqual(second.body.retired_catalog.map(x=>x.device_id),[window]);
 assert.equal(count(db,"SELECT COUNT(*) n FROM device_lifecycle lc JOIN admira_xpacio_devices x ON x.device_id=lc.device_id WHERE x.admira_store_id='jti-xtanco-001' AND lc.status='retired'"),0);
});

test('upsert idempotente por itil_code: repetir no reescribe; cambios parciales; relación padre sin ciclos; código único global',async()=>{
 const {env,db}=await seeded();
 const a=await fleet(env,'/ci/upsert',pan);assert.equal(a.body.created,true);const device=a.body.device_id,audits=count(db,'SELECT COUNT(*) n FROM itil_audit');
 const stamp=db.prepare('SELECT updated_at FROM itil_items WHERE device_id=?').get(device).updated_at;
 const again=await fleet(env,'/ci/upsert',pan);
 assert.equal(again.status,200);assert.equal(again.body.created,false);assert.equal(again.body.changed,false);assert.equal(again.body.device_id,device);
 assert.equal(count(db,'SELECT COUNT(*) n FROM itil_audit'),audits,'sin auditoría de un no-cambio');assert.equal(db.prepare('SELECT updated_at FROM itil_items WHERE device_id=?').get(device).updated_at,stamp);
 assert.equal(count(db,"SELECT COUNT(*) n FROM itil_items WHERE itil_code='PDG103-PAN-01'"),1);
 const link=db.prepare('SELECT * FROM retailer_device_links WHERE device_id=?').get(device);assert.equal(link.admira_store_id,'alsea-sbux-021');assert.equal(link.admira_device_id,'PDG103-PAN-01');assert.equal(link.circuit_id,'alsea_starbucks');
 assert.equal(db.prepare('SELECT skill,monitoring FROM installer_devices WHERE id=?').get(device).skill,'screen');
 const row=lc(db,device);assert.equal(row.serial,'SN-SECRETO-9911');assert.equal(row.category,'pantalla');assert.equal(row.maintenance_interval_days,90);assert.equal(row.updated_by,'OraculoMacMini · MacMini');
 // Solo lo que cambia; lo omitido se conserva y '' borra.
 const upd=await fleet(env,'/ci/upsert',{admira_store_id:'alsea-sbux-021',itil_code:'PDG103-PAN-01',name:'Menu board caja 2',category:'pantalla',position:'',lifecycle:{warranty_end:'2027-01-10'}});
 assert.deepEqual(upd.body.changes,['position','name','lifecycle']);
 const ci=db.prepare('SELECT * FROM itil_items WHERE device_id=?').get(device);assert.equal(ci.position,null);assert.equal(ci.group_name,'Caja');assert.equal(ci.orientation,'horizontal');assert.equal(lc(db,device).warranty_end,'2027-01-10');assert.equal(lc(db,device).serial,'SN-SECRETO-9911');
 // Relaciones: el player alimenta la pantalla; un ciclo se rechaza.
 await fleet(env,'/ci/upsert',{admira_store_id:'alsea-sbux-021',itil_code:'PDG103-PLY-01',name:'Player caja',category:'player'});
 const child=await fleet(env,'/ci/upsert',{admira_store_id:'alsea-sbux-021',itil_code:'PDG103-PAN-01',name:'Menu board caja 2',category:'pantalla',parent_itil_code:'PDG103-PLY-01'});
 assert.deepEqual(child.body.changes,['parent']);assert.equal(child.body.ci.parent_itil_code,'PDG103-PLY-01');
 const cycle=await fleet(env,'/ci/upsert',{admira_store_id:'alsea-sbux-021',itil_code:'PDG103-PLY-01',name:'Player caja',category:'player',parent_itil_code:'PDG103-PAN-01'});assert.equal(cycle.status,400);assert.equal(cycle.body.code,'parent_cycle');
 assert.equal((await fleet(env,'/ci/upsert',{admira_store_id:'alsea-sbux-021',itil_code:'PDG103-PAN-02',name:'Otra',category:'pantalla',parent_itil_code:'NOPE-01'})).body.code,'parent_not_found');
 // Único global: el mismo código en otro Xpacio es 409 y no crea nada.
 const devices=count(db,'SELECT COUNT(*) n FROM installer_devices');
 const taken=await fleet(env,'/ci/upsert',{admira_store_id:'jti-xtanco-001',itil_code:'PDG103-PAN-01',name:'LED',category:'pantalla'});assert.equal(taken.status,409);assert.equal(taken.body.code,'itil_code_taken');
 assert.equal(count(db,'SELECT COUNT(*) n FROM installer_devices'),devices);
 assert.equal((await fleet(env,'/ci/upsert',{...pan,lifecycle:{warranty_start:'2027-05-01'}})).body.code,'invalid_warranty');
 // Retirada con nota; repetirla no cambia nada.
 const ret=await fleet(env,'/ci/retire',{itil_code:'PDG103-PLY-01',note:'Sustituido por player nuevo'});assert.equal(ret.body.changed,true);
 assert.equal(lc(db,ret.body.device_id).status,'retired');assert.match(lc(db,ret.body.device_id).notes,/Retirado: Sustituido por player nuevo/);
 assert.equal((await fleet(env,'/ci/retire',{itil_code:'PDG103-PLY-01',note:'otra vez'})).body.changed,false);
 assert.equal((await fleet(env,'/ci/retire',{itil_code:'PDG103-PLY-01'})).body.code,'note_required');
});

test('adopción: un equipo del catálogo pasa a ITIL conservando id e historial; la sync ya no lo toca',async()=>{
 const {env,db}=await seeded();const led=deviceBySurface(db,'jti-xtanco-001','led-frontal'),panel=deviceBySurface(db,'jti-xtanco-001','mostrador-panel');
 const r=await fleet(env,'/ci/upsert',{admira_store_id:'jti-xtanco-001',itil_code:'JFL40-LED-01',name:'LED fachada',category:'pantalla',adopt_device_id:led});
 assert.equal(r.status,200);assert.equal(r.body.adopted,true);assert.equal(r.body.device_id,led);assert.deepEqual(r.body.retired_catalog.map(x=>x.device_id),[panel]);
 assert.equal(db.prepare('SELECT managed_by,itil_code FROM itil_items WHERE device_id=?').get(led).managed_by,'itil');
 assert.equal(db.prepare('SELECT admira_device_id FROM retailer_device_links WHERE device_id=?').get(led).admira_device_id,'JFL40-LED-01');
 await syncXpacios(env,{fetcher:serve([sbux(),jti({surfaces:surfaces([['Otro nombre','pantalla']])})]),force:true});
 assert.equal(db.prepare('SELECT name FROM installer_devices WHERE id=?').get(led).name,'LED fachada');assert.equal(lc(db,led).status,'operational');
 assert.equal((await fleet(env,'/ci/upsert',{admira_store_id:'jti-xtanco-001',itil_code:'JFL40-LED-02',name:'LED',category:'pantalla',adopt_device_id:led})).body.code,'already_itil');
 assert.equal((await fleet(env,'/ci/upsert',{admira_store_id:'jti-xtanco-001',itil_code:'JFL40-LED-03',name:'LED',category:'pantalla',adopt_device_id:deviceBySurface(db,'alsea-sbux-021','escaparate')})).body.code,'device_not_found');
});

test('rutas internas /internal/itil/*: solo por service binding; el tráfico público recibe 404 sin tocar nada',async()=>{
 const {env,db}=await seeded(),body={...pan,actor:'OraculoMacMini',machine:'MacMini'};
 for(const req of [internal('/ci/upsert',body,{host:'data.yokup.com'}),internal('/ci/upsert',body,{headers:{'CF-Connecting-IP':'203.0.113.9'}}),internal('/ci/upsert',body,{headers:{'CF-Ray':'abc-MAD'}}),internal('/xpacios',undefined,{host:'yokup-api.workers.dev'})])
  assert.equal((await handleItilInternal(req,env)).status,404);
 assert.equal((await worker.fetch(internal('/ci/upsert',body,{host:'data.yokup.com'}),env,{waitUntil(){}})).status,404);
 assert.equal((await worker.fetch(internal('/xpacios',undefined,{headers:{'CF-Connecting-IP':'203.0.113.9'}}),env,{waitUntil(){}})).status,404);
 assert.equal(count(db,"SELECT COUNT(*) n FROM itil_items WHERE managed_by='itil'"),0);
 const noAuthor=await handleItilInternal(internal('/ci/upsert',pan),env);assert.equal(noAuthor.status,400);assert.equal((await noAuthor.json()).code,'author_required');
 const ok=await worker.fetch(internal('/ci/upsert',body),env,{waitUntil(){}});assert.equal(ok.status,200);
 const list=await (await worker.fetch(internal('/xpacios?brand=alsea&q=gracia'),env,{waitUntil(){}})).json();
 assert.deepEqual(list.xpacios.map(x=>[x.admira_store_id,x.managed_by,x.itil_cis]),[['alsea-sbux-021','itil',1]]);
 assert.equal((await fleet(env,'/xpacios/nope-404')).status,404);
 assert.equal(db.prepare("SELECT channel FROM itil_audit WHERE action='create'").get().channel,'mcp-flota');
});

async function readKey(db,{solution='xpaceos',origins=[],brands=null}={}){const key='yki_'+crypto.randomUUID().replaceAll('-','').padEnd(64,'a').slice(0,64);db.prepare('INSERT INTO itil_read_keys(id,solution,key_hash,origins,brands,created_at) VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),solution,await hash(key),JSON.stringify(origins),brands&&JSON.stringify(brands),Date.now());return key;}
const galaxy=(env,id,headers={},method='GET')=>worker.fetch(new Request('https://data.yokup.com/api/itil/xpacios/'+id,{method,headers}),env,{waitUntil(){}});

test('lectura de la Galaxia: sin clave solo el recuento; con clave los CIs SIN datos privados; CORS de las cuatro soluciones y caché corta',async()=>{
 const {env,db}=await seeded();await fleet(env,'/ci/upsert',pan);await fleet(env,'/ci/upsert',{admira_store_id:'alsea-sbux-021',itil_code:'PDG103-PLY-01',name:'Player caja',category:'player'});
 await fleet(env,'/ci/upsert',{admira_store_id:'alsea-sbux-021',itil_code:'PDG103-PAN-01',name:'Menu board caja',category:'pantalla',parent_itil_code:'PDG103-PLY-01'});
 const anon=await galaxy(env,'alsea-sbux-021',{Origin:'https://www.pixeria.com'}),a=await anon.json();
 assert.equal(anon.status,200);assert.equal(anon.headers.get('Cache-Control'),'public, max-age=60');assert.equal(anon.headers.get('Access-Control-Allow-Origin'),'https://www.pixeria.com');assert.match(anon.headers.get('Vary'),/X-Yokup-Itil-Key/);
 assert.equal(a.access,'public');assert.equal(a.cis,undefined);assert.deepEqual(a.summary,{total:2,by_category:{pantalla:1,player:1}});assert.equal(a.xpacio.brand,'Alsea');assert.equal(a.managed_by,'itil');
 assert.doesNotMatch(JSON.stringify(a),/Caja|Pared|horizontal/,'sin clave no hay posiciones');
 const key=await readKey(db),full=await galaxy(env,'alsea-sbux-021',{'X-Yokup-Itil-Key':key,Origin:'https://www.xpaceos.com'}),f=await full.json();
 assert.equal(full.status,200);assert.equal(full.headers.get('Cache-Control'),'private, max-age=60');assert.equal(f.access,'key');assert.equal(f.solution,'xpaceos');
 const ci=f.cis.find(c=>c.code==='PDG103-PAN-01');
 assert.deepEqual(ci,{id:'PDG103-PAN-01',code:'PDG103-PAN-01',name:'Menu board caja',category:'pantalla',role:'menu board',group:'Caja',position:'Pared caja · izquierda',orientation:'horizontal',status:'operational',managed_by:'itil',parent:'PDG103-PLY-01',relations:[{type:'depends_on',code:'PDG103-PLY-01'}],warranty:ci.warranty,maintenance_due:ci.maintenance_due});assert.equal(typeof ci.maintenance_due,'boolean');
 assert.ok(['valid','expiring','expired'].includes(ci.warranty));
 const raw=JSON.stringify(f);
 for(const secret of ['SN-SECRETO-9911','Proveedor Oculto','FAC-2026-777','Samsung','QM55C','2026-10-15','2026-01-10','Instalaciones Norte','Paseo de Gracia 103','41.39','device_id','itil-','xpacio-'])assert.ok(!raw.includes(secret),'no expone '+secret);
 assert.equal(f.cis.length,2,'los catalogo retirados no se publican');
 assert.equal((await (await galaxy(env,'alsea-sbux-021',{'X-Yokup-Itil-Key':key})).json()).cis.length,2,'servidor a servidor sin Origin');
 assert.ok((await (await galaxy(env,'alsea-sbux-021',{'X-Yokup-Itil-Key':key},'GET')).json()).cis);
 assert.equal((await (await worker.fetch(new Request('https://data.yokup.com/api/itil/xpacios/alsea-sbux-021?include_retired=true',{headers:{'X-Yokup-Itil-Key':key}}),env,{waitUntil(){}})).json()).cis.length,5);
 for(const origin of ['https://www.xpaceos.com','https://xpaceos.com','https://www.pixeria.com','https://pixeria.com','https://www.admira.app','https://admira.app','https://www.clearchannel.tv','https://clearchannel.tv']){
  assert.ok(GALAXY_ORIGINS.has(origin));const pre=await galaxy(env,'alsea-sbux-021',{Origin:origin,'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'x-yokup-itil-key'},'OPTIONS');
  assert.equal(pre.status,204);assert.equal(pre.headers.get('Access-Control-Allow-Origin'),origin);assert.match(pre.headers.get('Access-Control-Allow-Headers'),/X-Yokup-Itil-Key/);assert.equal(pre.headers.get('Access-Control-Allow-Credentials'),null);
 }
 const evil=await galaxy(env,'alsea-sbux-021',{Origin:'https://evil.example','X-Yokup-Itil-Key':key});assert.equal(evil.status,403);assert.equal(evil.headers.get('Access-Control-Allow-Origin'),null);
 assert.equal((await galaxy(env,'alsea-sbux-021',{Origin:'https://www.yokup.com'})).status,403,'solo las soluciones de la Galaxia');
 assert.equal((await galaxy(env,'alsea-sbux-021',{},'POST')).status,405);
});

test('claves de lectura: formato, revocación, caducidad, orígenes y marcas; Xpacio inexistente o retirado es 404',async()=>{
 const {env,db}=await seeded();await fleet(env,'/ci/upsert',pan);
 assert.equal((await galaxy(env,'alsea-sbux-021',{'X-Yokup-Itil-Key':'bad'})).status,401);
 assert.equal((await galaxy(env,'alsea-sbux-021',{'X-Yokup-Itil-Key':'yki_'+'0'.repeat(64)})).status,401);
 const revoked=await readKey(db);db.prepare('UPDATE itil_read_keys SET revoked_at=1').run();assert.equal((await galaxy(env,'alsea-sbux-021',{'X-Yokup-Itil-Key':revoked})).status,401);
 const expired=await readKey(db);db.prepare('UPDATE itil_read_keys SET expires_at=1 WHERE revoked_at IS NULL').run();assert.equal((await galaxy(env,'alsea-sbux-021',{'X-Yokup-Itil-Key':expired})).status,401);
 const pix=await readKey(db,{solution:'pixeria',origins:['https://www.pixeria.com']});
 assert.equal((await galaxy(env,'alsea-sbux-021',{'X-Yokup-Itil-Key':pix,Origin:'https://www.xpaceos.com'})).status,403);
 const ok=await galaxy(env,'alsea-sbux-021',{'X-Yokup-Itil-Key':pix,Origin:'https://www.pixeria.com'});assert.equal(ok.status,200);
 assert.ok(db.prepare("SELECT last_used_at FROM itil_read_keys WHERE solution='pixeria'").get().last_used_at);
 const jtiOnly=await readKey(db,{solution:'admira-app',brands:['jti']});
 assert.equal((await galaxy(env,'alsea-sbux-021',{'X-Yokup-Itil-Key':jtiOnly})).status,404);assert.equal((await galaxy(env,'jti-xtanco-001',{'X-Yokup-Itil-Key':jtiOnly})).status,200);
 assert.equal((await galaxy(env,'no-existe')).status,404);
 db.prepare("UPDATE admira_xpacio_sites SET removed_at=1 WHERE admira_store_id='alsea-sbux-021'").run();assert.equal((await galaxy(env,'alsea-sbux-021')).status,404);
 const sbuxCatalog=await galaxy(env,'jti-xtanco-001');const c=await sbuxCatalog.json();assert.equal(c.managed_by,'catalogo');assert.equal(c.summary.total,2);
});

async function retail(env,path,body,cookie,method=body?'POST':'GET'){
 const r=await handleRetailer(new Request('https://data.yokup.com/api/retailer'+path,{method,headers:{Origin:ORIGIN,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined}),env);
 return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
async function shop(env){const a=await retail(env,'/register',{name:'Comercio A',email:crypto.randomUUID()+'@example.test',password:'retailer-test-password'});const site=await retail(env,'/sites',{name:'Estanco A',kind:'tobacco',country:'ES',city:'Barcelona',address:'Carrer de prova 1',latitude:41.38,longitude:2.16},a.cookie);return {cookie:a.cookie,site:site.body.id};}

test('portal del comercio: CRUD ITIL en su perímetro; otro comercio no ve ni retira; el lector no escribe',async()=>{
 const {env,db}=setup(),a=await shop(env),b=await shop(env);
 const manual=await retail(env,'/devices',{site_id:a.site,name:'Pantalla vieja',skill:'screen'},a.cookie);
 const inv0=await retail(env,'/itil/inventory?site_id='+a.site,undefined,a.cookie);assert.equal(inv0.status,200);assert.deepEqual(inv0.body.unmanaged.map(d=>d.device_id),[manual.body.id]);assert.equal(inv0.body.xpacio,null);
 const c=await retail(env,'/itil/cis',{site_id:a.site,itil_code:'ESTA-PAN-01',name:'Pantalla mostrador',category:'pantalla',group_name:'Mostrador',lifecycle:{warranty_end:'2030-01-01'}},a.cookie);
 assert.equal(c.status,201);assert.equal(c.body.ci.lifecycle.warranty,'valid');
 assert.equal((await retail(env,'/itil/cis',{site_id:a.site,itil_code:'ESTA-PAN-01',name:'Pantalla mostrador',category:'pantalla',group_name:'Mostrador',lifecycle:{warranty_end:'2030-01-01'}},a.cookie)).status,200);
 const adopt=await retail(env,'/itil/cis',{site_id:a.site,itil_code:'ESTA-PAN-02',name:'Pantalla vieja',category:'pantalla',adopt_device_id:manual.body.id},a.cookie);assert.equal(adopt.body.adopted,true);
 assert.equal((await retail(env,'/itil/cis',{site_id:a.site,itil_code:'bad',name:'X pantalla',category:'pantalla'},a.cookie)).body.code,'invalid_itil_code');
 const list=await retail(env,'/itil',undefined,a.cookie);assert.deepEqual(list.body.sites.map(s=>[s.site_id,s.itil_cis]),[[a.site,2]]);
 // Perímetro: B no ve el establecimiento, ni reutiliza ni retira el código de A.
 assert.equal((await retail(env,'/itil/inventory?site_id='+a.site,undefined,b.cookie)).status,404);
 assert.equal((await retail(env,'/itil/cis',{site_id:b.site,itil_code:'ESTA-PAN-01',name:'Robo',category:'pantalla'},b.cookie)).status,409);
 assert.equal((await retail(env,'/itil/cis/ESTA-PAN-01/retire',{note:'No es mío'},b.cookie)).status,404);
 assert.equal((await retail(env,'/itil/cis',{site_id:a.site,itil_code:'ESTA-PAN-03',name:'X pantalla',category:'pantalla',adopt_device_id:'retail-ajeno'},b.cookie)).status,404);
 const ret=await retail(env,'/itil/cis/ESTA-PAN-01/retire',{note:'Avería irreparable'},a.cookie);assert.equal(ret.status,200);assert.equal(ret.body.changed,true);
 assert.equal(db.prepare("SELECT channel FROM itil_audit WHERE action='retire'").get().channel,'portal');
 assert.equal((await retail(env,'/itil/cis',{site_id:a.site},undefined)).status,401);
});

test('MCP del comercio: itil_inventory_get con retailer:read; upsert y retirada con retailer:inventory, idempotentes por request_key',async()=>{
 const {env,db}=setup(),a=await shop(env);
 const tok=async scopes=>(await retail(env,'/mcp-tokens',{label:'Agente ITIL',scopes,expires_in_days:7},a.cookie)).body.token;
 const reader=await tok(['retailer:read']),writer=await tok(['retailer:read','retailer:inventory']);
 const call=async(token,name,args)=>(await (await handlePortalMcp(new Request('https://data.yokup.com/mcp/retailer',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify(name?{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}}:{jsonrpc:'2.0',id:1,method:'tools/list',params:{}})}),env,'retailer')).json());
 const names=(await call(reader)).result.tools.map(t=>t.name);assert.ok(names.includes('itil_inventory_get'));assert.ok(!names.includes('itil_ci_upsert')&&!names.includes('itil_ci_retire'));
 assert.equal((await call(reader,'itil_ci_upsert',{site_id:a.site,itil_code:'ESTA-PAN-01',name:'Pantalla',category:'pantalla',request_key:'itil-key-0001'})).error.code,-32602);
 const args={site_id:a.site,itil_code:'ESTA-PAN-01',name:'Pantalla',category:'pantalla',orientation:'vertical',lifecycle:{serial:'S-1',maintenance_interval_days:0},request_key:'itil-key-0001'};
 const up=await call(writer,'itil_ci_upsert',args);assert.equal(up.result.isError,false);assert.equal(up.result.structuredContent.http_status,201);
 assert.equal((await call(writer,'itil_ci_upsert',args)).result.structuredContent.replayed,true);
 assert.equal((await call(writer,'itil_ci_upsert',{...args,itil_code:'esta-pan-01',request_key:'itil-key-0002'})).error.code,-32602,'el esquema rechaza el formato');
 assert.equal((await call(writer,'itil_ci_upsert',{...args,request_key:'itil-key-0003',owner:'x'})).error.code,-32602);
 const inv=(await call(reader,'itil_inventory_get',{site_id:a.site})).result.structuredContent;assert.equal(inv.cis[0].itil_code,'ESTA-PAN-01');assert.equal(inv.cis[0].lifecycle.serial,'S-1');assert.equal(inv.cis[0].lifecycle.maintenance_interval_days,null);
 const ret=await call(writer,'itil_ci_retire',{itil_code:'ESTA-PAN-01',note:'Cambio de mobiliario',request_key:'itil-key-0004'});assert.equal(ret.result.structuredContent.changed,true);
 assert.equal(db.prepare("SELECT channel FROM itil_audit WHERE action='create'").get().channel,'mcp-comercio');
});

test('mapeo a admira.cmdb/2 y admira.xpacio.ci/1: campo a campo y sin inventar lo privado',()=>{
 const ci=publicCi({itil_code:'PDG103-PAN-01',name:'Menu board',category:'pantalla',role:'menu board',group_name:'Caja',position:'Pared',orientation:'vertical',managed_by:'itil',parent_code:'PDG103-PLY-01',status:'operational',warranty:'expiring',maintenance_due:false});
 const el=toCmdb2Element(ci);
 assert.equal(el.id,'PDG103-PAN-01');assert.equal(el.group,'iot');assert.equal(el.ci_class,'Pantalla');assert.equal(el.location,'Caja · Pared');assert.deepEqual(el.depends_on,['PDG103-PLY-01']);
 assert.equal(el.serial,'');assert.equal(el.vendor,'');assert.equal(el.warranty_until,'');assert.equal(el.yokup.warranty,'expiring');
 assert.equal(toCmdb2Element({...ci,category:'mobiliario',status:'planned'}).group,'analog');assert.equal(toCmdb2Element({...ci,status:'planned'}).status,'maintenance');
 const x=toCmdb2Xpacio({xpacio:{admira_store_id:'alsea-sbux-021',name:'Starbucks',city:'Barcelona',twin_url:'https://x'},cis:[ci]});assert.equal(x.id,'alsea-sbux-021');assert.equal(x.elements.length,1);
 const p=toXpacioCi1(ci,'alsea');
 assert.equal(p.schema,'admira.xpacio.ci/1');assert.equal(p.id,'alsea:PDG103-PAN-01');assert.equal(p.unidad,'PDG103-PAN-01');assert.equal(p.categoria,'pantallas');assert.equal(p.estado,'operativo');
 assert.equal(p.serie,'pendiente');assert.equal(p.compra.factura,'pendiente');assert.equal(p.garantia.estado,'expiring');assert.deepEqual(p.relaciones,[{tipo:'depende-de',id:'PDG103-PLY-01'}]);assert.equal(p.orientacion,'vertical');
 assert.equal(toXpacioCi1({...ci,category:'otro',status:'retired'}).categoria,'pendiente');assert.equal(toXpacioCi1({...ci,status:'retired'}).estado,'baja');
 assert.equal(publicCi({managed_by:'catalogo',surface_key:'escaparate',name:'Escaparate',category:'pantalla'}).id,'cat:escaparate');
});

test('herramienta de claves: el SQL que genera da de alta una clave válida solo por su hash y valida solución y orígenes',async()=>{
 const {readKeyRecord}=await import('./tools/itil-read-key.mjs');
 const {env,db}=await seeded();await fleet(env,'/ci/upsert',pan);
 const r=readKeyRecord('xpaceos',{origins:['https://www.xpaceos.com'],days:30});assert.match(r.token,/^yki_[a-f0-9]{64}$/);assert.ok(!r.sql.includes(r.token));
 db.exec(r.sql);assert.equal((await galaxy(env,'alsea-sbux-021',{'X-Yokup-Itil-Key':r.token,Origin:'https://www.xpaceos.com'})).status,200);
 db.exec(r.revoke);assert.equal((await galaxy(env,'alsea-sbux-021',{'X-Yokup-Itil-Key':r.token})).status,401);
 assert.throws(()=>readKeyRecord('otra'));assert.throws(()=>readKeyRecord('pixeria',{origins:['https://evil.example']}));assert.throws(()=>readKeyRecord('pixeria',{days:0}));
});
