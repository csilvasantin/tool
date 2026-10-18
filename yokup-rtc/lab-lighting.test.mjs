import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {handleLabLighting,labLightingDesired} from './src/lab-lighting.js';
const ticket=(id,status,created_at,resolved_at=0)=>({id,status,created_at,resolved_at,updated_at:resolved_at||created_at});
test('five levels and future RGB use actual event order',()=>{
 const open=ticket('a','open',200),close=ticket('a','resolved',200,400);
 assert.equal(labLightingDesired(null,[]).intensity,100);
 assert.equal(labLightingDesired({mascot:'bugito',created_at:100},[]).intensity,25);
 assert.equal(labLightingDesired({mascot:'bugito',created_at:100},[open]).intensity,0);
 assert.equal(labLightingDesired({mascot:'supervisor',created_at:300},[open]).intensity,75);
 assert.equal(labLightingDesired({mascot:'admirito',created_at:300},[]).intensity,50);
 assert.equal(labLightingDesired({mascot:'supervisor',created_at:300},[close]).intensity,100);
 assert.equal(labLightingDesired({mascot:'supervisor',created_at:300},[close,ticket('b','open',250)]).intensity,0);
 assert.equal(labLightingDesired({mascot:'normal',created_at:500},[open]).intensity,0);
 assert.equal(labLightingDesired({mascot:'bugito',created_at:500},[close]).rgb,'red');
});
function harness(){const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE tickets(id TEXT,status TEXT,screen TEXT,created_at INTEGER,updated_at INTEGER,resolved_at INTEGER)');
 const env={DB:{prepare(sql){let values=[];return {bind(...v){values=v;return this},async run(){return db.prepare(sql).run(...values)},async first(){return db.prepare(sql).get(...values)},async all(){return {results:db.prepare(sql).all(...values)}}}}}};
 let session={email:'csilvasantin@gmail.com'};
 return {db,session(x){session=x},async call(body,origin='https://www.admira.app'){return handleLabLighting(new Request('https://api.admira.biz/agents/lab-lighting',{method:body?'POST':'GET',headers:{origin,'content-type':'application/json'},body:body?JSON.stringify(body):undefined}),env,{requireAuth:async()=>session,ensureSchema:async()=>{}})}};
}
const selection=()=>({mascot:'bugito',request_id:crypto.randomUUID()});
test('only owner and scoped phones can control the fixed Lab; no client intensity/target',async()=>{
 const h=harness();h.session(null);assert.equal((await h.call(selection())).status,401);
 h.session({email:'someone@example.com'});assert.equal((await h.call(selection())).status,403);
 h.session({email:'csilvasantin@gmail.com',conversation_device:'phone',conversation_device_label:'Meta Display'});assert.equal((await h.call(selection())).status,403);
 h.session({email:'csilvasantin@gmail.com',conversation_device:'phone',conversation_device_label:'Admirito iOS'});
 assert.equal((await h.call(selection(),'https://evil.example')).status,403);
 assert.equal((await h.call({mascot:'incident',request_id:crypto.randomUUID()})).status,400);
 const response=await h.call({...selection(),intensity:99,light_id:'8'});assert.equal(response.status,200);const d=await response.json();assert.equal(d.intensity,25);assert.equal(d.physical_verified,false);assert.equal(response.headers.get('Access-Control-Allow-Credentials'),'true');
});
test('idempotent selection does not override a later invocation; only Lab tickets counted',async()=>{
 const h=harness(),s=selection();await h.call(s);await h.call({mascot:'supervisor',request_id:crypto.randomUUID()});await h.call(s);
 assert.equal(h.db.prepare('SELECT COUNT(*) n FROM lab_lighting_selections').get().n,2);
 assert.equal((await (await h.call()).json()).state,'supervisor');
 assert.equal((await h.call({...s,mascot:'admirito'})).status,409);
 h.db.prepare('INSERT INTO tickets VALUES(?,?,?,?,?,?)').run('INC-OUT','open','supervisor:other-site:screen',Date.now()+10,Date.now()+10,0);
 assert.equal((await (await h.call()).json()).active_incidents,0);
});
