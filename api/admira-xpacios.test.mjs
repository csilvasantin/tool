import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setup} from './test-fixture.mjs';
import {handleRetailer} from './src/retailer-portal.js';
import {handleAdmin} from './src/portal-admin.js';
import {handlePortalMcp} from './src/portal-mcp.js';
import {hash} from './src/installer-portal.js';
import {syncXpacios,brandOf,prepare,brandEmail} from './src/admira-xpacio-sync.js';
import {syncRetailerCircuits} from './src/admira-circuit-sync.js';
import {sweepLifecycleAlerts,isoDay} from './src/device-lifecycle.js';

const ORIGIN='https://www.yokup.com';
async function retail(env,path,body,cookie,method=body?'POST':'GET'){
 const r=await handleRetailer(new Request('https://data.yokup.com/api/retailer'+path,{method,headers:{Origin:ORIGIN,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined}),env);
 return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
async function admin(env,path,body,cookie){
 const r=await handleAdmin(new Request('https://data.yokup.com/api/portal-admin'+path,{method:body?'POST':'GET',headers:{Origin:ORIGIN,'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined}),env);
 return {status:r.status,body:await r.json()};
}
const surfaces=names=>names.map(([name,surface])=>({name,desc:'',status:'sched',surface}));
const sbux=(extra={})=>({id:'alsea-sbux-021',name:'Starbucks Paseo de Gracia',kind:'Cafetería · Starbucks · Circuito DOOH Alsea',addr:'Paseo de Gracia 103 · Barcelona · 08008',coords:[2.15979,41.39574],city:'Barcelona',circuit:'alsea_starbucks',external:{brand:'Starbucks',operator:'Alsea',storeId:'67943-302838'},twin:'https://www.xpaceos.com/admira-xp/?autostart=cafeteria&loc=alsea-sbux-021',surfaces:surfaces([['Menu board digital','pantalla'],['Pantalla recogida','pantalla'],['Escaparate','escaparate']]),...extra});
function catalog(){return [
 sbux(),
 {id:'alsea-mx-sbux-01-tijuana',name:'Starbucks Tijuana · Plaza Río',kind:'Cafetería · Starbucks · Alsea México',addr:'Avenida Paseo de los Héroes 95 · Tijuana · 22010 · México',coords:[-117.018754,32.527349],city:'Tijuana',circuit:'alsea_mexico',external:{brand:'Starbucks',operator:'Alsea'},twin:'https://www.xpaceos.com/admira-xp/?loc=alsea-mx-sbux-01-tijuana',surfaces:surfaces([['Menu board digital','pantalla']])},
 {id:'jti-xtanco-001',name:'Estanco Juan Florez',kind:'Estanco · Xtanco · Circuito DOOH JTI',addr:'Rúa Juan Flórez 40 · A Coruña · 15004',coords:[-8.408523,43.365151],city:'A Coruña',circuit:'jti_xtanco',external:{brand:'Xtanco',sponsor:'JTI'},twin:'https://www.xpaceos.com/admira-xp/?loc=jti-xtanco-001',surfaces:surfaces([['LED Frontal','pantalla'],['Mostrador panel','mostrador']])},
 {id:'caixabank-0001-carrer-de-pau-claris',name:'CaixaBank Carrer de Pau Claris',kind:'La Caixa / CaixaBank · Banca · Retail físico',addr:'Caixabank · Carrer de Pau Claris · la Dreta de l\'Eixample · Barcelona · Barcelonès',coords:[2.17,41.39],external:{brand:'CaixaBank',network:'La Caixa'},twin:'https://www.xpaceos.com/Xcaixa/?loc=caixabank-0001',surfaces:surfaces([['Escaparate','escaparate'],['Vending','vending']])},
 {id:'canalkiosk-gracia',name:'CanalKiosk Gràcia',kind:'Quiosco · Canal DOOH · Gemelo fotorreal',addr:'Plaça de la Vila de Gràcia · Barcelona 08012',coords:[2.157,41.402],xpaceUrl:'https://admira.tv/adcelerate/demo/best/',surfaces:surfaces([['Pantalla kiosko','pantalla']])},
 {id:'mystery-001',name:'Punto misterioso',kind:'Retail',addr:'Calle Mayor 1 · Madrid',coords:[-3.7,40.41],twin:'https://www.xpaceos.com/x/?loc=mystery-001',surfaces:[]},
 {id:'plain-001',name:'Sin gemelo',kind:'Cafetería',addr:'Calle 1 · Madrid',coords:[-3.7,40.41],surfaces:surfaces([['Pantalla','pantalla']])},
 {id:'yokup-5f1c',name:'Publicado por Yokup',kind:'Estanco · Retail Yokup',addr:'Calle 2 · Madrid',coords:[-3.7,40.41],twin:'https://x.test/',source:'yokup-retailer',surfaces:[]},
 {id:'loop-001',name:'Bucle',kind:'Estanco',addr:'Calle 3 · Madrid',coords:[-3.7,40.41],twin:'https://x.test/',source:'yokup-retailer',surfaces:[]}
];}
const serve=list=>async()=>new Response(JSON.stringify({locations:list,updatedAt:1,source:'kv'}),{status:200});
const count=(db,sql,...a)=>db.prepare(sql).get(...a).n;
async function shop(env){const a=await retail(env,'/register',{name:'Comercio A',email:crypto.randomUUID()+'@example.test',password:'retailer-test-password'});const site=await retail(env,'/sites',{name:'Estanco A',kind:'tobacco',country:'ES',city:'Barcelona',address:'Carrer de prova 1',latitude:41.38,longitude:2.16},a.cookie);const device=await retail(env,'/devices',{site_id:site.body.id,name:'Pantalla',skill:'screen'},a.cookie);return {cookie:a.cookie,id:a.body.profile.id,email:a.body.profile.email,site:site.body.id,device:device.body.id};}
async function superuserCookie(db){const token='ab'.repeat(32);db.prepare('INSERT INTO portal_admin_sessions VALUES(?,?,?,?)').run(await hash(token),'csilva@admira.com','google-sub-admin',Date.now()+3600000);return '__Host-yk_portal_admin='+token;}
const brandId=(db,key)=>db.prepare('SELECT retailer_id FROM brand_accounts WHERE brand_key=?').get(key)?.retailer_id;

test('marca: circuito conocido, operador/sponsor, prefijo del id y cuenta sin marca',()=>{
 const b=catalog().map(l=>brandOf(l).key);assert.deepEqual(b.slice(0,6),['alsea','alsea','jti','caixabank','canalkiosk','sin-marca']);
 assert.equal(brandOf({id:'x-1',external:{operator:'Grupo Nuevo'}}).key,'grupo-nuevo');assert.equal(brandOf({id:'xtanco-valencia'}).key,'xtanco');
 const p=prepare(catalog()[3]);assert.equal(p.city,'Barcelona');assert.equal(p.kind,'other');assert.equal(p.country,'ES');
 assert.equal(prepare(catalog()[1]).country,'MX');assert.equal(prepare(catalog()[2]).kind,'tobacco');assert.equal(prepare(catalog()[0]).kind,'hospitality');assert.equal(prepare(catalog()[4]).kind,'kiosk');
 assert.equal(prepare({...catalog()[0],coords:[0,0]}),null);
});

test('alta: Xpacios con gemelo → cuentas de marca, establecimientos y un equipo por superficie, sin bucle con Yokup',async()=>{
 const {env,db}=setup(),r=await syncXpacios(env,{fetcher:serve(catalog())});
 assert.equal(r.error,null);assert.equal(r.seen,6);assert.equal(r.created,6);assert.equal(r.pending,0);
 assert.deepEqual(db.prepare('SELECT brand_key FROM brand_accounts ORDER BY brand_key').all().map(b=>b.brand_key),['alsea','caixabank','canalkiosk','jti','sin-marca']);
 const alsea=db.prepare('SELECT a.* FROM retailer_accounts a JOIN brand_accounts b ON b.retailer_id=a.id WHERE b.brand_key=?').get('alsea');
 assert.equal(alsea.email,brandEmail('alsea'));assert.equal(alsea.name,'Alsea');assert.ok(alsea.password_hash.startsWith('!'));
 assert.equal(count(db,'SELECT COUNT(*) n FROM retailer_sites WHERE retailer_id=?',alsea.id),2);
 assert.equal(count(db,"SELECT COUNT(*) n FROM admira_xpacio_sites WHERE admira_store_id IN ('plain-001','yokup-5f1c','loop-001')"),0);
 const mx=db.prepare("SELECT s.* FROM retailer_sites s JOIN admira_xpacio_sites x ON x.site_id=s.id WHERE x.admira_store_id='alsea-mx-sbux-01-tijuana'").get();assert.equal(mx.country,'MX');assert.equal(mx.kind,'hospitality');
 assert.equal(count(db,'SELECT COUNT(*) n FROM installer_devices'),9);assert.equal(count(db,'SELECT COUNT(*) n FROM installer_devices WHERE monitoring=1'),0);
 const link=db.prepare("SELECT * FROM retailer_device_links WHERE admira_device_id='alsea-sbux-021:menu-board-digital'").get();assert.equal(link.circuit_id,'alsea_starbucks');assert.equal(link.admira_store_id,'alsea-sbux-021');
 assert.equal(db.prepare("SELECT d.skill FROM installer_devices d JOIN retailer_device_links l ON l.device_id=d.id WHERE l.admira_device_id='caixabank-0001-carrer-de-pau-claris:vending'").get().skill,'kiosk');
 const lc=db.prepare('SELECT * FROM device_lifecycle WHERE device_id=?').get(link.device_id);assert.equal(lc.category,'pantalla');assert.equal(lc.status,'operational');assert.equal(lc.warranty_end,null);assert.equal(lc.manufacturer,null);assert.equal(lc.serial,null);
 assert.equal(db.prepare("SELECT circuit_id FROM retailer_device_links WHERE admira_store_id='canalkiosk-gracia'").get().circuit_id,null);
 const run=db.prepare('SELECT * FROM xpacio_sync_runs').get();assert.equal(run.created,6);assert.ok(run.finished_at);
});

test('idempotencia por catalog_hash, throttle de 15 min y lotes que continúan en el siguiente cron',async()=>{
 const {env,db}=setup();
 const first=await syncXpacios(env,{fetcher:serve(catalog()),batch:2});assert.equal(first.created,2);assert.equal(first.pending,4);
 const second=await syncXpacios(env,{fetcher:serve(catalog()),batch:2});assert.equal(second.created,2,'con lote pendiente no espera 15 min');
 await syncXpacios(env,{fetcher:serve(catalog()),batch:2});
 assert.deepEqual(await syncXpacios(env,{fetcher:serve(catalog())}),{skipped:'recent'});
 const devices=count(db,'SELECT COUNT(*) n FROM installer_devices'),before=db.prepare('SELECT site_id,last_synced_at FROM admira_xpacio_sites ORDER BY site_id').all();
 const again=await syncXpacios(env,{fetcher:serve(catalog()),force:true});assert.equal(again.created,0);assert.equal(again.updated,0);assert.equal(again.removed,0);
 assert.equal(count(db,'SELECT COUNT(*) n FROM installer_devices'),devices);assert.deepEqual(db.prepare('SELECT site_id,last_synced_at FROM admira_xpacio_sites ORDER BY site_id').all(),before,'sin cambios no reescribe');
 db.prepare("UPDATE xpacio_sync_runs SET finished_at=NULL").run();assert.deepEqual(await syncXpacios(env,{fetcher:serve(catalog()),force:true}),{skipped:'running'});
});

test('cambio de superficie: nueva se crea, desaparecida se retira sin borrar, vuelve operativa; manuales e incidencias intactos',async()=>{
 const {env,db}=setup();await syncXpacios(env,{fetcher:serve(catalog())});
 const site=db.prepare("SELECT site_id FROM admira_xpacio_sites WHERE admira_store_id='alsea-sbux-021'").get().site_id;
 const esc=db.prepare("SELECT device_id FROM retailer_device_links WHERE admira_device_id='alsea-sbux-021:escaparate'").get().device_id;
 db.prepare("INSERT INTO installer_devices(id,name,latitude,longitude,address,skill,last_seen,monitoring) VALUES('manual-1','Hilo musical',41.39,2.15,'x','audio',0,0)").run();
 db.prepare('INSERT INTO retailer_device_links(device_id,site_id,created_at) VALUES(?,?,?)').run('manual-1',site,Date.now());
 db.prepare("INSERT INTO installer_incidents(id,device_id,title,reason,status,created_at) VALUES('inc-esc',?,'Escaparate apagado','retailer','open',?)").run(esc,Date.now());
 const changed=catalog();changed[0]=sbux({surfaces:surfaces([['Menu board digital','pantalla'],['Pantalla recogida','pantalla'],['Audio ambiente','audio']])});
 const r=await syncXpacios(env,{fetcher:serve(changed),force:true});assert.equal(r.updated,1);assert.equal(r.created,0);
 assert.equal(db.prepare('SELECT status FROM device_lifecycle WHERE device_id=?').get(esc).status,'retired');
 assert.ok(db.prepare('SELECT removed_at FROM admira_xpacio_devices WHERE device_id=?').get(esc).removed_at);
 assert.equal(count(db,'SELECT COUNT(*) n FROM installer_devices WHERE id=?',esc),1,'nunca se borra');assert.equal(count(db,"SELECT COUNT(*) n FROM installer_incidents WHERE id='inc-esc'"),1);
 assert.equal(count(db,"SELECT COUNT(*) n FROM device_lifecycle WHERE device_id='manual-1'"),0,'el equipo manual no se toca');assert.equal(count(db,"SELECT COUNT(*) n FROM installer_devices WHERE id='manual-1'"),1);
 assert.equal(db.prepare("SELECT d.skill FROM installer_devices d JOIN retailer_device_links l ON l.device_id=d.id WHERE l.admira_device_id='alsea-sbux-021:audio-ambiente'").get().skill,'audio');
 await syncXpacios(env,{fetcher:serve(catalog()),force:true});assert.equal(db.prepare('SELECT status FROM device_lifecycle WHERE device_id=?').get(esc).status,'operational');
 // Una retirada hecha por una persona no la revierte la sincronización.
 const pickup=db.prepare("SELECT device_id FROM retailer_device_links WHERE admira_device_id='alsea-sbux-021:pantalla-recogida'").get().device_id;
 db.prepare("UPDATE device_lifecycle SET status='retired',updated_by='persona@example.test' WHERE device_id=?").run(pickup);
 await syncXpacios(env,{fetcher:serve(changed),force:true});await syncXpacios(env,{fetcher:serve(catalog()),force:true});
 assert.equal(db.prepare('SELECT status FROM device_lifecycle WHERE device_id=?').get(pickup).status,'retired');
});

test('desaparición marca removed_at sin borrar; un catálogo recortado o caído no retira nada',async()=>{
 const {env,db}=setup();await syncXpacios(env,{fetcher:serve(catalog())});
 const r=await syncXpacios(env,{fetcher:serve(catalog().filter(l=>l.id!=='jti-xtanco-001')),force:true});assert.equal(r.removed,1);
 assert.ok(db.prepare("SELECT removed_at FROM admira_xpacio_sites WHERE admira_store_id='jti-xtanco-001'").get().removed_at);
 assert.equal(count(db,"SELECT COUNT(*) n FROM retailer_device_links WHERE admira_store_id='jti-xtanco-001'"),2);
 await syncXpacios(env,{fetcher:serve(catalog()),force:true});assert.equal(db.prepare("SELECT removed_at FROM admira_xpacio_sites WHERE admira_store_id='jti-xtanco-001'").get().removed_at,null);
 const many=Array.from({length:12},(_,n)=>sbux({id:'alsea-sbux-'+(100+n)}));await syncXpacios(env,{fetcher:serve([...catalog(),...many]),force:true});
 const shrunk=await syncXpacios(env,{fetcher:serve(catalog().slice(0,2)),force:true});assert.equal(shrunk.error,'catalog_shrunk');assert.equal(count(db,'SELECT COUNT(*) n FROM admira_xpacio_sites WHERE removed_at IS NOT NULL'),0);
 const down=await syncXpacios(env,{fetcher:async()=>new Response('fail',{status:502}),force:true});assert.equal(down.error,'catalog_http_502');assert.equal(count(db,'SELECT COUNT(*) n FROM admira_xpacio_sites WHERE removed_at IS NOT NULL'),0);
 assert.equal((await syncXpacios(env,{fetcher:async()=>new Response('{"nope":1}'),force:true})).error,'catalog_shape');
});

test('los Xpacios no crean circuito en Admira ni se republican en los mapas; un comercio normal sí',async()=>{
 const {env,db}=setup();env.ADMIRA_CIRCUIT_SERVICE_KEY='svc';await syncXpacios(env,{fetcher:serve(catalog())});const a=await shop(env);
 const calls=[];const r=await syncRetailerCircuits(env,async(url,init)=>{calls.push(JSON.parse(init.body));return new Response(JSON.stringify({ok:true}));});
 assert.equal(r.assigned,1);assert.equal(calls.length,1);assert.match(calls[0].circuit,/^estanco-a-/);
 assert.equal(count(db,'SELECT COUNT(*) n FROM retailer_site_circuits c JOIN admira_xpacio_sites x ON x.site_id=c.site_id'),0);
 const src=readFileSync(new URL('./src/index.js',import.meta.url),'utf8');assert.match(src,/scheduled\([^)]*\)\s*\{[^}]*scheduledXpacioSync[^}]*sweepLifecycleAlerts/);
 assert.equal(a.site.length,36);
});

test('las cuentas de marca no admiten login, registro ni recuperación: correo reservado y hash bloqueado',async()=>{
 const {env,db}=setup();
 assert.equal((await retail(env,'/register',{name:'Okupa',email:brandEmail('nuevamarca'),password:'retailer-test-password'})).status,400);
 // Si alguien ya tuviera ese correo, la marca no se enlaza a su cuenta.
 db.prepare('INSERT INTO retailer_accounts VALUES(?,?,?,?,?,?)').run('squatter',brandEmail('alsea'),'Okupa','a'.repeat(64),'salt',Date.now());
 const r=await syncXpacios(env,{fetcher:serve(catalog())});assert.equal(r.error,'brand_account_unavailable');assert.equal(brandId(db,'alsea'),undefined);assert.equal(count(db,"SELECT COUNT(*) n FROM retailer_sites WHERE retailer_id='squatter'"),0);
 assert.equal((await retail(env,'/login',{email:brandEmail('jti'),password:'cualquier-cosa-larga'})).status,401);
 const token='cd'.repeat(32);db.prepare('INSERT INTO retailer_sessions VALUES(?,?,?)').run(await hash(token),brandId(db,'jti'),Date.now()+60000);
 assert.equal((await retail(env,'/me',undefined,'__Host-yk_retailer='+token)).status,401,'una sesión propia de marca no vale');
});

test('switch: un comercio normal no puede cambiar a otra cuenta; miembro verificado sí, con rol y revocación',async()=>{
 const {env,db}=setup();await syncXpacios(env,{fetcher:serve(catalog())});const a=await shop(env),b=await shop(env),alsea=brandId(db,'alsea');
 let acc=await retail(env,'/accounts',undefined,a.cookie);assert.equal(acc.status,200);assert.deepEqual(acc.body.accounts.map(x=>x.id),[a.id]);assert.equal(acc.body.superuser,false);
 for(const target of [alsea,b.id,'no-existe'])assert.equal((await retail(env,'/switch',{retailer_id:target},a.cookie)).status,403);
 assert.equal((await retail(env,'/switch',{retailer_id:alsea})).status,401);
 assert.equal((await retail(env,'/switch',{retailer_id:alsea},a.cookie,'POST')).status,403);
 // Miembro por correo, pero cuenta sin Google: el correo no está verificado → sin acceso.
 db.prepare('INSERT INTO retailer_account_members VALUES(?,?,?,?,?,NULL)').run(alsea,a.email,'viewer','test',Date.now());
 assert.equal((await retail(env,'/switch',{retailer_id:alsea},a.cookie)).status,403);
 db.prepare("INSERT INTO portal_google_identities VALUES('retailer',?,?)").run(a.id,'google-sub-a');
 acc=await retail(env,'/accounts',undefined,a.cookie);assert.deepEqual(acc.body.accounts.map(x=>[x.id,x.role,x.kind]),[[a.id,'owner','own'],[alsea,'viewer','brand']]);
 const sw=await retail(env,'/switch',{retailer_id:alsea},a.cookie);assert.equal(sw.status,200);assert.ok(sw.cookie);
 assert.equal((await retail(env,'/me',undefined,a.cookie)).status,401,'la sesión anterior se cierra al cambiar');
 const me=(await retail(env,'/me',undefined,sw.cookie)).body;assert.equal(me.profile.id,alsea);assert.deepEqual(me.access,{role:'viewer',delegated:true,actor_email:a.email,can_edit:false});
 const dash=(await retail(env,'/dashboard',undefined,sw.cookie)).body;assert.equal(dash.sites.length,2);assert.ok(dash.sites.every(s=>s.xpacio_id&&s.xpacio_twin_url));assert.equal(dash.devices.length,4);
 const device=dash.devices[0].id;
 assert.equal((await retail(env,'/devices/'+device+'/lifecycle',{notes:'x'},sw.cookie,'PUT')).status,403);assert.equal((await retail(env,'/devices',{site_id:dash.sites[0].id,name:'Nuevo',skill:'screen'},sw.cookie)).status,403);
 assert.equal((await retail(env,'/mcp-tokens',undefined,sw.cookie)).status,403);
 assert.equal((await retail(env,'/devices/'+a.device+'/lifecycle',undefined,sw.cookie)).status,404,'la sesión de marca no ve los equipos del comercio de origen');
 db.prepare("UPDATE retailer_account_members SET role='manager' WHERE retailer_id=?").run(alsea);
 assert.equal((await retail(env,'/devices/'+device+'/lifecycle',{manufacturer:'Samsung'},sw.cookie,'PUT')).status,200);
 assert.equal(db.prepare('SELECT updated_by FROM device_lifecycle WHERE device_id=?').get(device).updated_by,a.email);
 const back=await retail(env,'/switch',{retailer_id:a.id},sw.cookie);assert.equal(back.status,200);assert.equal((await retail(env,'/me',undefined,back.cookie)).body.profile.id,a.id);
 const again=await retail(env,'/switch',{retailer_id:alsea},back.cookie);assert.equal(again.status,200);
 db.prepare('UPDATE retailer_account_members SET revoked_at=? WHERE retailer_id=?').run(Date.now(),alsea);
 assert.equal((await retail(env,'/me',undefined,again.cookie)).status,401,'revocar corta la sesión delegada');
 const audit=db.prepare('SELECT outcome,COUNT(*) n FROM retailer_access_audit GROUP BY outcome ORDER BY outcome').all();assert.deepEqual(audit.map(x=>[x.outcome,x.n]),[['allowed',3],['denied',5]]);
 assert.equal((await retail(env,'/dashboard',undefined,b.cookie)).body.sites.length,1,'el otro comercio sigue aislado');
});

test('superusuario: ve y abre solo cuentas de marca; gestiona miembros y fuerza la sincronización',async()=>{
 const {env,db}=setup();env.XPACIO_FETCH=serve(catalog());const a=await shop(env),admin_=await superuserCookie(db);
 assert.equal((await admin(env,'/xpacios/sync',{},admin_)).body.created,6);
 const status=(await admin(env,'/xpacios',undefined,admin_)).body;assert.equal(status.last_run.created,6);assert.equal(status.brands.find(b=>b.brand_key==='alsea').active,2);assert.equal(status.brands.find(b=>b.brand_key==='alsea').devices,4);
 const alsea=brandId(db,'alsea'),acc=await retail(env,'/accounts',undefined,admin_);assert.equal(acc.status,200);assert.equal(acc.body.current,null);assert.equal(acc.body.accounts.length,5);assert.ok(acc.body.accounts.every(x=>x.role==='superuser'&&x.kind==='brand'));
 assert.equal((await retail(env,'/switch',{retailer_id:a.id},admin_)).status,403,'no suplanta comercios normales');
 const sw=await retail(env,'/switch',{retailer_id:alsea},admin_);assert.equal(sw.status,200);
 const me=(await retail(env,'/me',undefined,sw.cookie)).body;assert.equal(me.profile.id,alsea);assert.equal(me.access.role,'superuser');assert.equal(me.access.can_edit,true);
 const xsite=(await retail(env,'/dashboard',undefined,sw.cookie)).body.sites[0].id;assert.equal((await retail(env,'/sites/'+xsite+'/publish',{publish_maps:true},sw.cookie)).status,409,'un Xpacio no se republica en los mapas');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM admira_retailer_locations').get().n,0);
 assert.equal((await admin(env,'/xpacios/members',{retailer_id:a.id,email:'x@example.test',role:'viewer',action:'grant'},admin_)).status,404);
 assert.equal((await admin(env,'/xpacios/members',{retailer_id:alsea,email:'x@example.test',role:'root',action:'grant'},admin_)).status,400);
 assert.equal((await admin(env,'/xpacios/members',{retailer_id:alsea,email:'Gerente@Alsea.test',role:'manager',action:'grant'},admin_)).status,200);
 assert.equal(db.prepare('SELECT role FROM retailer_account_members WHERE email=?').get('gerente@alsea.test').role,'manager');
 assert.equal((await admin(env,'/xpacios',undefined,admin_)).body.brands.find(b=>b.brand_key==='alsea').members.length,1);
 db.prepare('UPDATE portal_superusers SET revoked_at=?').run(Date.now());assert.equal((await retail(env,'/me',undefined,sw.cookie)).status,401);
 assert.equal((await admin(env,'/xpacios',undefined,'')).status,401);
});

test('ficha de ciclo de vida: validación, PUT parcial, perímetro del titular y estado en el panel',async()=>{
 const {env}=setup(),a=await shop(env),b=await shop(env),url='/devices/'+a.device+'/lifecycle',today=isoDay(Date.now()),day=d=>isoDay(Date.now()+d*86400000);
 let r=await retail(env,url,undefined,a.cookie);assert.equal(r.status,200);assert.equal(r.body.lifecycle.recorded,false);assert.equal(r.body.lifecycle.category,'pantalla');assert.equal(r.body.lifecycle.warranty,'none');
 for(const bad of [{purchase_date:'2026-02-30'},{warranty_end:'30/09/2026'},{category:'nevera'},{status:'broken'},{status:null},{maintenance_interval_days:0},{maintenance_interval_days:1.5},{unknown:'x'},{},{serial:'x'.repeat(121)},{warranty_start:'2026-05-01',warranty_end:'2026-04-01'}])assert.equal((await retail(env,url,bad,a.cookie,'PUT')).status,400,JSON.stringify(bad));
 assert.equal((await retail(env,url,undefined,b.cookie)).status,404);assert.equal((await retail(env,url,{notes:'intruso'},b.cookie,'PUT')).status,404);assert.equal((await retail(env,url,{notes:'x'},undefined,'PUT')).status,401);
 r=await retail(env,url,{manufacturer:'LG',model:'55UH5J',serial:'SN-1',purchase_date:'2025-10-01',warranty_start:'2025-10-01',warranty_end:day(20),maintenance_interval_days:90,last_maintenance_at:day(-100)},a.cookie,'PUT');
 assert.equal(r.status,200);assert.equal(r.body.lifecycle.warranty,'expiring');assert.equal(r.body.lifecycle.warranty_days,20);assert.equal(r.body.lifecycle.maintenance_due,true);assert.equal(r.body.lifecycle.recorded,true);
 r=await retail(env,url,{notes:'Revisado por el técnico',manufacturer:''},a.cookie,'PUT');assert.equal(r.body.lifecycle.model,'55UH5J');assert.equal(r.body.lifecycle.manufacturer,null);assert.equal(r.body.lifecycle.notes,'Revisado por el técnico');
 const dash=(await retail(env,'/dashboard',undefined,a.cookie)).body;assert.equal(dash.devices[0].lifecycle.warranty,'expiring');assert.deepEqual([dash.stats.warranty_expiring,dash.stats.warranty_expired,dash.stats.maintenance_due],[1,0,1]);
 r=await retail(env,url,{status:'retired'},a.cookie,'PUT');assert.equal(r.body.lifecycle.retired_at,today);assert.equal(r.body.lifecycle.maintenance_due,false);
 assert.deepEqual([(await retail(env,'/dashboard',undefined,a.cookie)).body.stats.warranty_expiring],[0],'los retirados no cuentan');
 r=await retail(env,url,{status:'operational'},a.cookie,'PUT');assert.equal(r.body.lifecycle.retired_at,null);
 assert.equal((await retail(env,url,{retired_at:today},a.cookie,'PUT')).status,400);
 const inv=(await retail(env,'/inventory?warranty_within_days=30',undefined,a.cookie)).body;assert.equal(inv.devices.length,1);assert.equal((await retail(env,'/inventory?warranty_within_days=10',undefined,a.cookie)).body.devices.length,0);
 assert.equal((await retail(env,'/inventory?status=bogus',undefined,a.cookie)).status,400);assert.equal((await retail(env,'/inventory',undefined,b.cookie)).body.devices[0].lifecycle.recorded,false);
});

test('barrido diario de alertas: garantía 30/7/vencida y mantenimiento, sin duplicar, una vez al día',async()=>{
 const {env,db}=setup(),a=await shop(env),b=await shop(env),now=Date.now(),day=d=>isoDay(now+d*86400000);
 const second=(await retail(env,'/devices',{site_id:a.site,name:'Player',skill:'player'},a.cookie)).body.id;
 await retail(env,'/devices/'+a.device+'/lifecycle',{warranty_end:day(5),maintenance_interval_days:30,last_maintenance_at:day(-40)},a.cookie,'PUT');
 await retail(env,'/devices/'+second+'/lifecycle',{warranty_end:day(-3)},a.cookie,'PUT');
 await retail(env,'/devices/'+b.device+'/lifecycle',{warranty_end:day(25),status:'retired'},b.cookie,'PUT');
 assert.deepEqual(await sweepLifecycleAlerts(env,{now}),{created:4});
 assert.deepEqual(await sweepLifecycleAlerts(env,{now}),{skipped:true});assert.deepEqual(await sweepLifecycleAlerts(env,{now,force:true}),{created:0});
 const kinds=db.prepare('SELECT kind,due_on FROM device_lifecycle_alerts ORDER BY kind').all().map(x=>x.kind);assert.deepEqual(kinds,['maintenance_due','warranty_30','warranty_7','warranty_expired']);
 assert.equal(db.prepare("SELECT due_on FROM device_lifecycle_alerts WHERE kind='maintenance_due'").get().due_on,day(-10));
 assert.equal((await retail(env,'/alerts',undefined,a.cookie)).body.alerts.length,4);assert.equal((await retail(env,'/alerts',undefined,b.cookie)).body.alerts.length,0);
 assert.deepEqual(await sweepLifecycleAlerts(env,{now:now+86400000}),{created:0},'al día siguiente tampoco duplica');
});

async function mcp(env,token,name,args={}){
 const r=await handlePortalMcp(new Request('https://data.yokup.com/mcp/retailer',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:name?'tools/call':'tools/list',params:name?{name,arguments:args}:{}})}),env,'retailer');
 return (await r.json());
}
test('MCP: inventario, ficha, actualización idempotente y alertas con los permisos del titular',async()=>{
 const {env}=setup(),a=await shop(env),b=await shop(env);
 const full=(await retail(env,'/mcp-tokens',{label:'Agente inventario',scopes:['retailer:read','retailer:inventory'],expires_in_days:7},a.cookie)).body.token;
 const readOnly=(await retail(env,'/mcp-tokens',{label:'Solo lectura',scopes:['retailer:read'],expires_in_days:7},a.cookie)).body.token;
 const other=(await retail(env,'/mcp-tokens',{label:'Otro',scopes:['retailer:read','retailer:inventory'],expires_in_days:7},b.cookie)).body.token;
 assert.ok((await mcp(env,full)).result.tools.some(t=>t.name==='retailer_device_lifecycle_update'));assert.ok(!(await mcp(env,readOnly)).result.tools.some(t=>t.name==='retailer_device_lifecycle_update'));
 const update={device_id:a.device,warranty_end:isoDay(Date.now()+10*86400000),manufacturer:'Samsung',maintenance_interval_days:0,request_key:crypto.randomUUID()};
 let r=(await mcp(env,full,'retailer_device_lifecycle_update',update)).result;assert.equal(r.isError,false);assert.equal(r.structuredContent.lifecycle.manufacturer,'Samsung');assert.equal(r.structuredContent.lifecycle.maintenance_interval_days,null);
 assert.equal((await mcp(env,full,'retailer_device_lifecycle_update',update)).result.structuredContent.replayed,true);
 assert.equal((await mcp(env,full,'retailer_device_lifecycle_update',{...update,warranty_end:'2026/10/10',request_key:crypto.randomUUID()})).error.code,-32602);
 assert.equal((await mcp(env,readOnly,'retailer_device_lifecycle_update',{...update,request_key:crypto.randomUUID()})).error.code,-32602);
 assert.equal((await mcp(env,other,'retailer_device_lifecycle_update',{...update,request_key:crypto.randomUUID()})).result.structuredContent.http_status,404);
 r=(await mcp(env,readOnly,'retailer_device_lifecycle_get',{device_id:a.device})).result.structuredContent;assert.equal(r.lifecycle.warranty,'expiring');
 r=(await mcp(env,readOnly,'retailer_inventory_list',{warranty_within_days:15,maintenance_due:false})).result.structuredContent;assert.equal(r.devices.length,1);assert.equal(r.stats.warranty_expiring,1);
 assert.equal((await mcp(env,other,'retailer_inventory_list',{})).result.structuredContent.devices[0].id,b.device);
 await sweepLifecycleAlerts(env,{force:true});assert.equal((await mcp(env,readOnly,'retailer_alerts_list',{})).result.structuredContent.alerts[0].kind,'warranty_30');
 assert.equal((await mcp(env,other,'retailer_alerts_list',{limit:5})).result.structuredContent.alerts.length,0);
});
