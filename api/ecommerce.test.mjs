import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setup,call,account} from './test-fixture.mjs';
import {handleRetailer} from './src/retailer-portal.js';
import {handleInstaller} from './src/installer-portal.js';
import {materialLine} from '../yokup-site/ecommerce-catalogue-model.mjs';

async function api(env,kind,path,body,cookie,origin='https://www.admira.app',principal){
 const req=new Request('https://data.admira.app/api/'+kind+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
 const r=await (kind==='retailer'?handleRetailer:handleInstaller)(req,env,principal);
 return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
async function fixture(){
 const {env,db}=setup();for(const file of ['0027_ecommerce.sql','0028_ecommerce_payments.sql'])db.exec(readFileSync(new URL('./migrations/'+file,import.meta.url),'utf8'));
 const shop=await api(env,'retailer','/register',{name:'Comercio de prueba',email:crypto.randomUUID()+'@example.test',password:'retailer-test-password'});
 const site=await api(env,'retailer','/sites',{name:'Local de prueba',kind:'other',country:'ES',city:'Barcelona',address:'Dirección de prueba 123',latitude:41.3874,longitude:2.1686},shop.cookie);
 const device=await api(env,'retailer','/devices',{site_id:site.body.id,name:'Pantalla del local',skill:'screen'},shop.cookie);
 const tech=await call(env,'/register',account());
 const other=await call(env,'/register',account());
 const incident=await api(env,'retailer','/incidents',{device_id:device.body.id,title:'Pantalla averiada',description:'La pantalla presenta una avería que necesita un repuesto.',priority:'urgent',request_key:crypto.randomUUID()},shop.cookie);
 await call(env,'/incidents/'+incident.body.id+'/accept',{},tech.cookie);
 const body={incident_id:incident.body.id,request_key:crypto.randomUUID(),reason:'La pantalla no enciende y requiere sustitución.',priority:'urgent',items:[{category:'screen',name:'Pantalla profesional',specification:'55 pulgadas, VESA 400',quantity:2}]};
 const create=()=>api(env,'installer','/ecommerce/requests',body,tech.cookie);
 return {env,db,shop,site,device,tech,other,incident,body,create};
}
const mutate=(f,p,action,extra={},kind='retailer',cookie=f.shop.cookie)=>api(f.env,kind,'/ecommerce/requests/'+p.id,{action,version:p.version,request_key:crypto.randomUUID(),...extra},cookie);
async function quote(f,p){return mutate(f,p,'quote',{prices_cents:[12345],shipping_cents:500,tax_cents:5290,supplier:'Proveedor de prueba',quote_reference:'TEST-QUOTE',quote_url:'https://example.test/quote'});}

test('an imported Elipsys reference survives creation and retrieval with no assumed price',async()=>{
 const f=await fixture(),data=JSON.parse(readFileSync(new URL('../yokup-site/ecommerce-elipsys.json',import.meta.url),'utf8'));
 const product=data.products.find(p=>p.sku==='QM55C'),line=materialLine(product,2);
 const created=await api(f.env,'installer','/ecommerce/requests',{...f.body,items:[line]},f.tech.cookie);
 assert.equal(created.status,201,JSON.stringify(created.body));
 const fetched=await api(f.env,'retailer','/ecommerce/requests/'+created.body.request.id,undefined,f.shop.cookie);
 const item=fetched.body.request.items[0];assert.equal(item.category,'screen');assert.equal(item.quantity,2);assert.equal(item.name,line.name);assert.equal(item.specification,line.specification);
 assert.match(item.specification,/SKU: QM55C/);assert.match(item.specification,/https:\/\/clientes\.elipsys\.es\/\?s=QM55C/);assert.equal(item.unit_price_cents,null);assert.equal(fetched.body.request.total_cents,null);
});

test('assigned technician creates one durable request tied to the server-owned incident and site',async()=>{
 const f=await fixture(),r=await f.create();assert.equal(r.status,201,JSON.stringify(r.body));
 assert.equal(r.body.request.site_id,f.site.body.id);assert.equal(r.body.request.total_cents,null);assert.equal(r.body.request.status,'requested');
 assert.equal(r.body.request.items[0].unit_price_cents,null);assert.equal(r.body.events.length,1);
 assert.equal((await f.create()).body.request.id,r.body.request.id);
 assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM ecommerce_requests').get().n,1);
 const conflict=await api(f.env,'installer','/ecommerce/requests',{...f.body,reason:'Una justificación diferente para la misma operación.'},f.tech.cookie);assert.equal(conflict.status,409);
 assert.equal(f.db.prepare('SELECT status FROM installer_incidents WHERE id=?').get(f.incident.body.id).status,'assigned');
});
test('complete lifecycle persists quote, approved amount, order and audit without closing repair',async()=>{
 const f=await fixture();let r=await f.create(),p=r.body.request;
 assert.equal((await mutate(f,p,'approved')).status,400);
 r=await quote(f,p);assert.equal(r.status,200,JSON.stringify(r.body));p=r.body.request;assert.equal(p.total_cents,30480);
 r=await mutate(f,p,'approved');assert.equal(r.status,200);p=r.body.request;assert.equal(p.approved_total_cents,30480);
 assert.equal((await quote(f,p)).status,409);
 assert.equal((await mutate(f,p,'ordered')).status,400);
 r=await mutate(f,p,'ordered',{order_reference:'TEST-ORDER',tracking_url:'https://example.test/tracking'});assert.equal(r.status,200);p=r.body.request;
 r=await mutate(f,p,'received',{note:'Recibidos los dos equipos, embalaje revisado.'},'installer',f.tech.cookie);assert.equal(r.status,200);p=r.body.request;
 r=await mutate(f,p,'installed',{note:'Montaje y encendido comprobados en el local.'},'installer',f.tech.cookie);assert.equal(r.status,200);
 assert.deepEqual(r.body.events.map(e=>e.action),['requested','quote','approved','ordered','received','installed']);
 assert.equal(f.db.prepare('SELECT status FROM installer_incidents WHERE id=?').get(f.incident.body.id).status,'assigned');
});
test('unauthenticated, other technicians and other merchants cannot read or mutate requests',async()=>{
 const f=await fixture(),r=await f.create(),p=r.body.request;
 assert.equal((await api(f.env,'installer','/ecommerce/catalog')).status,401);
 assert.equal((await api(f.env,'installer','/ecommerce/requests/'+p.id,undefined,f.other.cookie)).status,404);
 assert.equal((await api(f.env,'installer','/ecommerce/context?incident='+f.incident.body.id,undefined,f.other.cookie)).status,404);
 assert.equal((await api(f.env,'installer','/ecommerce/requests',f.body,f.other.cookie)).status,404);
 const outsider=await api(f.env,'retailer','/register',{name:'Otra cuenta',email:crypto.randomUUID()+'@example.test',password:'another-retailer-password'});
 assert.equal((await api(f.env,'retailer','/ecommerce/requests/'+p.id,undefined,outsider.cookie)).status,404);
 assert.equal((await api(f.env,'retailer','/ecommerce/requests',undefined,outsider.cookie)).body.requests.length,0);
 assert.equal((await api(f.env,'retailer','/ecommerce/requests',f.body,outsider.cookie)).status,404);
 assert.equal((await mutate(f,p,'approved',{},'installer',f.tech.cookie)).status,403);
});
test('CSRF origin and delegated viewer cannot write, role comes from server session',async()=>{
 const f=await fixture(),r=await f.create(),p=r.body.request;
 assert.equal((await api(f.env,'installer','/ecommerce/requests',f.body,f.tech.cookie,'https://evil.test')).status,403);
 const viewer={...f.shop.body.profile,access:{delegated:true,role:'viewer',actor_email:'viewer@example.test'}};
 assert.equal((await api(f.env,'retailer','/ecommerce/requests/'+p.id,undefined,undefined,undefined,viewer)).status,200);
 assert.equal((await api(f.env,'retailer','/ecommerce/requests/'+p.id,{action:'approved',version:1,request_key:crypto.randomUUID()},undefined,undefined,viewer)).status,403);
});
test('stale version rejected and exact action retry has one audit event',async()=>{
 const f=await fixture(),r=await f.create(),p=r.body.request;
 const b={action:'quote',version:1,request_key:crypto.randomUUID(),prices_cents:[10000],supplier:'Supplier Test',quote_reference:'REF-1'};
 const first=await api(f.env,'retailer','/ecommerce/requests/'+p.id,b,f.shop.cookie);assert.equal(first.status,200);
 const retry=await api(f.env,'retailer','/ecommerce/requests/'+p.id,b,f.shop.cookie);assert.equal(retry.status,200);assert.equal(retry.body.events.length,2);
 assert.equal((await mutate(f,p,'approved')).status,409);
 assert.equal((await api(f.env,'retailer','/ecommerce/requests/'+p.id,{...b,prices_cents:[1]},f.shop.cookie)).status,409);
});
test('quantities, categories, money and URL fields are bounded and prices cannot be injected on creation',async()=>{
 const f=await fixture();
 for(const quantity of [0,-1,1.5,101,'2'])assert.equal((await api(f.env,'installer','/ecommerce/requests',{...f.body,items:[{...f.body.items[0],quantity}]},f.tech.cookie)).status,400);
 assert.equal((await api(f.env,'installer','/ecommerce/requests',{...f.body,items:[{...f.body.items[0],category:'invented'}]},f.tech.cookie)).status,400);
 const r=await api(f.env,'installer','/ecommerce/requests',{...f.body,total_cents:1,retailer_id:'spoof',items:[{...f.body.items[0],unit_price_cents:1}]},f.tech.cookie);assert.equal(r.status,201);assert.equal(r.body.request.total_cents,null);assert.equal(r.body.request.retailer_id,f.shop.body.profile.id);
 const bad={prices_cents:[100],supplier:'Supplier',quote_reference:'QUOTE',quote_url:'javascript:alert(1)'};
 assert.equal((await mutate(f,r.body.request,'quote',bad)).status,400);
 assert.equal((await mutate(f,r.body.request,'quote',{...bad,quote_url:'https://user:password@example.test'})).status,400);
 assert.equal((await mutate(f,r.body.request,'quote',{...bad,quote_url:'',prices_cents:[-1]})).status,400);
});
test('closed incidents reject new requests and approval; technician reassignment revokes access',async()=>{
 const f=await fixture(),r=await f.create();let p=(await quote(f,r.body.request)).body.request;
 f.db.prepare("UPDATE installer_incidents SET status='resolved' WHERE id=?").run(f.incident.body.id);
 assert.equal((await api(f.env,'installer','/ecommerce/requests',{...f.body,request_key:crypto.randomUUID()},f.tech.cookie)).status,409);
 assert.equal((await mutate(f,p,'approved')).status,409);
 f.db.prepare('UPDATE installer_incidents SET installer_id=? WHERE id=?').run(f.other.body.profile.id,f.incident.body.id);
 assert.equal((await api(f.env,'installer','/ecommerce/requests/'+p.id,undefined,f.tech.cookie)).status,404);
});
test('cancellation and rejection require a reason; received cannot bypass a purchase order',async()=>{
 const f=await fixture(),r=await f.create(),p=r.body.request;
 assert.equal((await mutate(f,p,'received',{note:'Material recibido'},'installer',f.tech.cookie)).status,409);
 assert.equal((await mutate(f,p,'cancelled',{},'installer',f.tech.cookie)).status,400);
 assert.equal((await mutate(f,p,'cancelled',{note:'Ya existe repuesto disponible en almacén.'},'installer',f.tech.cookie)).status,200);
 assert.equal((await mutate(f,{...p,version:2},'approved')).status,409);
});
