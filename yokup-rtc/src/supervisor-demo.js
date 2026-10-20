// A supervised demo uses the canonical ticket ledger. No browser-local role,
// generic player reset or successful HTTP response can stand in for recovery.
import { canManageDevices } from './supervisor-devices.js';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const STORE = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const CODE = /^[A-Z0-9]{2,12}(?:-[A-Z0-9]{2,12}){1,3}$/;
const PREFIX = '/supervisor/demo';
const fail = (code, status=400) => Object.assign(new Error(code), {code, status});
const text = (v,n=1000) => typeof v === 'string' ? v.trim().slice(0,n) : '';
const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
async function schema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS supervisor_demo (
    event_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, ticket_id TEXT,
    xpacio TEXT NOT NULL, code TEXT NOT NULL, screen TEXT NOT NULL,
    description TEXT NOT NULL, observed_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
    before_key TEXT NOT NULL, before_hash TEXT NOT NULL, before_type TEXT NOT NULL,
    after_key TEXT, after_hash TEXT, after_type TEXT, after_at INTEGER,
    clear_id TEXT, clear_status TEXT, applied_at INTEGER,
    cause TEXT, action TEXT, closed_at INTEGER, report_status TEXT, report_receipt TEXT)`).run();
}
async function jsonBody(req) {
  if (Number(req.headers.get('content-length')) > 6*1024*1024) throw fail('body_too_large',413);
  const reader=req.body?.getReader(); if(!reader)throw fail('invalid_json');
  let length=0; const chunks=[];
  for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>6*1024*1024){await reader.cancel();throw fail('body_too_large',413);}chunks.push(value);}
  const bytes=new Uint8Array(length);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
  try {const b=JSON.parse(new TextDecoder().decode(bytes));if(!b||Array.isArray(b)||typeof b!=='object')throw Error();return b;}catch{throw fail('invalid_json');}
}
function fields(b, allowed) {if(Object.keys(b).some(k=>!allowed.includes(k)))throw fail('invalid_fields');}
function fresh(at, now) {if(!Number.isSafeInteger(at)||at<now-120000||at>now+5000)throw fail('fresh_capture_required');}
async function image(value) {
  if(!value||!['image/jpeg','image/png'].includes(value.type)||typeof value.base64!=='string'||value.base64.length>5600000||!value.base64.length)throw fail('invalid_image');
  let bytes;try{bytes=Uint8Array.from(atob(value.base64),c=>c.charCodeAt(0));}catch{throw fail('invalid_image');}
  if(bytes.length<24||bytes.length>4*1024*1024)throw fail('invalid_image');
  const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10;
  const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217;
  if(value.type==='image/png'?!png:!jpeg)throw fail('image_content_mismatch');
  return {bytes,type:value.type,hash:await hash(bytes)};
}
async function put(env,event,phase,p) {
  if(!env.MEDIA)throw fail('evidence_unconfigured',503);
  const key=`supervisor-demo/${event}/${phase}-${p.hash}`;
  await env.MEDIA.put(key,p.bytes,{httpMetadata:{contentType:p.type}});
  const saved=await env.MEDIA.get(key);
  if(!saved||await hash(await saved.arrayBuffer())!==p.hash)throw fail('evidence_not_persisted',502);
  return key;
}
async function target(env,xpacio,code) {
  if(!STORE.test(xpacio||'')||!CODE.test(code||''))throw fail('invalid_target');
  if(!env.INCIDENT_DESK?.fetch)throw fail('inventory_unavailable',503);
  const response=await env.INCIDENT_DESK.fetch(new Request('https://yokup-api.internal/internal/itil/xpacios/'+xpacio));
  const data=await response.json();
  if(!response.ok||data.ok!==true||data.xpacio?.admira_store_id!==xpacio||data.xpacio.removed_at)throw fail('inventory_unavailable',502);
  const ci=data.cis?.find(c=>c.itil_code===code&&c.lifecycle?.status!=='retired'&&['pantalla','tpv'].includes(c.category));
  if(!ci)throw fail('ci_not_found',404);
  // The destination is always the server-maintained demo binding.
  const binding=await env.DB.prepare("SELECT screen FROM supervisor_device_bindings WHERE xpacio=? AND code=? AND scope='demo'").bind(xpacio,code).first();
  if(!binding)throw fail('device_not_bound',409);
  return binding.screen;
}
function view(row) {
  return {event_id:row.event_id,id:row.ticket_id,xpacio:row.xpacio,code:row.code,screen:row.screen,kind:'popup',description:row.description,
    observed_at:row.observed_at,created_at:row.created_at,status:row.canonical_status||(row.closed_at?'resolved':'open'),clear_status:row.clear_status||'not_requested',
    applied_at:row.applied_at||null,closed_at:row.closed_at||null,cause:row.cause||'',action:row.action||'',
    elapsed_ms:row.closed_at?row.closed_at-row.observed_at:null,within_three_minutes:row.closed_at?row.closed_at-row.observed_at<=180000:null,
    before:`${PREFIX}/incidents/${row.event_id}/before`,after:row.after_key?`${PREFIX}/incidents/${row.event_id}/after`:null,
    report_status:row.report_status||'not_sent',report_receipt:row.report_receipt?JSON.parse(row.report_receipt):null,
    url:row.ticket_id?'https://www.admira.app/ticket?id='+row.ticket_id:null};
}
// Deliberately separate from generic player commands. The adapter must clear ONLY
// this popup and echo the event, bound screen and stable request ID. No fallback.
export async function demoControl(env,row,poll=false) {
  if(!env.SUPERVISOR_DEMO_CONTROL?.fetch)throw fail('popup_control_unconfigured',503);
  const response=await env.SUPERVISOR_DEMO_CONTROL.fetch(new Request('https://supervisor-demo-control.internal/popup-clear'+(poll?'?request_id='+row.clear_id:''),{
    method:poll?'GET':'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(10000),
    ...(!poll?{body:JSON.stringify({event_id:row.event_id,screen:row.screen,xpacio:row.xpacio,code:row.code,request_id:row.clear_id})}:{})
  }));
  if(!response.ok)throw fail('popup_control_unavailable',502);
  const receipt=await response.json();
  if(receipt.event_id!==row.event_id||receipt.screen!==row.screen||receipt.request_id!==row.clear_id||!['queued','executed','failed','ignored','unknown'].includes(receipt.status))throw fail('receipt_mismatch',502);
  if(receipt.status==='executed'&&(!Number.isSafeInteger(receipt.applied_at)||receipt.applied_at<row.created_at||receipt.applied_at>Date.now()+5000))throw fail('receipt_mismatch',502);
  return receipt;
}
export async function sendDemoReport(env,row,{fetchImpl=fetch}={}) {
  const token=env.SUPERVISOR_TELEGRAM_BOT_TOKEN,chat=String(env.SUPERVISOR_TELEGRAM_PRIVATE_CHAT_ID||'');
  // Positive configured private chat only. Never use the group's bot-say fallback.
  if(!token||! /^[1-9][0-9]{3,19}$/.test(chat))throw fail('private_telegram_unconfigured',503);
  // Respect the fleet-wide Telegram switch, using its existing service binding.
  // A stopped or unreadable gate leaves a retryable report and sends no photos.
  if(!env.TELEGRAM?.fetch)throw fail('telegram_gate_unavailable',503);
  let gateResponse,gate;
  try{gateResponse=await env.TELEGRAM.fetch(new Request('https://telegram/api/telegram-auto',{signal:AbortSignal.timeout(5000)}));gate=await gateResponse.json();}catch{throw fail('telegram_gate_unavailable',503);}
  if(gate.fleet_publish===false)throw fail('telegram_paused',409);
  if(!gateResponse.ok||gate.fleet_publish!==true)throw fail('telegram_gate_unavailable',503);
  const caption=`Supervisor · ${row.ticket_id} · popup\n${row.xpacio} · ${row.code} · ${row.screen}\nCausa: ${text(row.cause,220)}\nAcción: ${text(row.action,220)}\nAviso: ${new Date(row.observed_at).toISOString()}\nCierre: ${new Date(row.closed_at).toISOString()}\nTiempo: ${Math.ceil((row.closed_at-row.observed_at)/1000)} s\nhttps://www.admira.app/ticket?id=${row.ticket_id}`;
  const form=new FormData();form.set('chat_id',chat);
  form.set('media',JSON.stringify([{type:'photo',media:'attach://before',caption},{type:'photo',media:'attach://after',caption:'Después · recuperación revisada por el operador'}]));
  for(const phase of ['before','after']){
    const object=await env.MEDIA.get(row[phase+'_key']);if(!object)throw fail('evidence_missing',409);
    const bytes=await object.arrayBuffer();if(await hash(bytes)!==row[phase+'_hash'])throw fail('evidence_missing',409);
    form.set(phase,new Blob([bytes],{type:row[phase+'_type']}),phase+(row[phase+'_type']==='image/png'?'.png':'.jpg'));
  }
  // Do not propagate transport exceptions: Telegram URLs include a credential.
  let response,data;try{response=await fetchImpl('https://api.telegram.org/bot'+token+'/sendMediaGroup',{method:'POST',body:form,redirect:'error',signal:AbortSignal.timeout(12000)});data=await response.json();}catch{throw fail('telegram_delivery_unknown',502);}
  if(!response.ok||data.ok!==true)throw fail('telegram_rejected',502);
  if(!Array.isArray(data.result)||data.result.length!==2||data.result.some(r=>r.chat?.type!=='private'||String(r.chat.id)!==chat||!Number.isSafeInteger(r.message_id)))throw fail('telegram_delivery_unknown',502);
  return {delivered:true,read:false,message_ids:data.result.map(r=>r.message_id)};
}
export async function handleSupervisorDemo(req,env,deps) {
  const reply=(value,status=200)=>{const r=deps.json(value,status);r.headers.set('Cache-Control','no-store');return r;};
  if(!deps.session?.email)return reply({ok:false,error:'unauthorized'},401);
  if(!canManageDevices(deps.session,deps.access))return reply({ok:false,error:'supervisor_forbidden'},403);
  const origin=req.headers.get('origin');
  if(origin&&!['https://www.admira.app','https://admira.app','https://www.admira.biz','https://admira.biz','https://www.yokup.com','https://www.admira.live'].includes(origin))return reply({ok:false,error:'origin_not_allowed'},403);
  const url=new URL(req.url),segments=url.pathname.slice(PREFIX.length).split('/').filter(Boolean),event=segments[1],action=segments[2],now=deps.now??Date.now();
  try {
    if(segments[0]!=='incidents'||segments.length>3||event&&!UUID.test(event))throw fail('not_found',404);
    await deps.ensureSchema(env);await schema(env.DB);
    if(req.method==='GET'&&!event){
      const xpacio=url.searchParams.get('xpacio');if(!STORE.test(xpacio||''))throw fail('invalid_target');
      const rows=(await env.DB.prepare('SELECT d.*,t.status AS canonical_status FROM supervisor_demo d JOIN tickets t ON t.id=d.ticket_id WHERE d.xpacio=? ORDER BY d.created_at DESC LIMIT 20').bind(xpacio).all()).results||[];
      return reply({ok:true,incidents:rows.filter(r=>r.ticket_id).map(view),control_configured:!!env.SUPERVISOR_DEMO_CONTROL,telegram_configured:!!env.SUPERVISOR_TELEGRAM_BOT_TOKEN&&/^[1-9][0-9]{3,19}$/.test(String(env.SUPERVISOR_TELEGRAM_PRIVATE_CHAT_ID||'')),generated_at:now});
    }
    if(req.method==='POST'&&!event){
      const b=await jsonBody(req);fields(b,['event_id','xpacio','code','description','observed_at','before']);
      if(!UUID.test(b.event_id||'')||!text(b.description))throw fail('invalid_alert');
      const photo=await image(b.before),fingerprint=await hash(new TextEncoder().encode(JSON.stringify([b.xpacio,b.code,b.description,b.observed_at,photo.hash])));
      let row=await env.DB.prepare('SELECT * FROM supervisor_demo WHERE event_id=?').bind(b.event_id).first();
      if(row&&row.fingerprint!==fingerprint)throw fail('event_conflict',409);
      if(row?.ticket_id)return reply({ok:true,incident:view(row),replayed:true});
      fresh(b.observed_at,now);
      const screen=await target(env,b.xpacio,b.code),key=await put(env,b.event_id,'before',photo);
      await env.DB.prepare(`INSERT OR IGNORE INTO supervisor_demo(event_id,fingerprint,xpacio,code,screen,description,observed_at,created_at,before_key,before_hash,before_type) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(b.event_id,fingerprint,b.xpacio,b.code,screen,text(b.description),b.observed_at,now,key,photo.hash,photo.type).run();
      row=await env.DB.prepare('SELECT * FROM supervisor_demo WHERE event_id=?').bind(b.event_id).first();
      if(row.fingerprint!==fingerprint)throw fail('event_conflict',409);
      const id=await deps.createIncident(env,{resource:'supervisor-demo:'+b.event_id,kind:'screen',source:'supervisor-demo',severity:'normal',loc:b.xpacio,subject:'Popup · '+b.code,assignee:'Supervisor',by:'Supervisor',detail:`Aviso recibido · ${row.screen} · ${new Date(row.observed_at).toISOString()} · ${row.description}. Evidencia privada en /supervisor?demo=incidencia&xpacio=${row.xpacio}`});
      if(!id)throw fail('incident_not_created',502);
      await env.DB.prepare('UPDATE supervisor_demo SET ticket_id=? WHERE event_id=? AND ticket_id IS NULL').bind(id,b.event_id).run();
      return reply({ok:true,incident:view({...row,ticket_id:id})},201);
    }
    const row=event?await env.DB.prepare('SELECT d.*,t.status AS canonical_status FROM supervisor_demo d JOIN tickets t ON t.id=d.ticket_id WHERE d.event_id=?').bind(event).first():null;
    if(!row?.ticket_id)throw fail('not_found',404);
    if(req.method==='GET'&&['before','after'].includes(action)){
      const object=await env.MEDIA?.get(row[action+'_key']);if(!object)throw fail('evidence_missing',404);
      return new Response(object.body,{headers:{'Content-Type':row[action+'_type'],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }
    if(req.method==='GET'&&!action)return reply({ok:true,incident:view(row)});
    if(req.method!=='POST')throw fail('method_not_allowed',405);
    if(action==='clear'||action==='receipt'){
      const b=await jsonBody(req);fields(b,action==='clear'?['request_id']:[]);
      if(['resolved','cancelled'].includes(row.canonical_status))return reply({ok:true,incident:view(row)});
      if(action==='clear'){
        if(!UUID.test(b.request_id||''))throw fail('invalid_request_id');
        if(row.clear_id&&row.clear_id!==b.request_id)throw fail('clear_already_requested',409);
        if(row.clear_id)return reply({ok:true,incident:view(row),replayed:true});
        if(!env.SUPERVISOR_DEMO_CONTROL)throw fail('popup_control_unconfigured',503);
        if(await target(env,row.xpacio,row.code)!==row.screen)throw fail('binding_changed',409);
        const reserved=await env.DB.prepare("UPDATE supervisor_demo SET clear_id=?,clear_status='sending' WHERE event_id=? AND clear_id IS NULL").bind(b.request_id,event).run();
        if(!reserved.meta?.changes)throw fail('clear_in_progress',409);
        row.clear_id=b.request_id;
      }else if(!row.clear_id)throw fail('clear_not_requested',409);
      let receipt;try{receipt=await (deps.control||demoControl)(env,row,action==='receipt');}catch(e){
        await env.DB.prepare("UPDATE supervisor_demo SET clear_status='unknown' WHERE event_id=? AND clear_status!='executed'").bind(event).run();throw e.code?e:fail('popup_control_unavailable',502);
      }
      // Injected transports must follow the same exact-receipt policy.
      if(receipt.event_id!==event||receipt.screen!==row.screen||receipt.request_id!==row.clear_id||!['queued','executed','failed','ignored','unknown'].includes(receipt.status)||receipt.status==='executed'&&(!Number.isSafeInteger(receipt.applied_at)||receipt.applied_at<row.created_at||receipt.applied_at>now+5000))throw fail('receipt_mismatch',502);
      if(row.clear_status==='executed')return reply({ok:true,incident:view(row)});
      await env.DB.prepare('UPDATE supervisor_demo SET clear_status=?,applied_at=? WHERE event_id=?').bind(receipt.status,receipt.status==='executed'?receipt.applied_at:null,event).run();
      return reply({ok:true,incident:view({...row,clear_status:receipt.status,applied_at:receipt.status==='executed'?receipt.applied_at:null})});
    }
    if(action==='close'){
      const b=await jsonBody(req);fields(b,['cause','action','captured_at','reviewed_recovered','after']);
      if(row.closed_at){if(row.canonical_status!=='resolved')throw fail('ticket_closure_conflict',409);return reply({ok:true,incident:view(row),replayed:true});}
      if(row.clear_status!=='executed')throw fail('popup_execution_unconfirmed',409);
      if(!text(b.cause)||!text(b.action)||b.reviewed_recovered!==true)throw fail('review_required');
      fresh(b.captured_at,now);if(b.captured_at<=row.applied_at)throw fail('post_action_capture_required');
      const photo=await image(b.after);if(photo.hash===row.before_hash)throw fail('distinct_recovery_capture_required',409);
      if(await deps.portalAssigned(env,row.ticket_id))throw fail('technician_assigned',409);
      const key=await put(env,event,'after',photo),before=await env.MEDIA.get(row.before_key);
      if(!before||await hash(await before.arrayBuffer())!==row.before_hash)throw fail('evidence_missing',409);
      const cause=text(b.cause),actionText=text(b.action);
      // Ledger closure and demo metadata are one transaction. Neither can report a
      // closed job if the evidence write or the canonical ticket update fails.
      await env.DB.batch([
        env.DB.prepare("UPDATE tickets SET status='resolved',resolved_at=?,updated_at=? WHERE id=? AND source='supervisor-demo' AND status NOT IN ('resolved','cancelled')").bind(now,now,row.ticket_id),
        env.DB.prepare("UPDATE supervisor_demo SET after_key=?,after_hash=?,after_type=?,after_at=?,cause=?,action=?,closed_at=? WHERE event_id=? AND closed_at IS NULL AND EXISTS(SELECT 1 FROM tickets WHERE id=? AND status='resolved' AND source='supervisor-demo')").bind(key,photo.hash,photo.type,b.captured_at,cause,actionText,now,event,row.ticket_id),
        env.DB.prepare("INSERT INTO events(ticket_id,ts,kind,author,text) SELECT ?,?,'close',?,? WHERE changes()>0").bind(row.ticket_id,now,deps.session.email,`Popup retirado con recibo ${row.clear_id}. Causa: ${cause}. Acción: ${actionText}. Capturas antes/después privadas en Supervisor. Revisión óptica declarada por el operador; no acredita por sí sola el estado físico del panel.`)
      ]);
      const saved=await env.DB.prepare('SELECT * FROM supervisor_demo WHERE event_id=?').bind(event).first();
      if(!saved.closed_at)throw fail('ticket_closure_conflict',409);
      return reply({ok:true,incident:view(saved)});
    }
    if(action==='report'){
      const b=await jsonBody(req);fields(b,[]);
      if(!row.closed_at||row.canonical_status!=='resolved')throw fail('incident_not_closed',409);
      if(['delivered','unknown','sending'].includes(row.report_status))return reply({ok:true,incident:view(row),replayed:true});
      if(!env.SUPERVISOR_TELEGRAM_BOT_TOKEN||!/^[1-9][0-9]{3,19}$/.test(String(env.SUPERVISOR_TELEGRAM_PRIVATE_CHAT_ID||'')))throw fail('private_telegram_unconfigured',503);
      const reserved=await env.DB.prepare("UPDATE supervisor_demo SET report_status='sending' WHERE event_id=? AND (report_status IS NULL OR report_status='failed')").bind(event).run();
      if(!reserved.meta?.changes)throw fail('report_in_progress',409);
      let receipt;try{receipt=await sendDemoReport(env,row,{fetchImpl:deps.fetchImpl||fetch});}catch(e){
        await env.DB.prepare('UPDATE supervisor_demo SET report_status=? WHERE event_id=?').bind(['telegram_rejected','evidence_missing','telegram_paused','telegram_gate_unavailable'].includes(e.code)?'failed':'unknown',event).run();throw e;
      }
      await env.DB.prepare("UPDATE supervisor_demo SET report_status='delivered',report_receipt=? WHERE event_id=?").bind(JSON.stringify(receipt),event).run();
      return reply({ok:true,incident:view({...row,report_status:'delivered',report_receipt:JSON.stringify(receipt)})});
    }
    throw fail('not_found',404);
  }catch(e){return reply({ok:false,error:e.code||'demo_unavailable'},e.status||502);}
}
