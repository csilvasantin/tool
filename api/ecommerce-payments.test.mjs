import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setup,call,account} from './test-fixture.mjs';
import {handleRetailer} from './src/retailer-portal.js';
import {handleEcommerce} from './src/ecommerce.js';
import {startCheckout,handleStripeWebhook,paymentConfig,verifyStripeSignature} from './src/ecommerce-payments.js';

const origin='https://admira.shop';
async function fixture(){
 const {env,db}=setup();for(const file of ['0027_ecommerce.sql','0028_ecommerce_payments.sql'])db.exec(readFileSync(new URL('./migrations/'+file,import.meta.url),'utf8'));
 const api=async(path,body,cookie)=>{const r=await handleRetailer(new Request('https://data.admira.app/api/retailer'+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined}),env);return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const shop=await api('/register',{name:'Payment test',email:crypto.randomUUID()+'@example.test',password:'test-only-password'});
 const site=await api('/sites',{name:'Test site',kind:'other',country:'ES',city:'Barcelona',address:'Test only 123',latitude:41.3874,longitude:2.1686},shop.cookie);
 const device=await api('/devices',{site_id:site.body.id,name:'Test screen',skill:'screen'},shop.cookie);
 const tech=await call(env,'/register',account());
 const incident=await api('/incidents',{device_id:device.body.id,title:'Test incident',description:'This is a test fixture, not a real order.',request_key:crypto.randomUUID()},shop.cookie);
 await call(env,'/incidents/'+incident.body.id+'/accept',{},tech.cookie);
 const created=await api('/ecommerce/requests',{incident_id:incident.body.id,request_key:crypto.randomUUID(),reason:'Test fixture for a payment integration.',items:[{category:'screen',name:'Test screen',quantity:1}]},shop.cookie);
 assert.equal(created.status,201,JSON.stringify(created.body));
 const id=created.body.request.id;
 const quoted=await api('/ecommerce/requests/'+id,{action:'quote',version:1,request_key:crypto.randomUUID(),prices_cents:[10000],shipping_cents:500,tax_cents:2205,supplier:'Test supplier',quote_reference:'TEST-001'},shop.cookie);
 assert.equal(quoted.status,200);
 const approved=await api('/ecommerce/requests/'+id,{action:'approved',version:2,request_key:crypto.randomUUID()},shop.cookie);assert.equal(approved.status,200);
 const who={kind:'retailer',account:shop.body.profile,access:{role:'owner'}};
 const p=()=>({...db.prepare('SELECT * FROM ecommerce_requests WHERE id=?').get(id),incident_status:'assigned'});
 const verify=()=>db.prepare('UPDATE ecommerce_requests SET merchant_verified_by=?,merchant_verified_at=? WHERE id=?').run('verified-admin@example.test',Date.now(),id);
 Object.assign(env,{ECOMMERCE_PAYMENT_MODE:'live',STRIPE_SECRET_KEY:'sk_live_test_fixture_only',STRIPE_WEBHOOK_SECRET:'whsec_test_fixture_only'});
 let session,calls=[];
 env.STRIPE_FETCH=async(url,opts)=>{calls.push({url,opts});if(opts.method==='POST'){
  const form=new URLSearchParams(opts.body);session={object:'checkout.session',id:'cs_live_fixture',mode:'payment',status:'open',payment_status:'unpaid',currency:form.get('line_items[0][price_data][currency]'),amount_total:Number(form.get('line_items[0][price_data][unit_amount]')),client_reference_id:form.get('client_reference_id'),metadata:{app:form.get('metadata[app]'),payment_id:form.get('metadata[payment_id]'),request_id:form.get('metadata[request_id]')},livemode:true,url:'https://checkout.stripe.com/c/pay/test_fixture',payment_intent:'pi_fixture'};
 }return Response.json(session);};
 const event=(overrides={})=>({id:'evt_'+crypto.randomUUID().replaceAll('-',''),type:'checkout.session.completed',livemode:true,data:{object:{...session,status:'complete',payment_status:'paid'}},...overrides});
 const send=async e=>{const raw=JSON.stringify(e),t=Math.floor(Date.now()/1000),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']),signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(t+'.'+raw))).toString('hex');return handleStripeWebhook(new Request('https://data.admira.app/api/ecommerce/stripe/webhook',{method:'POST',body:raw,headers:{'Stripe-Signature':`t=${t},v1=${signature}`}}),env);};
 return {env,db,api,shop,who,p,id,verify,event,send,calls,get session(){return session;}};
}

test('live checkout uses the merchant-verified approved total, never submitted prices or redirect URLs',async()=>{
 const f=await fixture();f.verify();const p=f.p();
 const r=await startCheckout(f.env,p,f.who,{version:p.version,amount:1,total_cents:1,return_url:'https://evil.test'},origin);
 assert.equal(r.url,'https://checkout.stripe.com/c/pay/test_fixture');assert.equal(r.mode,'live');
 const form=new URLSearchParams(f.calls[0].opts.body);assert.equal(form.get('line_items[0][price_data][unit_amount]'),'12705');assert.equal(form.get('success_url'),origin+'/ecommerce?role=retailer&request='+f.id+'&payment=return');assert.equal(form.get('payment_method_types[0]'),'card');assert.equal(form.get('customer_email'),null);
 assert.equal(f.p().status,'approved');assert.equal(f.p().payment_status,'unpaid');
});
test('buyer-entered quote, wrong role, closed incident, stale version and foreign return origin cannot charge',async()=>{
 const f=await fixture(),p=f.p();
 await assert.rejects(startCheckout(f.env,p,f.who,{version:p.version},origin),/verificar/);f.verify();
 for(const role of ['viewer','installer'])await assert.rejects(startCheckout(f.env,f.p(),{...f.who,kind:role==='installer'?'installer':'retailer',access:{role}},{version:p.version},origin),/Solo/);
 await assert.rejects(startCheckout(f.env,{...f.p(),incident_status:'resolved'},f.who,{version:p.version},origin),/incidencia/);
 await assert.rejects(startCheckout(f.env,f.p(),f.who,{version:1},origin),/Actualiza/);
 await assert.rejects(startCheckout(f.env,f.p(),f.who,{version:p.version},'https://evil.test'),/tienda/);
 assert.equal(f.calls.length,0);
});
test('only trusted Admira superuser provenance can verify the quote',async()=>{
 const f=await fixture(),path='/ecommerce/requests/'+f.id;
 const request=()=>new Request('https://data.admira.app/api/retailer'+path,{method:'POST',body:JSON.stringify({action:'verify_quote',version:f.p().version,request_key:crypto.randomUUID()}),headers:{'Content-Type':'application/json'}});
 await assert.rejects(handleEcommerce(request(),f.env,f.who,path),/superusuario/);
 await assert.rejects(handleEcommerce(request(),f.env,{...f.who,access:{role:'superuser',actor_kind:'member'}},path),/superusuario/);
 const r=await handleEcommerce(request(),f.env,{...f.who,access:{role:'superuser',actor_kind:'superuser',actor_email:'verified@example.test'}},path);assert.equal(r.status,200);assert.equal(f.p().merchant_verified_by,'verified@example.test');
});
test('concurrent clicks and network retry reuse one persisted payment and identical Stripe idempotency key',async()=>{
 const f=await fixture();f.verify();const p=f.p(),original=f.env.STRIPE_FETCH;let first=true;
 f.env.STRIPE_FETCH=async(...args)=>{if(first){first=false;await original(...args);throw Error('response lost');}return original(...args);};
 await assert.rejects(startCheckout(f.env,p,f.who,{version:p.version},origin),/misma operación/);
 await startCheckout(f.env,p,f.who,{version:p.version},origin);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM ecommerce_payments').get().n,1);
 assert.equal(f.calls[0].opts.headers['Idempotency-Key'],f.calls[1].opts.headers['Idempotency-Key']);assert.equal(f.calls[0].opts.body,f.calls[1].opts.body);
 await startCheckout(f.env,p,f.who,{version:p.version},origin);assert.equal(f.calls.at(-1).opts.method,'GET');
});
test('pending payment locks cancellation and ordering; valid signed event marks paid once without ordering or closing repair',async()=>{
 const f=await fixture();f.verify();await startCheckout(f.env,f.p(),f.who,{version:f.p().version},origin);
 for(const action of ['ordered','cancelled']){const r=await f.api('/ecommerce/requests/'+f.id,{action,version:f.p().version,request_key:crypto.randomUUID(),order_reference:'TEST',note:'A sufficiently long note'},f.shop.cookie);assert.equal(r.status,409);}
 const e=f.event();assert.equal((await f.send(e)).status,200);assert.equal((await f.send(e)).status,200);assert.equal((await f.send(f.event())).status,200);
 assert.equal(f.p().payment_status,'paid');assert.equal(f.p().status,'approved');assert.equal(f.db.prepare("SELECT COUNT(*) n FROM ecommerce_events WHERE action='payment_paid'").get().n,1);assert.equal(f.db.prepare('SELECT status FROM installer_incidents WHERE id=?').get(f.p().incident_id).status,'assigned');
 await assert.rejects(startCheckout(f.env,f.p(),f.who,{version:f.p().version},origin),/ya está pagado/);
 const cancel=await f.api('/ecommerce/requests/'+f.id,{action:'cancelled',version:f.p().version,request_key:crypto.randomUUID(),note:'Cancel paid order'},f.shop.cookie);assert.equal(cancel.status,409);
 const order=await f.api('/ecommerce/requests/'+f.id,{action:'ordered',version:f.p().version,request_key:crypto.randomUUID(),order_reference:'SUPPLIER-TEST'},f.shop.cookie);assert.equal(order.status,200);
});
test('unsigned, stale, tampered, wrong amount, wrong mode and wrong session events never mark paid',async()=>{
 const f=await fixture();f.verify();await startCheckout(f.env,f.p(),f.who,{version:f.p().version},origin);
 const unsigned=await handleStripeWebhook(new Request('https://data.admira.app/api/ecommerce/stripe/webhook',{method:'POST',body:JSON.stringify(f.event())}),f.env);assert.equal(unsigned.status,400);
 assert.equal(await verifyStripeSignature('{}','t=1,v1='+'a'.repeat(64),'secret'),false);
 for(const overrides of [{amount_total:1},{livemode:false},{id:'cs_other'},{currency:'usd'}]){const e=f.event();Object.assign(e.data.object,overrides);assert.equal((await f.send(e)).status,400);}
 const unpaid=f.event();unpaid.data.object.payment_status='unpaid';assert.equal((await f.send(unpaid)).status,200);assert.equal(f.p().payment_status,'unpaid');
});
test('late expiry cannot downgrade a paid order; expired session can be replaced only after provider confirmation',async()=>{
 const f=await fixture();f.verify();await startCheckout(f.env,f.p(),f.who,{version:f.p().version},origin);
 await f.send(f.event());const expired=f.event({type:'checkout.session.expired'});expired.data.object.payment_status='unpaid';expired.data.object.status='expired';assert.equal((await f.send(expired)).status,200);assert.equal(f.p().payment_status,'paid');
 const g=await fixture();g.verify();await startCheckout(g.env,g.p(),g.who,{version:g.p().version},origin);g.session.status='expired';
 const original=g.env.STRIPE_FETCH;g.env.STRIPE_FETCH=async(u,o)=>{const r=await original(u,o);if(o.method==='POST'){const s=await r.json();s.id='cs_live_replacement';return Response.json(s);}return r;};
 await startCheckout(g.env,g.p(),g.who,{version:g.p().version},origin);assert.equal(g.db.prepare('SELECT COUNT(*) n FROM ecommerce_payments').get().n,2);
});
test('configuration fails closed and test/live keys cannot be mixed',()=>{
 assert.equal(paymentConfig({}).enabled,false);assert.equal(paymentConfig({ECOMMERCE_PAYMENT_MODE:'live',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture'}).enabled,false);
 assert.equal(paymentConfig({ECOMMERCE_PAYMENT_MODE:'live',STRIPE_SECRET_KEY:'sk_live_fixture'}).enabled,false);
});
test('simultaneous checkout requests share one active payment and one idempotent payload',async()=>{
 const f=await fixture();f.verify();const p=f.p();
 const results=await Promise.all([startCheckout(f.env,p,f.who,{version:p.version},origin),startCheckout(f.env,p,f.who,{version:p.version},origin)]);
 assert.equal(results[0].url,results[1].url);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM ecommerce_payments').get().n,1);
 const posts=f.calls.filter(c=>c.opts.method==='POST');assert.equal(new Set(posts.map(c=>c.opts.headers['Idempotency-Key'])).size,1);assert.equal(new Set(posts.map(c=>c.opts.body)).size,1);
});
test('test-mode payment is labelled in audit and cannot authorize a supplier order',async()=>{
 const f=await fixture();f.verify();f.env.ECOMMERCE_PAYMENT_MODE='test';f.env.STRIPE_SECRET_KEY='sk_test_fixture_only';
 const original=f.env.STRIPE_FETCH;f.env.STRIPE_FETCH=async(u,o)=>{const r=await original(u,o);const s=await r.json();s.livemode=false;return Response.json(s);};
 await startCheckout(f.env,f.p(),f.who,{version:f.p().version},origin);
 const e=f.event({livemode:false});e.data.object.livemode=false;assert.equal((await f.send(e)).status,200);
 assert.match(f.db.prepare("SELECT note FROM ecommerce_events WHERE action='payment_paid'").get().note,/prueba/);
 const order=await f.api('/ecommerce/requests/'+f.id,{action:'ordered',version:f.p().version,request_key:crypto.randomUUID(),order_reference:'MUST-NOT-ORDER'},f.shop.cookie);assert.equal(order.status,409);
});
