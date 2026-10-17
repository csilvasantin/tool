import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {CONVERSATION_SCHEMA} from './src/agent-conversations.js';
import {handleAgentInvocations,invocationResult} from './src/agent-invocations.js';
function database(){const db=new DatabaseSync(':memory:');return {prepare(sql){let values=[];const statement={bind(...v){values=v;return this;},async run(){return {meta:{changes:Number(db.prepare(sql).run(...values).changes)}};},async first(){return db.prepare(sql).get(...values)||null;},async all(){return {results:db.prepare(sql).all(...values)};}};return statement;},async batch(statements){db.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};}

async function harness(fail=false){
 const conversation=crypto.randomUUID(),env={DB:database(),ADMIRA_TELEGRAM_PANEL_KEY:'server-only-test'},sent=[];
 for(const sql of CONVERSATION_SCHEMA)await env.DB.prepare(sql).run();
 await env.DB.prepare('INSERT INTO agent_conversations(id,owner,title,created_at,updated_at) VALUES(?,?,?,?,?)').bind(conversation,'csilvasantin@gmail.com','Test',Date.now(),Date.now()).run();
 env.TELEGRAM={fetch:async req=>{if(req.method==='POST'){sent.push(await req.json());if(fail)throw Error('network');return Response.json({ok:true,id:123});}return Response.json({ok:true,item:{status:'done',note:'Respuesta real de Oráculo'}});}};
 const call=async(body,id='',email='csilvasantin@gmail.com',thread=conversation)=>{
  const req=new Request('https://api.admira.biz/agents/conversations/'+thread+'/invocations'+(id?'/'+id:''),{method:body?'POST':'GET',body:body?JSON.stringify(body):undefined});
  const res=await handleAgentInvocations(req,env,{requireAuth:async()=>email?{email}:null});return {http:res.status,...await res.json()};
 };return {call,sent,conversation};
}
const body=()=>({request_id:crypto.randomUUID(),target:'oraculo',text:'Hola, ¿quién eres?'});
test('real handoff is delivered once and returns the real reply, never an LLM persona',async()=>{const h=await harness(),b=body();assert.equal((await h.call(b)).state,'waiting');await h.call(b);assert.equal(h.sent.length,1);assert.equal(h.sent[0].target_persona,'Oraculo');assert.equal(h.sent[0].target_machine,'MacMini');assert.equal(h.sent[0].materialize_mission,false);const reply=await h.call(null,b.request_id);assert.equal(reply.state,'complete');assert.equal(reply.answer,'Respuesta real de Oráculo');assert.equal((await h.call({...b,text:'otro'})).http,409);});
test('authentication, Carlos rollout permission, ownership and exact targets fail closed',async()=>{const h=await harness(),b=body();assert.equal((await h.call(b,'',null)).http,401);assert.equal((await h.call(b,'','other@example.com')).http,403);assert.equal((await h.call(b,'','csilvasantin@gmail.com',crypto.randomUUID())).http,404);assert.equal((await h.call({...b,target:'__proto__'})).http,400);assert.equal((await h.call({...b,text:'x'.repeat(2001)})).http,400);assert.equal(h.sent.length,0);assert.equal((await h.call(null,crypto.randomUUID())).http,404);});
test('uncertain delivery cannot replay the real agent action',async()=>{const h=await harness(true),b=body();assert.equal((await h.call(b)).state,'uncertain');assert.equal((await h.call(b)).state,'uncertain');assert.equal(h.sent.length,1);assert.equal((await h.call(null,b.request_id)).state,'uncertain');});
test('waiting, unavailable and closed-without-answer never invent a reply',()=>{assert.equal(invocationResult({status:'pending',note:'unverified'}).answer,null);assert.equal(invocationResult(null).state,'unavailable');assert.match(invocationResult({status:'done'}).message,/no ha adjuntado/);assert.equal(invocationResult({status:'failed'}).state,'failed');});

test('Spanish command language hint is explicit and never imposed on listening audio',async()=>{
 const {handleAgentTranscribe}=await import('./src/agent-conversations.js');const inputs=[];
 const env={AI:{run:async(_,input)=>{inputs.push(input);return {text:'Invoca a Oráculo'};}}};
 for(const hint of [null,'es','invalid']){const headers={'content-type':'audio/wav'};if(hint)headers['x-admirito-language']=hint;const req=new Request('https://api.admira.biz/agents/transcribe',{method:'POST',headers,body:new Uint8Array([1,2])});await handleAgentTranscribe(req,env,{requireAuth:async()=>({email:'a'})});}
 assert.equal(inputs[0].language,undefined);assert.equal(inputs[1].language,'es');assert.equal(inputs[2].language,undefined);
});
