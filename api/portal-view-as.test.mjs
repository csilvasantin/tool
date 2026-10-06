// «Abrir como instalador» / «Abrir como retailer» para superusuarios (06-10-2026).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup,call,account} from './test-fixture.mjs';
import {handleAdmin} from './src/portal-admin.js';
import {handleRetailer} from './src/retailer-portal.js';
import {hash} from './src/installer-portal.js';
const ORIGIN='https://www.admira.app';
async function admin(env,path,body,cookie){
 const r=await handleAdmin(new Request('https://data.admira.app/api/portal-admin'+path,{method:body?'POST':'GET',headers:{Origin:ORIGIN,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined}),env);
 return {status:r.status,body:await r.json(),setCookie:r.headers.get('set-cookie')||''};
}
async function retail(env,path,body,cookie){
 const r=await handleRetailer(new Request('https://data.admira.app/api/retailer'+path,{method:body?'POST':'GET',headers:{Origin:ORIGIN,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined}),env);
 return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
async function superuserCookie(db){const token='cd'.repeat(32);db.prepare('INSERT INTO portal_admin_sessions VALUES(?,?,?,?)').run(await hash(token),'csilva@admira.com','google-sub-admin',Date.now()+3600000);return '__Host-yk_portal_admin='+token;}
const asCookie=set=>set.split(';')[0];
const join=(...c)=>c.filter(Boolean).join('; ');

test('superusuario abre el portal del instalador: misma cuenta, auditado, sin tokens ni push; salir no toca la sesión del técnico',async()=>{
 const {env,db}=setup(),su=await superuserCookie(db);
 const a=await call(env,'/register',account({name:'Técnico A'})),b=await call(env,'/register',account({name:'Técnico B'}));
 assert.equal(a.status,201);assert.equal(b.status,201);
 const list=await admin(env,'/view-as',undefined,su);assert.equal(list.status,200);
 assert.deepEqual(list.body.installers.map(x=>x.name).sort(),['Técnico A','Técnico B']);assert.equal(list.body.installer_as,null);
 const open=await admin(env,'/view-as',{kind:'installer',installer_id:a.body.profile.id},su);assert.equal(open.status,200);
 assert.match(open.setCookie,/^__Host-yk_installer_as=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600$/);
 const as=asCookie(open.setCookie);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM portal_role_audit WHERE action=? AND actor='csilva@admira.com'").get('view-as:installer:'+a.body.profile.id).n,1);
 const me=await call(env,'/me',undefined,join(su,as));assert.equal(me.status,200);
 assert.equal(me.body.profile.id,a.body.profile.id);assert.deepEqual(me.body.access,{role:'superuser',delegated:true,actor_email:'csilva@admira.com'});
 assert.equal(me.body.profile.password_hash,undefined);
 assert.equal((await call(env,'/inbox',undefined,join(su,as))).status,200);
 assert.equal((await admin(env,'/view-as',undefined,join(su,as))).body.installer_as,a.body.profile.id);
 assert.equal((await call(env,'/mcp-tokens',undefined,join(su,as))).status,403);
 assert.equal((await call(env,'/push/subscribe',{endpoint:'https://fcm.googleapis.com/fcm/send/x'},join(su,as))).status,403);
 // La vista manda sobre la sesión propia del superusuario si también es instalador; sin superusuario, la cookie no vale nada.
 assert.equal((await call(env,'/me',undefined,join(su,as,b.cookie))).body.profile.id,a.body.profile.id);
 assert.equal((await call(env,'/me',undefined,as)).status,401);
 assert.equal((await call(env,'/me',undefined,join(as,b.cookie))).body.profile.id,b.body.profile.id);
 assert.equal((await call(env,'/me',undefined,join(as,b.cookie))).body.access.delegated,false);
 // Salir de la vista borra solo la cookie de vista.
 const out=await call(env,'/logout',{},join(su,as,a.cookie));assert.equal(out.status,200);assert.equal(out.headers.get('set-cookie'),'__Host-yk_installer_as=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
 assert.equal((await call(env,'/me',undefined,a.cookie)).body.profile.id,a.body.profile.id,'la sesión propia del técnico sigue viva');
 const close=await admin(env,'/view-as',{kind:'installer',installer_id:null},su);assert.equal(close.status,200);assert.match(close.setCookie,/Max-Age=0$/);
 // Revocar al superusuario corta la vista en el acto.
 db.prepare("UPDATE portal_superusers SET revoked_at=?").run(Date.now());
 assert.equal((await call(env,'/me',undefined,join(su,as))).status,401);
});

test('view-as: solo superusuarios, instalador existente y kind installer',async()=>{
 const {env,db}=setup(),su=await superuserCookie(db),a=await call(env,'/register',account());
 assert.equal((await admin(env,'/view-as')).status,401);
 assert.equal((await admin(env,'/view-as',{kind:'installer',installer_id:a.body.profile.id},a.cookie)).status,401,'un instalador no se abre a sí mismo ni a otros');
 assert.equal((await admin(env,'/view-as',{kind:'installer',installer_id:'no-existe'},su)).status,404);
 assert.equal((await admin(env,'/view-as',{kind:'installer',installer_id:'x; Path=/'},su)).status,400);
 assert.equal((await admin(env,'/view-as',{kind:'retailer',retailer_id:'x'},su)).status,400);
 // Cookie de vista manipulada (id inexistente o con caracteres raros): se ignora.
 assert.equal((await call(env,'/me',undefined,join(su,'__Host-yk_installer_as=no-existe'))).status,401);
 assert.equal((await call(env,'/me',undefined,join(su,'__Host-yk_installer_as=%E0%A4%A',a.cookie))).body.profile.id,a.body.profile.id);
});

test('abrir como retailer: el superusuario elige la marca (365) y entra en su inventario ITIL e incidencias; los comercios normales siguen fuera',async()=>{
 const {env,db}=setup(),su=await superuserCookie(db);
 const brand='f84d3667-e977-44ab-aae9-d7f8015fba7a';
 db.prepare('INSERT INTO retailer_accounts VALUES(?,?,?,?,?,?)').run(brand,'365@marcas.yokup.com','365','!brand','x',Date.now());
 db.prepare('INSERT INTO brand_accounts VALUES(?,?,?,?)').run('365',brand,'365',Date.now());
 const shop=await retail(env,'/register',{name:'Comercio normal',email:crypto.randomUUID()+'@example.test',password:'retailer-test-password'});
 const list=await admin(env,'/view-as',undefined,su);assert.deepEqual(list.body.retailers.map(r=>[r.name,r.brand_key]),[['365','365']]);
 const dash=await admin(env,'/dashboard',undefined,su);
 assert.equal(dash.body.retailers.find(r=>r.id===brand).brand_key,'365');assert.equal(dash.body.retailers.find(r=>r.id===shop.body.profile.id).brand_key,null);
 const accounts=await retail(env,'/accounts',undefined,su);assert.equal(accounts.body.superuser,true);assert.ok(accounts.body.accounts.some(a=>a.id===brand));
 assert.equal((await retail(env,'/switch',{retailer_id:shop.body.profile.id},su)).status,403,'no suplanta comercios normales');
 const sw=await retail(env,'/switch',{retailer_id:brand},su);assert.equal(sw.status,200);
 const me=await retail(env,'/me',undefined,sw.cookie);assert.equal(me.body.profile.id,brand);assert.equal(me.body.access.can_edit,true);assert.equal(me.body.access.actor_email,'csilva@admira.com');
 const site=await retail(env,'/sites',{name:'365 Tetuán',kind:'hospitality',country:'ES',city:'Barcelona',address:'Plaça Tetuan 1',latitude:41.39,longitude:2.17},sw.cookie);assert.equal(site.status,201);
 assert.equal((await retail(env,'/devices',{site_id:site.body.id,name:'Pantalla menú',skill:'screen'},sw.cookie)).status,201);
 assert.equal((await retail(env,'/itil',undefined,sw.cookie)).status,200);
 const dashboard=await retail(env,'/dashboard',undefined,sw.cookie);assert.equal(dashboard.body.devices.length,1);
 const inc=await retail(env,'/incidents',{device_id:dashboard.body.devices[0].id,title:'Pantalla sin señal',description:'La pantalla del menú no enciende desde esta mañana.',request_key:'demo-365-0001'},sw.cookie);assert.equal(inc.status,201);
 // El comercio normal sigue viendo solo lo suyo.
 assert.equal((await retail(env,'/dashboard',undefined,shop.cookie)).body.devices.length,0);
 assert.deepEqual((await retail(env,'/accounts',undefined,shop.cookie)).body.accounts.map(a=>a.id),[shop.body.profile.id]);
});
