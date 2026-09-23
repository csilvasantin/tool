import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {setup} from './test-fixture.mjs';
import {handleCalls} from './src/calls.js';
import {hash} from './src/installer-portal.js';
import {advanceTelephone,telephoneXml} from './src/calls-telephone.js';
const account='AC'+'a'.repeat(32),sid='CA'+'b'.repeat(32),from='+491111111111',to='+34600000000';
async function fixture(){
 const f=setup(),token=crypto.randomUUID();f.env.TWILIO_ACCOUNT_SID=account;f.env.TWILIO_AUTH_TOKEN='test-secret';f.env.TWILIO_FROM=from;f.env.TWILIO_DEMO_TO=to;
 f.db.prepare('INSERT INTO portal_superusers VALUES(?,NULL,?,?,NULL)').run('admin@example.test','test',Date.now());
 f.db.prepare('INSERT INTO portal_admin_sessions VALUES(?,?,?,?)').run(await hash(token),'admin@example.test','sub',Date.now()+60000);
 f.cookie='__Host-yk_portal_admin='+token;f.sent=[];
 f.env.TWILIO_FETCH=async(url,options)=>{f.sent.push({url,options});return Response.json({sid,status:'queued'});};
 const p=await api(f,'/pilot',{});f.c=p.body.id;
 await api(f,'/cases/'+encodeURIComponent(f.c)+'/contacts',{kind:'retailer',name:'Contacto de prueba',phone:to,timezone:'Europe/Madrid'});
 const d=await api(f,'/cases/'+encodeURIComponent(f.c));f.job=d.body.jobs[0].id;f.key=crypto.randomUUID();return f;
}
async function api(f,path,body){const r=await handleCalls(new Request('https://data.yokup.com/api/calls'+path,{method:body?'POST':'GET',headers:{Origin:'https://www.yokup.com',Cookie:f.cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),f.env);return {status:r.status,body:await r.json()};}
const dial=f=>api(f,'/jobs/'+encodeURIComponent(f.job)+'/telephone',{request_key:f.key,authorized:true});
async function hook(f,turn,fields={},options={}){
 const url='https://data.yokup.com/api/calls/telephone/'+f.key+'/'+(options.status?'status':'voice?turn='+turn);
 const params=new URLSearchParams({AccountSid:account,CallSid:sid,To:to,From:from,...fields});
 const data=url+[...params.keys()].sort().map(k=>k+params.get(k)).join('');
 const r=await handleCalls(new Request(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-Twilio-Signature':options.bad?'invalid':createHmac('sha1','test-secret').update(data).digest('base64')},body:params.toString()}),f.env);
 return {status:r.status,text:await r.text()};
}
test('real phone launch is web-admin only, synthetic, allowlisted, explicit and idempotent',async()=>{
 const f=await fixture();const r=await dial(f);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.call_sid,sid);assert.equal(f.sent.length,1);
 const body=new URLSearchParams(f.sent[0].options.body);assert.equal(body.get('To'),to);assert.equal(body.get('TimeLimit'),'180');assert.ok(body.get('Url').startsWith('https://data.yokup.com/api/calls/telephone/'));
 assert.equal((await dial(f)).body.replayed,true);assert.equal(f.sent.length,1);
 f.key=crypto.randomUUID();assert.equal((await dial(f)).status,409);assert.equal(f.sent.length,1);
});
test('no credentials or different contact cannot launch a call',async()=>{
 const f=await fixture();delete f.env.TWILIO_AUTH_TOKEN;assert.equal((await dial(f)).status,503);f.env.TWILIO_AUTH_TOKEN='test-secret';
 f.env.TWILIO_DEMO_TO='+34600000001';assert.equal((await dial(f)).status,400);assert.equal(f.sent.length,0);
 f.env.TWILIO_DEMO_TO=to;f.db.prepare('UPDATE call_cases SET is_test=0 WHERE id=?').run(f.c);assert.equal((await dial(f)).status,409);
});
test('signed conversation persists confirmed availability once, without scheduling a visit',async()=>{
 const f=await fixture();await dial(f);
 assert.match((await hook(f,0)).text,/demostración/);
 assert.match((await hook(f,1,{SpeechResult:'sí',Confidence:'0.9'})).text,/franja/);
 assert.match((await hook(f,2,{SpeechResult:'Mañana de diez a doce',Confidence:'0.9'})).text,/recibir/);
 const confirm=await hook(f,3,{SpeechResult:'Carlos abre por la entrada principal',Confidence:'0.9'});assert.match(confirm.text,/Mañana de diez a doce/);assert.match(confirm.text,/¿Es correcto/);
 let attempt=f.db.prepare('SELECT * FROM call_attempts WHERE id=?').get(f.key);assert.equal(attempt.ended_at,null);
 const done=await hook(f,4,{Digits:'1'});assert.match(done.text,/He guardado/);
 attempt=f.db.prepare('SELECT * FROM call_attempts WHERE id=?').get(f.key);assert.equal(attempt.outcome,'availability');assert.match(attempt.availability,/Carlos abre/);
 const repeated=await hook(f,4,{Digits:'1'});assert.equal(repeated.text,done.text);
 await hook(f,0,{CallStatus:'completed'},{status:true});await hook(f,0,{CallStatus:'completed'},{status:true});
 assert.equal(f.db.prepare('SELECT attempt_count FROM call_jobs WHERE id=?').get(f.job).attempt_count,1);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM call_proposals').get().n,0);assert.equal(f.db.prepare('SELECT stage FROM call_cases WHERE id=?').get(f.c).stage,'open');
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM call_events WHERE kind='call_result'").get().n,1);
});
test('forged, misbound and out-of-order callbacks cannot change the case',async()=>{
 const f=await fixture();await dial(f);
 assert.equal((await hook(f,0,{}, {bad:true})).status,403);
 assert.equal((await hook(f,0,{To:'+34600000001'})).status,403);
 assert.equal((await hook(f,0,{CallSid:'CA'+'c'.repeat(32)})).status,403);
 assert.equal((await hook(f,2,{SpeechResult:'sí'})).status,409);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM call_telephone_turns').get().n,0);
});
test('no answer retries to the queue, duplicate and stale statuses never restart dialing',async()=>{
 const f=await fixture();await dial(f);await hook(f,0,{CallStatus:'no-answer'},{status:true});await hook(f,0,{CallStatus:'ringing'},{status:true});await hook(f,0,{CallStatus:'no-answer'},{status:true});
 const j=f.db.prepare('SELECT * FROM call_jobs WHERE id=?').get(f.job);assert.equal(j.status,'retry');assert.equal(j.attempt_count,1);assert.ok(j.retry_at>Date.now());
 assert.equal(f.db.prepare('SELECT provider_status FROM call_telephone').get().provider_status,'no-answer');assert.equal(f.sent.length,1);
});
test('silence, uncertain recognition and requests for a person never become consent',()=>{
 const start={step:'fault',turn:0,retries:0};let s=advanceTelephone(start,'sí','','0.2');assert.equal(s.step,'fault');assert.equal(s.retries,1);s=advanceTelephone(s,'');assert.equal(s.outcome,'human_handoff');
 s=advanceTelephone(start,'Quiero hablar con una persona');assert.equal(s.outcome,'human_handoff');
 s=advanceTelephone({step:'confirm',turn:4,retries:0,availability:'martes',access:'Carlos'},'No sé');assert.equal(s.done,undefined);
 s=advanceTelephone({...start,step:'confirm',turn:4,availability:'martes',access:'Carlos'},'no');assert.equal(s.step,'availability');assert.equal(s.availability,'');
 assert.ok(!telephoneXml({...start,prompt:'<script>mal</script>'},{title:'<X>',site_name:'A&B'},'id').includes('<script>'));
});
test('provider failure is not silently retried and ambiguous timeout remains reserved',async()=>{
 const f=await fixture();f.env.TWILIO_FETCH=async()=>{throw Error('network timeout');};const result=await dial(f);assert.equal(result.body.status,'unknown');
 assert.equal((await dial(f)).body.replayed,true);assert.equal(f.db.prepare('SELECT status FROM call_jobs WHERE id=?').get(f.job).status,'in_call');
 const g=await fixture();g.env.TWILIO_FETCH=async()=>Response.json({code:21219},{status:400});assert.equal((await dial(g)).status,502);assert.equal(g.db.prepare('SELECT status FROM call_jobs WHERE id=?').get(g.job).status,'escalated');
});
test('reconciliation verifies account, destination and timestamp before finishing an uncertain attempt',async()=>{
 const f=await fixture();f.env.TWILIO_FETCH=async()=>{throw Error('timeout');};await dial(f);
 const route='/jobs/'+encodeURIComponent(f.job)+'/telephone-status';
 const call={sid,account_sid:account,to,from,date_created:new Date().toUTCString(),status:'completed'};
 f.env.TWILIO_FETCH=async()=>Response.json({...call,to:'+34611111111'});
 assert.equal((await api(f,route,{attempt_id:f.key,call_sid:sid})).status,409);
 f.env.TWILIO_FETCH=async()=>Response.json(call);
 assert.equal((await api(f,route,{attempt_id:f.key,call_sid:sid})).status,200);
 assert.equal(f.db.prepare('SELECT outcome FROM call_attempts WHERE id=?').get(f.key).outcome,'human_handoff');
 assert.equal((await api(f,route,{attempt_id:f.key,call_sid:sid})).status,200);
 assert.equal(f.db.prepare('SELECT attempt_count FROM call_jobs WHERE id=?').get(f.job).attempt_count,1);
});
test('router demo creates an idempotent network case without dialing',async()=>{
 const f=await fixture(),request_key=crypto.randomUUID();
 const first=await api(f,'/router-demo',{request_key,phone:to});assert.equal(first.status,201);
 const replay=await api(f,'/router-demo',{request_key,phone:to});assert.equal(replay.body.id,first.body.id);assert.equal(replay.body.replayed,true);assert.equal(f.sent.length,0);
 const d=await api(f,'/cases/'+encodeURIComponent(first.body.id));assert.equal(d.body.case.skill,'network');assert.equal(d.body.case.is_test,1);assert.equal(d.body.contacts[0].phone,to);assert.equal(d.body.jobs[0].status,'pending');
 assert.equal((await api(f,'/router-demo',{request_key:crypto.randomUUID(),phone:'123'})).status,400);
});
test('router call uses Spanish neural voice, waits for power cycle and stores only confirmed result',async()=>{
 const f=await fixture();const p=await api(f,'/router-demo',{request_key:crypto.randomUUID(),phone:to});f.c=p.body.id;f.job='retailer:'+f.c;
 assert.equal((await dial(f)).status,200);assert.equal(new URLSearchParams(f.sent[0].options.body).get('TimeLimit'),'300');
 const intro=await hook(f,0);assert.match(intro.text,/Polly.Lucia-Neural/);assert.match(intro.text,/language="es-ES"/);assert.match(intro.text,/voz sintética/);assert.match(intro.text,/restablecimiento de fábrica/);
 assert.match((await hook(f,1,{Digits:'1'})).text,/No pulses el botón RESET/);
 assert.match((await hook(f,2,{Digits:'1'})).text,/<Pause length="30"/);
 assert.match((await hook(f,3,{Digits:'1'})).text,/<Pause length="60"/);
 assert.match((await hook(f,4,{Digits:'1'})).text,/¿Confirmas/);
 assert.equal(f.db.prepare('SELECT ended_at FROM call_attempts WHERE id=?').get(f.key).ended_at,null);
 const done=await hook(f,5,{Digits:'1'});assert.match(done.text,/He guardado el resultado/i);
 assert.equal((await hook(f,5,{Digits:'1'})).text,done.text);
 const at=f.db.prepare('SELECT * FROM call_attempts WHERE id=?').get(f.key);assert.equal(at.outcome,'agreed');assert.match(at.notes,/Sin telemetría real/);
 assert.equal(f.db.prepare('SELECT stage FROM call_cases WHERE id=?').get(f.c).stage,'open');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM call_proposals').get().n,0);
});
test('router refusal and ambiguous responses never instruct a reset or confirm recovery',()=>{
 const s={scenario:'router',step:'consent',turn:0,retries:0};
 assert.equal(advanceTelephone(s,'no').outcome,'human_handoff');
 assert.equal(advanceTelephone(s,'sí','','0.2').step,'consent');
 assert.equal(advanceTelephone(advanceTelephone(s,''),'').outcome,'human_handoff');
 const rejected=advanceTelephone({...s,step:'confirm',turn:5,restored:true},'no');assert.equal(rejected.outcome,'human_handoff');
 const failed=advanceTelephone({...s,step:'confirm',turn:5,restored:false},'sí');assert.equal(failed.outcome,'human_handoff');assert.match(failed.notes,/sigue sin conexión/);
});
test('new Twilio trial sends only supported fields and reports structured rejection safely',async()=>{
 const f=await fixture();f.env.TWILIO_TRIAL_MODE='true';
 f.env.TWILIO_FETCH=async(url,options)=>{f.sent.push({url,options});return Response.json({error:{message:'Unsupported parameter TimeLimit'}},{status:400});};
 const result=await dial(f);assert.equal(result.status,502);assert.match(result.body.error,/Unsupported parameter TimeLimit/);
 assert.deepEqual([...new URLSearchParams(f.sent[0].options.body).keys()].sort(),['From','StatusCallback','To','Url']);
 assert.equal(f.db.prepare('SELECT provider_status FROM call_telephone').get().provider_status,'rejected');assert.equal(f.sent.length,1);
});
