import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './test-fixture.mjs';
import {handleCalls} from './src/calls.js';
import {hash} from './src/installer-portal.js';
import {startTelegram,receiveTelegramDemo,flushTelegramDemo,applyTelegramAnswer,telegramWorkerRoute,telegramAnswer} from './src/calls-telegram.js';
import {routerInitial,ROUTER_TITLE} from './src/calls-router.js';
import {telegramPrompt} from './src/calls-telegram-prompts.js';
async function fixture(){
 const f=setup();f.env.TELEGRAM_BOT_TOKEN='test-token';f.env.TELEGRAM_DEMO_SECRET='private-worker-secret';f.sent=[];
 f.env.TELEGRAM_FETCH=async(url,init)=>{f.sent.push({url,body:JSON.parse(init?.body||'{}')});return Response.json({ok:true,result:url.endsWith('/getMe')?{username:'TestBot'}:{message_id:f.sent.length}});};
 f.db.prepare("INSERT INTO telegram_state VALUES('demo_worker',?)").run(String(Date.now()));
 f.db.prepare("INSERT INTO call_cases(id,title,site_name,latitude,longitude,skill,is_test,created_by,created_at) VALUES(?,?,'Demo',0,0,'network',1,'admin@test',?)").run('router:test',ROUTER_TITLE,Date.now());
 f.c=f.db.prepare('SELECT * FROM call_cases').get();f.a={admin:true,email:'admin@test'};
 f.link=await startTelegram(f.env,f.a,f.c);f.code=new URL(f.link.url).searchParams.get('start');return f;
}
const message=(id,text,extra={})=>({update_id:id,message:{message_id:id,chat:{id:42,type:'private'},from:{id:42},text,...extra}});
async function begin(f){await receiveTelegramDemo(f.env,message(1,'/start '+f.code));await flushTelegramDemo(f.env);}
test('private single-use link, web admin, live worker and synthetic router are required',async()=>{
 const f=await fixture();assert.equal((await startTelegram(f.env,f.a,f.c)).id,f.link.id);
 await assert.rejects(startTelegram(f.env,{...f.a,tokenId:'x'},f.c),{status:403});
 await assert.rejects(startTelegram(f.env,f.a,{...f.c,is_test:0}),{status:409});
 await receiveTelegramDemo(f.env,message(1,'/start '+f.code,{chat:{id:-1,type:'group'}}));assert.equal(f.db.prepare('SELECT chat_id FROM call_telegram').get().chat_id,null);
 await begin(f);assert.equal(f.db.prepare('SELECT chat_id FROM call_telegram').get().chat_id,'42');
 await receiveTelegramDemo(f.env,message(2,'/start '+f.code,{chat:{id:43,type:'private'},from:{id:43}}));assert.equal(f.db.prepare('SELECT chat_id FROM call_telegram').get().chat_id,'42');
 f.db.prepare("UPDATE telegram_state SET value='0' WHERE key='demo_worker'").run();await assert.rejects(startTelegram(f.env,f.a,f.c),{status:503});
});
test('five confirmed answers create one result; no phone, ticket closure or installer notification',async()=>{
 const f=await fixture();await begin(f);let i=2;
 for(const text of ['sí','listo','listo','sí','sí']){await receiveTelegramDemo(f.env,message(i,text));await receiveTelegramDemo(f.env,message(i,text));await flushTelegramDemo(f.env);i++;}
 const s=f.db.prepare('SELECT * FROM call_telegram').get();assert.ok(s.ended_at);assert.equal(JSON.parse(s.state).outcome,'agreed');
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM call_events WHERE kind='telegram_demo_result'").get().n,1);
 assert.equal(f.db.prepare('SELECT stage FROM call_cases').get().stage,'open');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM call_attempts').get().n,0);
 assert.equal(f.sent.filter(s=>s.url.endsWith('sendVoice')).length,6);assert.ok(f.sent.every(s=>s.url.startsWith('https://api.telegram.org/')));
});
test('voice lease authenticates download/result and stale transcripts cannot answer another turn',async()=>{
 const f=await fixture();await begin(f);
 await receiveTelegramDemo(f.env,message(2,undefined,{voice:{file_id:'voice-one',duration:3,file_size:100}}));
 await receiveTelegramDemo(f.env,message(3,undefined,{voice:{file_id:'voice-two',duration:3,file_size:100}}));
 const req=(path,body={},lease,token=f.env.TELEGRAM_DEMO_SECRET)=>new Request('https://data.yokup.com/api/calls/telegram-worker'+path,{method:'POST',headers:{Authorization:'Bearer '+token,...(lease?{'x-job-lease':lease}:{})},body:JSON.stringify(body)});
 await assert.rejects(telegramWorkerRoute(req('/job',{},null,'wrong'),f.env,'/job',()=>{}),{status:401});
 const {job}=await (await telegramWorkerRoute(req('/job'),f.env,'/job',()=>{})).json();assert.equal(job.id,2);
 await assert.rejects(telegramWorkerRoute(req('/result/2',{transcript:'sí'},'bad'),f.env,'/result/2',()=>{}),{status:409});
 await telegramWorkerRoute(req('/result/2',{transcript:'sí',uncertain:false},job.lease),f.env,'/result/2',()=>{});
 await applyTelegramAnswer(f.env,3,'sí',false);assert.equal(JSON.parse(f.db.prepare('SELECT state FROM call_telegram').get().state).step,'off');assert.equal(f.db.prepare('SELECT status FROM call_telegram_inbox WHERE update_id=3').get().status,'expired');
});
test('uncertain voice cannot consent; text cancellation and silence require review',async()=>{
 const f=await fixture();await begin(f);
 await receiveTelegramDemo(f.env,message(2,undefined,{voice:{file_id:'v',duration:1,file_size:100}}));await applyTelegramAnswer(f.env,2,'1',true);await flushTelegramDemo(f.env);
 let s=JSON.parse(f.db.prepare('SELECT state FROM call_telegram').get().state);assert.equal(s.step,'consent');assert.equal(s.retries,1);
 await receiveTelegramDemo(f.env,message(3,'cancelar'));s=JSON.parse(f.db.prepare('SELECT state FROM call_telegram').get().state);assert.equal(s.outcome,'human_handoff');
 assert.match(telegramPrompt({step:'on'}),/Espera treinta segundos/);assert.doesNotMatch(telegramPrompt({step:'on'}),/Ya han pasado/);
});
test('API denies unauthenticated access to linking and scoped worker endpoints',async()=>{
 const f=await fixture();for(const path of ['/cases/router%3Atest/telegram-demo','/telegram-worker/job']){
  const r=await handleCalls(new Request('https://data.yokup.com/api/calls'+path,{method:'POST',headers:{Origin:'https://www.yokup.com'},body:'{}'}),f.env);assert.equal(r.status,401);
 }
});
test('failed send retries once pending; a delivered note is not sent again',async()=>{
 const f=await fixture();await receiveTelegramDemo(f.env,message(1,'/start '+f.code));const fetch=f.env.TELEGRAM_FETCH;f.env.TELEGRAM_FETCH=async()=>Response.json({ok:false},{status:503});await flushTelegramDemo(f.env);assert.equal(f.db.prepare('SELECT sent_at FROM call_telegram_outbox').get().sent_at,null);
 f.env.TELEGRAM_FETCH=fetch;await flushTelegramDemo(f.env);await flushTelegramDemo(f.env);assert.equal(f.sent.filter(s=>s.url.endsWith('sendVoice')).length,1);
});
test('natural short answers are step-specific; mixed or negative speech is not coerced into consent',()=>{
 assert.equal(telegramAnswer('consent','Sí, quiero continuar.'),'si');
 assert.equal(telegramAnswer('off','He apagado el rúter.'),'si');
 assert.equal(telegramAnswer('restored','No ha vuelto internet.'),'no');
 assert.notEqual(telegramAnswer('consent','Sí, pero no puedo.'),'si');
 assert.notEqual(telegramAnswer('consent','He apagado el router.'),'si');
});
