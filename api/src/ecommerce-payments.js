import {statement,fail} from './installer-portal.js';

const ORIGINS=new Set(['https://admira.app','https://www.admira.app','https://admira.shop','https://www.admira.shop']);
const ACTIVE="('creating','pending','paid')";
const encoder=new TextEncoder();
export function paymentConfig(env){
 const mode=env.ECOMMERCE_PAYMENT_MODE;
 const ready=['live','test'].includes(mode)&&new RegExp('^(sk|rk)_'+mode+'_').test(env.STRIPE_SECRET_KEY||'')&&String(env.STRIPE_WEBHOOK_SECRET||'').startsWith('whsec_');
 return {enabled:ready,mode:ready?mode:null,provider:'stripe'};
}
export function merchant(who){return who.kind==='retailer'&&who.access?.role==='superuser'&&who.access?.actor_kind==='superuser';}
export async function activePayment(env,id){return statement(env,`SELECT * FROM ecommerce_payments WHERE request_id=? AND status IN ${ACTIVE}`,id).first();}
async function stripe(env,path,body,idempotency){
 const headers={Authorization:'Bearer '+env.STRIPE_SECRET_KEY};
 if(body)headers['Content-Type']='application/x-www-form-urlencoded';
 if(idempotency)headers['Idempotency-Key']=idempotency;
 let r;try{r=await (env.STRIPE_FETCH||fetch)('https://api.stripe.com/v1/'+path,{method:body?'POST':'GET',headers,body:body?.toString(),signal:AbortSignal.timeout(15000)});}catch{fail(503,'No se pudo confirmar la conexión con Stripe. Reintenta: conservamos la misma operación de pago.');}
 const result=await r.json().catch(()=>null);
 if(!r.ok||!result)fail(502,'Stripe no pudo confirmar esta operación. Reintenta o contacta con Admira; no generes otro pago.');
 return result;
}
function validSession(session,p){
 return session?.object==='checkout.session'&&session.mode==='payment'&&session.client_reference_id===p.request_id&&session.metadata?.app==='admira-ecommerce'&&session.metadata?.payment_id===p.id&&session.metadata?.request_id===p.request_id&&session.currency===p.currency&&session.amount_total===p.amount_cents&&session.livemode===(p.mode==='live');
}
function checkoutUrl(value){try{const u=new URL(value);if(u.origin==='https://checkout.stripe.com'&&!u.username&&!u.password)return u.href;}catch{}fail(502,'Stripe no ha devuelto una página de pago válida.');}
function result(p){return {status:p.status,url:p.checkout_url,mode:p.mode};}

export async function startCheckout(env,p,who,body,origin){
 const config=paymentConfig(env);
 if(!config.enabled)fail(503,'Los pagos están pendientes de activación.');
 if(who.kind!=='retailer'||!['owner','manager','superuser'].includes(who.access?.role||'owner'))fail(403,'Solo el titular o administrador puede pagar.');
 if(!ORIGINS.has(origin))fail(403,'Abre el pago desde la tienda Admira.');
 if(p.status!=='approved'||p.incident_status==='resolved')fail(409,'El presupuesto debe estar aprobado y la incidencia abierta.');
 if(!p.merchant_verified_by||!p.merchant_verified_at)fail(409,'Admira debe verificar el presupuesto antes del cobro.');
 if(p.total_cents!==p.approved_total_cents||!Number.isSafeInteger(p.total_cents)||p.total_cents<50||p.total_cents>99999999)fail(409,'El importe aprobado no es válido para el pago.');
 let payment=await activePayment(env,p.id);
 if(payment?.mode&&payment.mode!==config.mode)fail(409,'Existe una operación de pago de otro entorno. Debe revisarla Admira.');
 if(payment?.status==='paid')fail(409,'Este presupuesto ya está pagado.');
 if(payment?.status==='pending'){
  const session=await stripe(env,'checkout/sessions/'+encodeURIComponent(payment.session_id));
  if(!validSession(session,payment)||session.id!==payment.session_id)fail(502,'La sesión de pago no coincide con el presupuesto.');
  if(session.status!=='expired'){
   if(session.status==='complete')return {status:'processing',url:null,mode:payment.mode};
   return {...result(payment),url:checkoutUrl(session.url)};
  }
  await expirePayment(env,payment,'expired');payment=null;
  // The old session is confirmed expired by Stripe before a new one is possible.
  p=await statement(env,'SELECT p.*,i.status AS incident_status FROM ecommerce_requests p JOIN installer_incidents i ON i.id=p.incident_id WHERE p.id=?',p.id).first();
 }
 if(!payment){
  if(!body||!Number.isSafeInteger(body.version)||body.version!==p.version)fail(409,'Actualiza la solicitud antes de iniciar el pago.');
  const now=Date.now(),id=crypto.randomUUID();
  const created=await statement(env,`INSERT OR IGNORE INTO ecommerce_payments(id,request_id,amount_cents,currency,mode,status,return_origin,description,created_at,expires_at)
   SELECT ?,id,total_cents,'eur',?,'creating',?,?,?,? FROM ecommerce_requests WHERE id=? AND version=? AND status='approved' AND total_cents=approved_total_cents AND merchant_verified_by IS NOT NULL AND EXISTS(SELECT 1 FROM installer_incidents i WHERE i.id=incident_id AND i.status!='resolved')`,id,config.mode,origin,'Presupuesto '+p.quote_reference,now,Math.floor(now/1000)+3600,p.id,p.version).run();
  payment=await activePayment(env,p.id);
  if(!payment)fail(409,'El presupuesto ha cambiado. Actualiza la solicitud.');
  if(!created.meta.changes&&payment.status!=='creating')return startCheckout(env,p,who,body,origin);
 }
 // Keep the same ID and parameters after a timeout, including across browser tabs.
 // Never create another session after Stripe's idempotency retention window.
 if(Date.now()-payment.created_at>23*3600000)fail(409,'Esta operación necesita conciliación de Admira antes de reintentar.');
 const back=payment.return_origin+'/ecommerce?role=retailer&request='+encodeURIComponent(p.id);
 const form=new URLSearchParams({mode:'payment',client_reference_id:p.id,success_url:back+'&payment=return',cancel_url:back+'&payment=cancelled',expires_at:String(payment.expires_at),'payment_method_types[0]':'card','metadata[app]':'admira-ecommerce','metadata[payment_id]':payment.id,'metadata[request_id]':p.id,'payment_intent_data[metadata][request_id]':p.id,'line_items[0][quantity]':'1','line_items[0][price_data][currency]':payment.currency,'line_items[0][price_data][unit_amount]':String(payment.amount_cents),'line_items[0][price_data][product_data][name]':payment.description,'line_items[0][price_data][product_data][description]':'Total aprobado, impuestos y transporte incluidos.'});
 const session=await stripe(env,'checkout/sessions',form,'admira-ecommerce-'+payment.id);
 if(!validSession(session,payment)||typeof session.id!=='string')fail(502,'Stripe ha devuelto un importe o una sesión que no coincide.');
 const url=session.status==='open'?checkoutUrl(session.url):null;
 await statement(env,"UPDATE ecommerce_payments SET session_id=?,checkout_url=?,status=CASE WHEN status='creating' THEN 'pending' ELSE status END WHERE id=? AND (session_id IS NULL OR session_id=?)",session.id,url,payment.id,session.id).run();
 const current=await statement(env,'SELECT * FROM ecommerce_payments WHERE id=?',payment.id).first();
 return {status:current.status==='paid'?'paid':url?'pending':'processing',url:current.status==='paid'?null:url,mode:payment.mode};
}

async function expirePayment(env,p,status){
 await statement(env,"UPDATE ecommerce_payments SET status=?,checkout_url=NULL WHERE id=? AND status IN ('creating','pending')",status,p.id).run();
}
export async function verifyStripeSignature(raw,header,secret,now=Date.now()){
 const parts=String(header||'').split(',').map(x=>x.trim().split('='));
 const timestamps=parts.filter(([k])=>k==='t');
 if(timestamps.length!==1||!/^\d{1,12}$/.test(timestamps[0][1]))return false;
 const timestamp=Number(timestamps[0][1]);if(Math.abs(now/1000-timestamp)>300)return false;
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 for(const [type,signature] of parts){if(type!=='v1'||!/^[a-f0-9]{64}$/i.test(signature||''))continue;
  const bytes=Uint8Array.from(signature.match(/../g),v=>parseInt(v,16));
  if(await crypto.subtle.verify('HMAC',key,bytes,encoder.encode(timestamp+'.'+raw)))return true;
 }return false;
}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export async function handleStripeWebhook(request,env){
 if(request.method!=='POST')return json({error:'Método no permitido.'},405);
 if(!paymentConfig(env).enabled)return json({error:'Pagos pendientes de activación.'},503);
 try{
  const reader=request.body?.getReader();if(!reader)return json({error:'Cuerpo vacío.'},400);
  let size=0;const chunks=[];while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>262144){await reader.cancel();return json({error:'Evento demasiado grande.'},413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const raw=new TextDecoder().decode(bytes);
  if(!await verifyStripeSignature(raw,request.headers.get('stripe-signature'),env.STRIPE_WEBHOOK_SECRET))return json({error:'Firma no válida.'},400);
  let event;try{event=JSON.parse(raw);}catch{return json({error:'JSON no válido.'},400);}
  if(!/^evt_[A-Za-z0-9]{1,180}$/.test(event.id||''))return json({error:'Identificador no válido.'},400);
  if(!['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired','checkout.session.async_payment_failed'].includes(event.type))return json({received:true});
  const session=event.data?.object;if(session?.metadata?.app!=='admira-ecommerce')return json({received:true});
  const p=await statement(env,'SELECT * FROM ecommerce_payments WHERE id=?',session.metadata.payment_id||'').first();
  if(!p)return json({error:'Operación aún no registrada.'},409);
  if(!validSession(session,p)||event.livemode!==(p.mode==='live')||(p.session_id&&p.session_id!==session.id))return json({error:'El evento no coincide con el pago.'},400);
  if(await statement(env,'SELECT event_id FROM ecommerce_payment_events WHERE event_id=?',event.id).first())return json({received:true});
  const paid=['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)&&session.payment_status==='paid';
  const now=Date.now(),eventKey='stripe:'+event.id;
  const ops=[];
  if(paid){
   ops.push(statement(env,"UPDATE ecommerce_payments SET status='paid',session_id=?,payment_intent=?,paid_at=COALESCE(paid_at,?),checkout_url=NULL WHERE id=?",session.id,typeof session.payment_intent==='string'?session.payment_intent:null,now,p.id));
   ops.push(statement(env,"UPDATE ecommerce_requests SET payment_status='paid',paid_at=COALESCE(paid_at,?),version=version+1,last_action=?,updated_at=? WHERE id=? AND payment_status!='paid'",now,eventKey,now,p.request_id));
   ops.push(statement(env,"INSERT OR IGNORE INTO ecommerce_events SELECT ?,id,?,?,'payment_paid','system','stripe','Stripe',?, ?,version FROM ecommerce_requests WHERE id=? AND last_action=?",crypto.randomUUID(),eventKey,event.id,(p.mode==='test'?'Pago de prueba confirmado: ':'Pago confirmado: ')+(p.amount_cents/100).toFixed(2)+' EUR.',now,p.request_id,eventKey));
  }else if(['checkout.session.expired','checkout.session.async_payment_failed'].includes(event.type)){
   ops.push(statement(env,"UPDATE ecommerce_payments SET status=?,checkout_url=NULL WHERE id=? AND status IN ('creating','pending')",event.type.endsWith('expired')?'expired':'failed',p.id));
  }
  ops.push(statement(env,'INSERT OR IGNORE INTO ecommerce_payment_events VALUES(?,?,?,?)',event.id,p.id,event.type,now));
  await env.DB.batch(ops);
  return json({received:true});
 }catch{return json({error:'No se pudo registrar el evento. Stripe debe reintentarlo.'},500);}
}
