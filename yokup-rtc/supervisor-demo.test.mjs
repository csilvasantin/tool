import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {handleSupervisorDemo,demoControl,sendDemoReport} from './src/supervisor-demo.js';

const event='00000000-0000-4000-8000-000000000001',request_id='00000000-0000-4000-8000-000000000002';
const before={type:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='};
const after={type:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVQIHWP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC'};
function fixture(t){
  const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());
  sqlite.exec(`CREATE TABLE tickets(id TEXT PRIMARY KEY,screen TEXT UNIQUE,status TEXT,source TEXT,resolved_at INTEGER,updated_at INTEGER);
    CREATE TABLE events(ticket_id TEXT,ts INTEGER,kind TEXT,author TEXT,text TEXT);
    CREATE TABLE supervisor_device_bindings(xpacio TEXT,code TEXT,screen TEXT,scope TEXT);
    INSERT INTO supervisor_device_bindings VALUES('alsea-sbux-021','PDG103-PAN-01','physical-screen','demo')`);
  const DB={prepare(sql){const s=sqlite.prepare(sql);let v=[];return {bind(...args){v=args;return this;},async run(){const r=s.run(...v);return {meta:{changes:Number(r.changes)}};},async first(){return s.get(...v)||null;},async all(){return {results:s.all(...v)};}};},async batch(statements){sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
  const f={sqlite,now:Date.now(),sent:0,orders:0,phase:'queued',stored:new Map(),session:{email:'operator@example.com'},access:{allowed:true,canChangeProject:true}};
  f.env={DB,TELEGRAM:{fetch:async()=>Response.json({fleet_publish:!f.telegramPaused})},MEDIA:{async put(key,bytes,options){if(f.uploadFail)throw Error('upload_failed');f.stored.set(key,{bytes:new Uint8Array(bytes),options});},async get(key){const o=f.stored.get(key);return !o||f.readFail?null:{arrayBuffer:async()=>o.bytes.buffer.slice(o.bytes.byteOffset,o.bytes.byteOffset+o.bytes.byteLength),body:o.bytes,httpMetadata:o.options.httpMetadata};}},
    INCIDENT_DESK:{fetch:async()=>Response.json({ok:true,xpacio:{admira_store_id:'alsea-sbux-021'},cis:[{itil_code:'PDG103-PAN-01',category:'pantalla',lifecycle:{status:'operational'}}]})},
    SUPERVISOR_DEMO_CONTROL:{fetch(){}},SUPERVISOR_TELEGRAM_BOT_TOKEN:'test-private-token',SUPERVISOR_TELEGRAM_PRIVATE_CHAT_ID:'12345'};
  f.control=async(_env,row,poll)=>{if(!poll)f.orders++;if(f.controlLost)throw Error('private-token');return {event_id:f.mismatch?'00000000-0000-4000-8000-000000000003':row.event_id,screen:row.screen,request_id:row.clear_id,status:f.phase,applied_at:f.now};};
  f.call=async(path='',body,options={})=>{
    const response=await handleSupervisorDemo(new Request('https://api.yokup.com/supervisor/demo/incidents'+path,{method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{}),...options}),f.env,{
      session:f.session,access:f.access,now:f.now,json:(d,status=200)=>Response.json(d,{status}),ensureSchema:async()=>{},
      createIncident:async(_env,inc)=>{sqlite.prepare("INSERT OR IGNORE INTO tickets VALUES('INC-DEMO01',?,'open','supervisor-demo',NULL,?)").run(inc.resource,f.now);return 'INC-DEMO01';},
      portalAssigned:async()=>f.held,control:f.control,
      fetchImpl:async(url,init)=>{f.sent++;assert.equal(url,'https://api.telegram.org/bottest-private-token/sendMediaGroup');assert.equal(init.redirect,'error');assert.equal(init.body.get('chat_id'),'12345');assert.equal(JSON.parse(init.body.get('media')).length,2);assert.ok(init.body.get('before').size>24);if(f.telegramLost)throw Error(url);if(f.telegramReject)return Response.json({ok:false},{status:429});return Response.json({ok:true,result:[1,2].map(message_id=>({message_id,chat:{type:f.telegramGroup?'group':'private',id:12345}}))});}
    });
    return {status:response.status,body:response.headers.get('content-type')?.includes('image/')?new Uint8Array(await response.arrayBuffer()):await response.json()};
  };
  f.alert=(changes={})=>f.call('',{event_id:event,xpacio:'alsea-sbux-021',code:'PDG103-PAN-01',description:'Popup observado por Admirito',observed_at:f.now,before,...changes});
  f.clear=()=>f.call('/'+event+'/clear',{request_id});
  f.close=(changes={})=>f.call('/'+event+'/close',{cause:'Popup de prueba autorizado',action:'Retirada específica con recibo',captured_at:f.now+1000,reviewed_recovered:true,after,...changes});
  f.ready=async()=>{await f.alert();f.phase='executed';await f.clear();f.now+=2000;};
  return f;
}
test('ES: sin sesión o rol servidor no se crea esquema ni se lee inventario',async()=>{
  for(const [session,access,status] of [[null,{},401],[{email:'x'}, {allowed:true,canChangeProject:false},403]]){
    const r=await handleSupervisorDemo(new Request('https://api.yokup.com/supervisor/demo/incidents?xpacio=alsea-sbux-021'),{}, {session,access,json:(d,status)=>Response.json(d,{status})});assert.equal(r.status,status);
  }
});
test('EN: actual SQLite alert, private persisted image and stable replay',async t=>{
  const f=fixture(t),a=await f.alert();assert.equal(a.status,201);assert.equal(a.body.incident.status,'open');assert.equal(f.stored.size,1);
  assert.equal((await f.alert()).body.replayed,true);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM tickets').get().n,1);
  assert.equal((await f.alert({description:'different'})).body.error,'event_conflict');
  const image=await f.call('/'+event+'/before');assert.equal(image.status,200);assert.ok(image.body.length>24);
  assert.doesNotMatch(JSON.stringify(a),/supervisor-demo\/|private-token|operator@example/);
});
test('ES: aviso inválido, antiguo, destino impuesto y foto falsa no abren ticket',async t=>{
  const f=fixture(t);
  assert.equal((await f.alert({screen:'some-other-screen'})).body.error,'invalid_fields');
  assert.equal((await f.alert({observed_at:f.now-120001})).body.error,'fresh_capture_required');
  assert.equal((await f.alert({before:{type:'image/jpeg',base64:before.base64}})).body.error,'image_content_mismatch');
  assert.equal((await f.alert({code:'BAD'})).body.error,'invalid_target');assert.equal(f.sqlite.prepare('SELECT count(*) n FROM tickets').get().n,0);
});
test('EN: missing binding and failed photo persistence never create an incident',async t=>{
  const f=fixture(t);f.uploadFail=true;assert.equal((await f.alert()).status,502);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM tickets').get().n,0);
  f.uploadFail=false;f.readFail=true;assert.equal((await f.alert()).body.error,'evidence_not_persisted');
  f.readFail=false;f.sqlite.exec('DELETE FROM supervisor_device_bindings');assert.equal((await f.alert()).body.error,'device_not_bound');
});
test('ES: orden en cola no es retirada y nunca permite cerrar',async t=>{
  const f=fixture(t);await f.alert();const c=await f.clear();assert.equal(c.body.incident.clear_status,'queued');assert.equal((await f.close()).body.error,'popup_execution_unconfirmed');
  assert.equal(f.sqlite.prepare('SELECT status FROM tickets').get().status,'open');assert.equal((await f.clear()).body.replayed,true);assert.equal(f.orders,1);
});
test('EN: lost control response is unknown, stable retry never resends, exact polling recovers',async t=>{
  const f=fixture(t);await f.alert();f.controlLost=true;const r=await f.clear();assert.equal(r.status,502);assert.doesNotMatch(JSON.stringify(r),/private-token/);assert.equal((await f.call('/'+event)).body.incident.clear_status,'unknown');
  await f.clear();assert.equal(f.orders,1);f.controlLost=false;f.phase='executed';f.mismatch=true;assert.equal((await f.call('/'+event+'/receipt',{})).body.error,'receipt_mismatch');assert.equal((await f.close()).status,409);
  f.mismatch=false;assert.equal((await f.call('/'+event+'/receipt',{})).body.incident.clear_status,'executed');
});
test('ES: fallo de subida, evidencia idéntica, hora previa o falta de revisión conservan abierta',async t=>{
  const f=fixture(t);await f.ready();assert.equal((await f.close({after:before})).body.error,'distinct_recovery_capture_required');
  assert.equal((await f.close({captured_at:f.now-3000})).body.error,'post_action_capture_required');assert.equal((await f.close({reviewed_recovered:false})).body.error,'review_required');
  f.uploadFail=true;assert.equal((await f.close()).status,502);assert.equal(f.sqlite.prepare('SELECT status FROM tickets').get().status,'open');f.uploadFail=false;f.readFail=true;assert.equal((await f.close()).status,502);
});
test('EN: successful evidence + atomic canonical close, with before/after retained and replay',async t=>{
  const f=fixture(t);await f.ready();const r=await f.close();assert.equal(r.status,200);assert.equal(r.body.incident.status,'resolved');assert.equal(r.body.incident.within_three_minutes,true);
  assert.equal(f.sqlite.prepare('SELECT status FROM tickets').get().status,'resolved');assert.equal(f.stored.size,2);assert.equal(f.sqlite.prepare("SELECT count(*) n FROM events WHERE kind='close'").get().n,1);
  assert.equal((await f.close()).body.replayed,true);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM events').get().n,1);
});
test('ES: asignación técnica o ticket cancelado impiden cierre por este carril',async t=>{
  const f=fixture(t);await f.ready();f.held=true;assert.equal((await f.close()).body.error,'technician_assigned');f.held=false;
  f.sqlite.exec("UPDATE tickets SET status='cancelled'");assert.equal((await f.close()).body.error,'ticket_closure_conflict');assert.equal((await f.call('/'+event)).body.incident.closed_at,null);
});
test('EN: Telegram sends actual stored photos to the configured private chat, only once',async t=>{
  const f=fixture(t);await f.ready();assert.equal((await f.call('/'+event+'/report',{})).body.error,'incident_not_closed');await f.close();
  const r=await f.call('/'+event+'/report',{});assert.equal(r.body.incident.report_status,'delivered');assert.deepEqual(r.body.incident.report_receipt,{delivered:true,read:false,message_ids:[1,2]});assert.equal(f.sent,1);
  await f.call('/'+event+'/report',{});assert.equal(f.sent,1);assert.doesNotMatch(JSON.stringify(r),/test-private|12345/);
});
test('ES: entrega incierta no se repite; rechazo explícito sí permite reintento',async t=>{
  const f=fixture(t);await f.ready();await f.close();f.telegramReject=true;assert.equal((await f.call('/'+event+'/report',{})).body.error,'telegram_rejected');f.telegramReject=false;
  f.telegramLost=true;const r=await f.call('/'+event+'/report',{});assert.equal(r.body.error,'telegram_delivery_unknown');assert.doesNotMatch(JSON.stringify(r),/test-private/);await f.call('/'+event+'/report',{});assert.equal(f.sent,2);
});
test('EN: group chat configuration is rejected before any outbound Telegram call',async t=>{
  const f=fixture(t);await f.ready();await f.close();f.env.SUPERVISOR_TELEGRAM_PRIVATE_CHAT_ID='-100123';assert.equal((await f.call('/'+event+'/report',{})).body.error,'private_telegram_unconfigured');assert.equal(f.sent,0);
});
test('ES: respeta la verja global de Telegram; parada o fallo no envían y permiten reintentar',async t=>{
  const f=fixture(t);await f.ready();await f.close();f.telegramPaused=true;assert.equal((await f.call('/'+event+'/report',{})).body.error,'telegram_paused');assert.equal(f.sent,0);
  f.telegramPaused=false;const binding=f.env.TELEGRAM;delete f.env.TELEGRAM;assert.equal((await f.call('/'+event+'/report',{})).body.error,'telegram_gate_unavailable');assert.equal(f.sent,0);
  f.env.TELEGRAM=binding;assert.equal((await f.call('/'+event+'/report',{})).body.incident.report_status,'delivered');assert.equal(f.sent,1);
});
test('ES: cambios de vínculo, control sin configurar y origen ajeno se rechazan',async t=>{
  const f=fixture(t);await f.alert();delete f.env.SUPERVISOR_DEMO_CONTROL;assert.equal((await f.clear()).status,503);assert.equal(f.orders,0);f.env.SUPERVISOR_DEMO_CONTROL={};
  f.sqlite.exec("UPDATE supervisor_device_bindings SET screen='different-screen'");assert.equal((await f.clear()).body.error,'binding_changed');assert.equal(f.orders,0);
  assert.equal((await f.call('?xpacio=alsea-sbux-021',null,{headers:{origin:'https://foreign.example'}})).status,403);
});
test('EN: default adapter requires a binding; Telegram helper requires fixed private destination',async()=>{
  await assert.rejects(demoControl({},{}),/popup_control_unconfigured/);await assert.rejects(sendDemoReport({},{}),/private_telegram_unconfigured/);
});
