import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {handleMcp,hash,TOOLS,FLEET_SCOPES} from './src/mcp.js';
import {handleFleetIncidents} from '../yokup-rtc/src/fleet-incidents.js';
import {claveFlota} from './src/identidad-flota.mjs';
import {handleRequest} from './src/index.js';
const token='ykm_'+'A'.repeat(43), other='ykm_'+'B'.repeat(43), incRead='ykm_'+'C'.repeat(43), fleetSeed='test-only-fleet-seed';
async function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec(await readFile(new URL('./migrations/0001_mcp.sql',import.meta.url),'utf8'));
 db.exec(`CREATE TABLE tickets(id TEXT,subject TEXT,assignee TEXT,loc TEXT,project_id TEXT,status TEXT,created_at INTEGER,updated_at INTEGER,proof_image TEXT);
 CREATE TABLE mission_tasks(mission_id TEXT,code TEXT,title TEXT,status TEXT,owner TEXT,report TEXT,updated_at INTEGER);
 CREATE TABLE fleet_ids(inbox_id INTEGER,mission_id TEXT);
 INSERT INTO tickets VALUES('DCL-own','MCP','OraculoMacMini','MacMini','yokup','in_progress',1,1,NULL),('DCL-foreign','Otro','JobsGrokBot','GrokBot','yokup','in_progress',1,1,NULL),('DCL-private','Privado','OraculoMacMini','MacMini','private','in_progress',1,1,NULL);
 INSERT INTO fleet_ids VALUES(1,'DCL-own'),(2,'DCL-private');`);
 const add=async(t,actor,machine,scopes)=>db.prepare('INSERT INTO yokup_mcp_credentials VALUES(?,?,?,?,?,?,?,NULL)').run(await hash(t),actor,machine,'["yokup"]',JSON.stringify(scopes),1,Date.now()+60000);
 await add(token,'OraculoMacMini','MacMini',[...FLEET_SCOPES]);await add(incRead,'OraculoMacMini','MacMini',['read','incidents']);await add(other,'JobsGrokBot','GrokBot',['read','send']);
 const state={sent:[],calls:[],timeout:false,incidents:[],incidentReply:null};
 const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}})});
 const env={DB:{prepare:stmt},MCP_TELEGRAM_TOKEN:'server-secret',MCP_EXECUTOR_TOKEN:'executor-secret',MCP_FLOTA_SEED:fleetSeed,RTC:{fetch:async(req)=>{
 state.calls.push(req);
 const u=new URL(req.url);
 if(u.pathname.startsWith('/internal/mcp/incidents')) {
  state.incidents.push({method:req.method,path:u.pathname,query:Object.fromEntries(u.searchParams),auth:req.headers.get('authorization'),edge:req.headers.has('cf-connecting-ip'),body:req.method==='POST'?await req.json():null});
  return state.incidentReply?state.incidentReply(u):Response.json({ok:true,id:'INC-X1',url:'https://www.yokup.com/ticket?id=INC-X1',incidents:[]});
 }
 if(u.pathname==='/projects')return Response.json({projects:[
  {id:'yokup',status:'activo',agents:['Oraculo','JobsGrokBot'],machines:['MacMini','GrokBot']},
  {id:'wrong-machine',status:'activo',agents:['Oraculo'],machines:['MacBookPro16']},
  {id:'wrong-agent',status:'activo',agents:['Trinity'],machines:['MacMini']},
  {id:'mbp14',status:'activo',agents:['Neo'],machines:['MacBookProNegro14']},
  {id:'archived',status:'archivado',agents:['Oraculo'],machines:['MacMini']}
 ]});
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
test('individual credential remains authoritative without fleet seed or census',async()=>{
 const h=await setup();delete h.env.MCP_FLOTA_SEED;h.env.RTC.fetch=async()=>{throw new Error('census unavailable')};
 const r=await handleMcp(h.request({jsonrpc:'2.0',id:1,method:'ping'}),h.env);assert.equal(r.status,200);assert.deepEqual((await r.json()).result,{});
});
test('valid fleet key derives exact identity, scopes and projects from current census',async()=>{
 const h=await setup();const key=await claveFlota(fleetSeed,'Oraculo','MacMini');
 const who=await h.call('yokup_whoami',{}, {headers:{Authorization:'Bearer '+key}});
 assert.deepEqual(who.result.structuredContent,{actor:'OraculoMacMini',machine:'MacMini',projects:['yokup'],scopes:['read','inbox','send','work','incidents','incidents:write','itil','itil:write'],expires_at:null});
 assert.ok(!JSON.stringify(who).includes(fleetSeed));assert.ok(!JSON.stringify(who).includes(key));
 const mbp14=await claveFlota(fleetSeed,'Neo','MacBookPro14');
 const neo=await h.call('yokup_whoami',{}, {headers:{Authorization:'Bearer '+mbp14}});
 assert.deepEqual(neo.result.structuredContent.projects,['mbp14']);assert.equal(neo.result.structuredContent.actor,'NeoMBP14');
});
test('missing, invalid or unseeded fleet key fails closed',async()=>{
 const h=await setup(), key=await claveFlota(fleetSeed,'Oraculo','MacMini');
 for(const authorization of ['', 'Bearer '+('Z'.repeat(40)), 'Bearer '+key+'extra']) {
  assert.equal((await handleMcp(h.request({}, {headers:{Authorization:authorization}}),h.env)).status,401);
 }
 delete h.env.MCP_FLOTA_SEED;
 assert.equal((await handleMcp(h.request({}, {headers:{Authorization:'Bearer '+key}}),h.env)).status,401);
});
test('Cypher authenticates independently without inheriting Smith projects',async()=>{
 const h=await setup(), key=await claveFlota(fleetSeed,'Cypher','MacMini');
 const r=await h.call('yokup_whoami',{}, {headers:{Authorization:'Bearer '+key}});
 assert.equal(r.result.structuredContent.actor,'CypherMacMini');
 assert.deepEqual(r.result.structuredContent.projects,[]);
});
test('vendored fleet identity module matches the canonical published checksum',async()=>{
 const source=await readFile(new URL('./src/identidad-flota.mjs',import.meta.url));
 assert.equal(createHash('sha256').update(source).digest('hex'),'acb31b993408e26514a0a08c2748f455788a225a57849b8cbaf46788cee68c9e');
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

test('incidencias: scopes separados; sin ellos ni se listan ni se ejecutan y nada llega a yokup-rtc',async()=>{
 const h=await setup();
 const names=TOOLS.filter(t=>t.scope.startsWith('incidents')).map(t=>t.name);
 assert.deepEqual(names,['yokup_incidents_list','yokup_incident_get','yokup_incident_open','yokup_incident_note','yokup_incident_update','yokup_incidents_close_bulk']);
 const listed=async(tok)=>(await (await handleMcp(h.request({jsonrpc:'2.0',id:1,method:'tools/list'},{headers:{Authorization:'Bearer '+tok}}),h.env)).json()).result.tools.map(t=>t.name);
 const legacy=await listed(other);assert.ok(names.every(n=>!legacy.includes(n)));
 const readOnly=await listed(incRead);
 assert.ok(readOnly.includes('yokup_incidents_list')&&readOnly.includes('yokup_incident_get'));
 assert.ok(!readOnly.some(n=>['yokup_incident_open','yokup_incident_note','yokup_incident_update','yokup_incidents_close_bulk'].includes(n)));
 assert.equal((await h.call('yokup_incidents_list',{},{headers:{Authorization:'Bearer '+other}})).error.code,-32602);
 const write={headers:{Authorization:'Bearer '+incRead}};
 assert.equal((await h.call('yokup_incident_note',{id:'INC-1',text:'x'},write)).error.code,-32602);
 assert.equal((await h.call('yokup_incidents_close_bulk',{ids:['INC-1'],status:'resolved',note:'x'},write)).error.code,-32602);
 assert.equal(h.state.incidents.length,0);
 assert.equal((await h.call('yokup_incidents_list',{state:'todas',limit:5},write)).result.isError,false);
 assert.equal(h.state.incidents.length,1);
});
test('incidencias: el gate firma con la identidad de la credencial y usa el token de ejecutor por el binding',async()=>{
 const h=await setup();
 const open=await h.call('yokup_incident_open',{subject:'Player caído',kind:'screen',severity:'urgente',loc:'alsea-sbux-021'});
 assert.equal(open.result.isError,false);assert.equal(open.result.structuredContent.id,'INC-X1');assert.ok(!('ok' in open.result.structuredContent));
 await h.call('yokup_incidents_list',{state:'resolved',q:'caja',limit:200});
 await h.call('yokup_incident_get',{id:'INC-X1'});
 await h.call('yokup_incident_note',{id:'INC-X1',text:'Reinicio remoto'});
 await h.call('yokup_incident_update',{id:'INC-X1',status:'resolved',note:'Vuelve a emitir'});
 await h.call('yokup_incidents_close_bulk',{ids:['INC-X1','SVC-2'],status:'cancelled',note:'Duplicadas'});
 const c=h.state.incidents;
 assert.deepEqual(c.map(x=>x.method+' '+x.path),['POST /internal/mcp/incidents/open','GET /internal/mcp/incidents','GET /internal/mcp/incidents/get','POST /internal/mcp/incidents/note','POST /internal/mcp/incidents/status','POST /internal/mcp/incidents/bulk-status']);
 assert.ok(c.every(x=>x.auth==='Bearer executor-secret' && !x.edge));
 assert.deepEqual(c[1].query,{state:'resolved',q:'caja',limit:'200'});
 assert.deepEqual(c[2].query,{id:'INC-X1'});
 for(const x of c.filter(x=>x.body)){assert.equal(x.body.actor,'OraculoMacMini');assert.equal(x.body.machine,'MacMini');}
 assert.deepEqual(c[5].body,{ids:['INC-X1','SVC-2'],status:'cancelled',note:'Duplicadas',actor:'OraculoMacMini',machine:'MacMini'});
});
test('incidencias: el cliente no puede suplantar autor ni saltarse límites; resolver exige nota',async()=>{
 const h=await setup();
 for(const [name,args] of [
  ['yokup_incident_open',{subject:'x',kind:'screen',severity:'urgente',actor:'JobsGrokBot'}],
  ['yokup_incident_open',{subject:'x',kind:'pantalla',severity:'urgente'}],
  ['yokup_incident_open',{subject:'x',kind:'screen',severity:'high'}],
  ['yokup_incident_open',{kind:'screen',severity:'alta'}],
  ['yokup_incident_note',{id:'INC-1',text:'x',machine:'GrokBot'}],
  ['yokup_incident_update',{id:'INC-1',status:'blocked'}],
  ['yokup_incidents_list',{state:'abiertas'}],
  ['yokup_incidents_list',{limit:201}],
  ['yokup_incidents_list',{limit:0}],
  ['yokup_incidents_close_bulk',{ids:[],status:'resolved',note:'x'}],
  ['yokup_incidents_close_bulk',{ids:Array.from({length:101},(_,i)=>'INC-'+i),status:'resolved',note:'x'}],
  ['yokup_incidents_close_bulk',{ids:['INC-1'],status:'in_progress',note:'x'}],
  ['yokup_incidents_close_bulk',{ids:['INC-1'],status:'resolved'}],
  ['yokup_incidents_close_bulk',{ids:[7],status:'resolved',note:'x'}]
 ]) assert.equal((await h.call(name,args)).error?.code,-32602,name+' '+JSON.stringify(args));
 for(const status of ['resolved','cancelled']) {
  const r=await h.call('yokup_incident_update',{id:'INC-1',status});
  assert.equal(r.result.isError,true);assert.match(r.result.content[0].text,/note/);
 }
 assert.equal(h.state.incidents.length,0);
 assert.equal((await h.call('yokup_incidents_close_bulk',{ids:Array.from({length:100},(_,i)=>'INC-'+i),status:'resolved',note:'x'})).result.isError,false);
});
test('incidencias: los rechazos de yokup-rtc llegan como isError con su código y sin secretos',async()=>{
 const h=await setup();h.state.incidentReply=()=>Response.json({ok:false,code:'not_an_incident',error:'FLT-1 es una misión'},{status:409});
 const r=await h.call('yokup_incident_update',{id:'FLT-1',status:'resolved',note:'x'});
 assert.equal(r.result.isError,true);assert.match(r.result.content[0].text,/not_an_incident/);assert.ok(!JSON.stringify(r).includes('executor-secret'));
 delete h.env.MCP_EXECUTOR_TOKEN;h.state.incidentReply=null;
 assert.equal((await h.call('yokup_incidents_list',{})).result.isError,true);assert.equal(h.state.incidents.length,1);
});
test('incidencias de extremo a extremo: gate → binding RTC → rutas internas reales (sin borde, con token)',async()=>{
 const h=await setup();
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE tickets(id TEXT PRIMARY KEY,screen TEXT,subject TEXT,loc TEXT,role TEXT,status TEXT,priority TEXT,assignee TEXT,source TEXT,ai_triage TEXT,project TEXT,project_id TEXT,created_at INTEGER,updated_at INTEGER,resolved_at INTEGER);
 CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT,ticket_id TEXT,ts INTEGER,kind TEXT,author TEXT,text TEXT);
 INSERT INTO tickets VALUES('FLT-9','flt-9','Misión','','mission','in_progress','alta','x','fleet','','yokup','yokup',1,1,NULL);`);
 const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}})});
 const rtcEnv={DB:{prepare:stmt},YOKUP_CLI_EXECUTOR_TOKEN:'executor-secret'};
 const addEvent=async(env,id,kind,author,text)=>{db.prepare('INSERT INTO events(ticket_id,ts,kind,author,text) VALUES(?,?,?,?,?)').run(id,Date.now(),kind,author,text);};
 const createIncident=async(env,inc)=>{const id='SVC-'+(db.prepare('SELECT COUNT(*) n FROM tickets').get().n+1);
  db.prepare("INSERT INTO tickets VALUES(?,?,?,?,?,'open',?,'Laura R.',?,'',?,?,1,1,NULL)").run(id,inc.resource,inc.subject,inc.loc,inc.kind,inc.severity,inc.source,'galaxia-admira','galaxia-admira');
  await addEvent(env,id,'log',inc.by,inc.detail);return id;};
 const deps={json:(o,s=200)=>Response.json(o,{status:s}),createIncident,addEvent};
 h.env.RTC={fetch:async(req)=>{const u=new URL(req.url);
  if(u.pathname==='/projects')return Response.json({projects:[{id:'yokup',status:'activo',agents:['Oraculo'],machines:['MacMini']}]});
  return handleFleetIncidents(req,rtcEnv,u,deps);}};
 const open=(await h.call('yokup_incident_open',{subject:'Web caída',kind:'service',severity:'alta'})).result.structuredContent;
 assert.equal(open.author,'OraculoMacMini · MacMini');assert.equal(open.url,'https://www.yokup.com/ticket?id='+open.id);
 assert.deepEqual((await h.call('yokup_incidents_list',{})).result.structuredContent.incidents.map(i=>i.id),[open.id],'la misión no aparece');
 await h.call('yokup_incident_update',{id:open.id,status:'resolved',note:'Vuelve a responder'});
 const got=(await h.call('yokup_incident_get',{id:open.id})).result.structuredContent;
 assert.equal(got.incident.status,'resolved');
 assert.deepEqual(got.events.map(e=>[e.kind,e.author]),[['log','OraculoMacMini · MacMini'],['status','OraculoMacMini · MacMini']]);
 const bulk=await h.call('yokup_incidents_close_bulk',{ids:[open.id,'FLT-9'],status:'cancelled',note:'x'});
 assert.equal(bulk.result.isError,true);assert.match(bulk.result.content[0].text,/invalid_batch/);
 assert.equal(db.prepare("SELECT status FROM tickets WHERE id='FLT-9'").get().status,'in_progress');
 assert.deepEqual(db.prepare('SELECT action FROM mcp_incident_audit ORDER BY id').all().map(r=>r.action),['open','status']);
});
test('emisión ykm_: por defecto sin incidencias; --scopes las pide explícitamente y valida',async()=>{
 const {parseScopes,DEFAULT_SCOPES}=await import('./tools/mcp-credential.mjs');
 assert.deepEqual(parseScopes(undefined),['read','inbox','send','work']);assert.deepEqual(DEFAULT_SCOPES,['read','inbox','send','work']);
 assert.deepEqual(parseScopes('incidents:write,read,incidents,read'),['read','incidents','incidents:write']);
 assert.deepEqual(parseScopes(FLEET_SCOPES.join(',')),[...FLEET_SCOPES]);
 for(const bad of ['incidents:write','read,admin','',' , ']) assert.throws(()=>parseScopes(bad));
});
