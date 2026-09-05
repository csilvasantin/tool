import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {handleMcp,hash,TOOLS} from './src/mcp.js';
import {handleRequest} from './src/index.js';
const token='ykm_'+'A'.repeat(43), other='ykm_'+'B'.repeat(43);
async function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec(await readFile(new URL('./migrations/0001_mcp.sql',import.meta.url),'utf8'));
 db.exec(`CREATE TABLE tickets(id TEXT,subject TEXT,assignee TEXT,loc TEXT,project_id TEXT,status TEXT,created_at INTEGER,updated_at INTEGER,proof_image TEXT);
 CREATE TABLE mission_tasks(mission_id TEXT,code TEXT,title TEXT,status TEXT,owner TEXT,report TEXT,updated_at INTEGER);
 CREATE TABLE fleet_ids(inbox_id INTEGER,mission_id TEXT);
 INSERT INTO tickets VALUES('DCL-own','MCP','OraculoMacMini','MacMini','yokup','in_progress',1,1,NULL),('DCL-foreign','Otro','JobsGrokBot','GrokBot','yokup','in_progress',1,1,NULL),('DCL-private','Privado','OraculoMacMini','MacMini','private','in_progress',1,1,NULL);
 INSERT INTO fleet_ids VALUES(1,'DCL-own'),(2,'DCL-private');`);
 const add=async(t,actor,machine,scopes)=>db.prepare('INSERT INTO yokup_mcp_credentials VALUES(?,?,?,?,?,?,?,NULL)').run(await hash(t),actor,machine,'["yokup"]',JSON.stringify(scopes),1,Date.now()+60000);
 await add(token,'OraculoMacMini','MacMini',['read','inbox','send','work']);await add(other,'JobsGrokBot','GrokBot',['read','send']);
 const state={sent:[],calls:[],timeout:false};
 const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}})});
 const env={DB:{prepare:stmt},MCP_TELEGRAM_TOKEN:'server-secret',MCP_EXECUTOR_TOKEN:'executor-secret',RTC:{fetch:async(req)=>{
 state.calls.push(req);
 if(new URL(req.url).pathname==='/projects')return Response.json({projects:[{id:'yokup',status:'activo',agents:['Oraculo','JobsGrokBot'],machines:['MacMini','GrokBot']}]});
 return Response.json({ok:true,work_binding:{bound:true},work_activity:{accepted:true}});
 }},TELEGRAM:{fetch:async(req)=>{
 state.calls.push(req);assert.equal(req.headers.get('authorization'),'Bearer server-secret');
 if(req.method==='POST') {state.sent.push(await req.json());if(state.timeout)throw new Error('network token must not leak');return Response.json({ok:true,id:42,owner_verified:true,posted:true,task_id:'task-42',materialize_mission:state.sent.at(-1).materialize_mission});}
 if(req.url.includes('/api/task-status'))return Response.json({ok:true,recipients:{JobsGrokBot:{status:'pending'}},pending:['JobsGrokBot']});
 return Response.json({ok:true,items:[{id:1,target_persona:'Oraculo',target_machine:'MacMini',text:'mine',chat_id:'secret'},{id:2,target_persona:'Oraculo',target_machine:'MacMini',text:'private'},{id:3,target_persona:'Oraculo',target_machine:'MBP16',text:'other machine'}]});
 }}};
 const request=(body,opts={})=>new Request('https://yokup.com/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream',...opts.headers},body:JSON.stringify(body)});
 const call=async(name,args={},opts={})=>(await handleMcp(request({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},opts),env)).json();
 return {db,state,env,request,call};
}
const msg={project_id:'yokup',target_persona:'JobsGrokBot',target_machine:'GrokBot',kind:'message',text:'Consulta técnica',request_key:'unique-1',mission:'DCL-own'};
test('MCP initialize, tools and typed arguments work with authenticated identity',async()=>{
 const h=await setup();const r=await handleMcp(h.request({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'future',capabilities:{},clientInfo:{name:'test',version:'1'}}}),h.env);
 assert.equal((await r.json()).result.protocolVersion,'2025-11-25');
 assert.equal((await h.call('yokup_whoami')).result.structuredContent.actor,'OraculoMacMini');
 const tools=await (await handleMcp(h.request({jsonrpc:'2.0',id:2,method:'tools/list'}),h.env)).json();assert.equal(tools.result.tools.length,TOOLS.length);
 assert.equal((await h.call('yokup_whoami',{owner:'Jobs'})).error.code,-32602);
});
test('missing, expired and revoked credentials fail closed',async()=>{
 const h=await setup();assert.equal((await handleMcp(h.request({}, {headers:{Authorization:'Bearer bad'}}),h.env)).status,401);
 h.db.prepare('UPDATE yokup_mcp_credentials SET expires_at=1').run();assert.equal((await handleMcp(h.request({}),h.env)).status,401);
 h.db.prepare('UPDATE yokup_mcp_credentials SET expires_at=?,revoked_at=1').run(Date.now()+10000);assert.equal((await handleMcp(h.request({}),h.env)).status,401);
});
test('origin, protocol, accept, size and malformed JSON are rejected',async()=>{
 const h=await setup();
 for(const [headers,status] of [[{Origin:'https://evil.test'},403],[{'MCP-Protocol-Version':'bad'},400],[{Accept:'application/json'},406],[{'Content-Type':'text/plain'},415],[{'Content-Length':'40000'},413]])assert.equal((await handleMcp(h.request({}, {headers}),h.env)).status,status);
 const malformed=h.request({});assert.equal((await handleMcp(new Request(malformed,{body:'{' }),h.env)).status,400);
 assert.equal((await handleMcp(h.request([]),h.env)).status,400);
});
test('notifications accepted with empty 202; no execution from tools/call notification',async()=>{
 const h=await setup();const r=await handleMcp(h.request({jsonrpc:'2.0',method:'notifications/initialized'}),h.env);assert.equal(r.status,202);assert.equal(await r.text(),'');
 assert.equal((await handleMcp(h.request({jsonrpc:'2.0',method:'tools/call',params:{name:'yokup_send_message',arguments:msg}}),h.env)).status,400);assert.equal(h.state.sent.length,0);
});
test('real gate routes POST bare and www /mcp, GET SSE 405, browser still HTML',async()=>{
 const h=await setup();h.env.RELEASE_JSON='{}';h.env.ASSETS={fetch:async()=>new Response('documentation')};
 for(const host of ['yokup.com','www.yokup.com'])for(const path of ['/mcp','/mcp/']){
 const r=await handleRequest(new Request('https://'+host+path,h.request({jsonrpc:'2.0',id:1,method:'ping'})),h.env,{});assert.deepEqual((await r.json()).result,{});
 }
 assert.equal((await handleRequest(new Request('https://www.yokup.com/mcp',{headers:{Accept:'text/event-stream'}}),h.env,{})).status,405);
 assert.equal(await (await handleRequest(new Request('https://www.yokup.com/mcp'),h.env,{})).text(),'documentation');
});
test('project and owner isolation prohibit private reads and foreign writes',async()=>{
 const h=await setup();assert.equal((await h.call('yokup_mission',{project_id:'yokup',mission:'DCL-private'})).result.isError,true);
 assert.equal((await h.call('yokup_missions',{project_id:'private'})).result.isError,true);
 assert.equal((await h.call('yokup_task_update',{project_id:'yokup',mission:'DCL-foreign',code:'a',status:'done',report:'no'})).result.isError,true);
 assert.equal(h.state.calls.filter(r=>r.method==='POST').length,0);
});
test('inbox filters exact machine, project and private transport fields without consuming',async()=>{
 const h=await setup();const data=(await h.call('yokup_inbox')).result.structuredContent;assert.equal(data.items.length,1);assert.equal(data.items[0].text,'mine');assert.equal(data.consumed,false);assert.ok(!JSON.stringify(data).includes('secret'));
 assert.equal((await h.call('yokup_claim',{inbox_id:2})).result.isError,true);assert.equal(h.state.sent.length,0);
});
test('message delivery is signed, durable and idempotent even for concurrent replays',async()=>{
 const h=await setup();const calls=await Promise.all([h.call('yokup_send_message',msg),h.call('yokup_send_message',msg)]);assert.equal(h.state.sent.length,1);
 assert.equal(h.state.sent[0].from,'OraculoMacMini');assert.equal(h.state.sent[0].materialize_mission,false);
 const replay=(await h.call('yokup_send_message',msg)).result.structuredContent;assert.equal(replay.inbox_id,42);assert.equal(replay.replayed,true);
 assert.equal((await h.call('yokup_send_message',{...msg,text:'changed'})).result.isError,true);
 const receipt=(await h.call('yokup_delivery',{request_key:msg.request_key})).result.structuredContent;assert.equal(receipt.delivery.recipients.JobsGrokBot.status,'pending');
 assert.equal((await h.call('yokup_delivery',{request_key:msg.request_key},{headers:{Authorization:'Bearer '+other}})).result.isError,true);
});
test('ambiguous transport failure is not retried and reveals no internal error or key',async()=>{
 const h=await setup();h.state.timeout=true;
 const first=await h.call('yokup_send_message',msg);assert.equal(first.result.isError,true);assert.equal(first.result.structuredContent.state,'unknown');
 await h.call('yokup_send_message',msg);assert.equal(h.state.sent.length,1);assert.ok(!JSON.stringify(first).includes('token'));
});
test('recipient and schema validation precede any send; assignment is explicit',async()=>{
 const h=await setup();for(const args of [{...msg,target_persona:'Nobody'},{...msg,target_machine:'MBP16'},{...msg,from:'JobsGrokBot'},{...msg,project_id:'private'}]){
 const r=await h.call('yokup_send_message',args);assert.ok(r.error || r.result.isError);
 }
 assert.equal(h.state.sent.length,0);await h.call('yokup_send_message',{...msg,kind:'assignment'});assert.equal(h.state.sent[0].materialize_mission,true);
});
test('scope restrictions hide and reject write tools; activity keeps authenticated actor and APP',async()=>{
 const h=await setup();assert.ok((await h.call('yokup_activity',{project_id:'yokup',mission:'DCL-own',runtime:'Codex',session_id:'desktop:codex',kind:'implementation',detail:'Implementación real del MCP'})).result.structuredContent.work_binding.bound);
 const req=h.state.calls.find(r=>r.url.endsWith('/fleet/progress'));const body=await req.json();assert.equal(body.owner,'OraculoMacMini');assert.equal(body.work_session.host,'app');assert.equal(req.headers.get('authorization'),'Bearer executor-secret');
 assert.ok((await h.call('yokup_inbox',{}, {headers:{Authorization:'Bearer '+other}})).error);
});
test('twentieth send is allowed, twenty-first fails atomically; existing receipts remain readable',async()=>{
 const h=await setup();for(let i=0;i<20;i++)assert.equal((await h.call('yokup_send_message',{...msg,request_key:'r'+i})).result.structuredContent.state,'queued');
 assert.equal((await h.call('yokup_send_message',{...msg,request_key:'overflow'})).result.isError,true);assert.equal(h.state.sent.length,20);
 assert.equal((await h.call('yokup_send_message',{...msg,request_key:'r0'})).result.structuredContent.replayed,true);
});
test('CORS is present on allowed authenticated responses and a streamed oversized body fails',async()=>{
 const h=await setup();const r=await handleMcp(h.request({jsonrpc:'2.0',id:1,method:'ping'},{headers:{Origin:'https://www.yokup.com'}}),h.env);assert.equal(r.headers.get('Access-Control-Allow-Origin'),'https://www.yokup.com');
 assert.equal((await handleMcp(h.request({padding:'x'.repeat(33000)}),h.env)).status,413);
 assert.equal((await h.call('yokup_send_message',{...msg,target_persona:'JobsImpostor'})).result.isError,true);
});
test('public manifest schemas and bridge are the exact server contract',async()=>{
 const m=JSON.parse(await readFile(new URL('../yokup-site/mcp/manifest.json',import.meta.url)));
 assert.deepEqual(m.mcp_server.tools,TOOLS.map(({scope,...tool})=>({...tool,required_scope:scope})));
 assert.equal(await readFile(new URL('../yokup-site/mcp/client.mjs',import.meta.url),'utf8'),await readFile(new URL('./tools/mcp-stdio.mjs',import.meta.url),'utf8'));
});
