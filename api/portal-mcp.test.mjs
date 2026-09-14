import {test} from 'node:test';
import worker from './src/index.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setup,call,account,event,signed} from './test-fixture.mjs';
import {handleRetailer} from './src/retailer-portal.js';
import {ingestEvent,sweepInstallers} from './src/installer-portal.js';
import {handlePortalMcp,publicManifest} from './src/portal-mcp.js';
import {PORTAL_SCOPES} from './src/portal-credentials.js';
async function retail(env,path,body,cookie,origin='https://www.yokup.com'){
 const r=await handleRetailer(new Request('https://data.yokup.com/api/retailer'+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined}),env);
 return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
async function actor(env,kind,scopes=Object.keys(PORTAL_SCOPES[kind])){
 const transport=kind==='installer'?call:retail;
 const a=await transport(env,'/register',account());assert.equal(a.status,201);
 const token=await transport(env,'/mcp-tokens',{label:'Agente de prueba',scopes,expires_in_days:7},a.cookie);assert.equal(token.status,201);
 return {...a,kind,token:token.body.token,tokenId:token.body.id,transport};
}
async function rpc(env,a,method='tools/list',params={},options={}){
 const message={jsonrpc:'2.0',id:1,method,params},headers={Authorization:'Bearer '+a.token,'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25',...options.headers};
 const req=new Request('https://data.yokup.com/mcp/'+a.kind,{method:options.method||'POST',headers,body:options.method==='GET'?undefined:options.raw??JSON.stringify(message)});
 const r=await handlePortalMcp(req,env,a.kind),raw=await r.text();return {status:r.status,body:raw?JSON.parse(raw):null,headers:r.headers};
}
const invoke=(env,a,name,args={})=>rpc(env,a,'tools/call',{name,arguments:args});
const output=r=>r.body.result.structuredContent;
const key=()=>crypto.randomUUID();
async function ownedDevice(env,a){
 const s=await invoke(env,a,'retailer_site_create',{name:'Comercio prueba',kind:'tobacco',country:'ES',city:'Barcelona',address:'Calle de prueba 12',latitude:41.3874,longitude:2.1686,request_key:key()});assert.equal(s.body.result.isError,false);
 const d=await invoke(env,a,'retailer_device_create',{site_id:output(s).id,name:'Pantalla comercio',skill:'screen',request_key:key()});assert.equal(d.body.result.isError,false);return output(d).id;
}
test('portal tokens are one-time secrets, hashed at rest, bounded and isolated by account and audience',async()=>{
 const {env,db}=setup(),a=await actor(env,'installer'),other=await actor(env,'installer');
 const stored=db.prepare('SELECT * FROM portal_mcp_tokens WHERE id=?').get(a.tokenId);assert.notEqual(stored.token_hash,a.token);assert.equal(stored.token_hash.length,64);
 const listed=await call(env,'/mcp-tokens',undefined,a.cookie);assert.equal(listed.body.tokens.length,1);assert.ok(!JSON.stringify(listed.body).includes(a.token));assert.ok(!JSON.stringify(listed.body).includes('token_hash'));
 assert.equal((await call(env,'/mcp-tokens/'+a.tokenId+'/revoke',{},other.cookie)).status,404);
 assert.equal((await rpc(env,{...a,kind:'retailer'})).status,401);
 assert.equal((await call(env,'/mcp-tokens',{label:'Bad token',scopes:['retailer:ratings']},a.cookie)).status,400);
 assert.equal((await call(env,'/mcp-tokens',{label:'Bad TTL',scopes:['installer:read'],expires_in_days:91},a.cookie)).status,400);
 assert.equal((await call(env,'/mcp-tokens',{label:'CSRF token',scopes:['installer:read']},a.cookie,'POST','https://evil.example')).status,403);
 assert.equal((await call(env,'/mcp-tokens')).status,401);
});
test('revocation and expiration apply to the next MCP call, and another audience cannot be substituted',async()=>{
 const {env,db}=setup(),a=await actor(env,'retailer');assert.equal((await rpc(env,a)).status,200);
 assert.equal((await retail(env,'/mcp-tokens/'+a.tokenId+'/revoke',{},a.cookie)).status,200);assert.equal((await rpc(env,a)).status,401);
 assert.equal((await retail(env,'/mcp-tokens/'+a.tokenId+'/revoke',{},a.cookie)).status,200);
 const b=await actor(env,'installer');db.prepare('UPDATE portal_mcp_tokens SET expires_at=0 WHERE id=?').run(b.tokenId);assert.equal((await rpc(env,b)).status,401);
 const c=await actor(env,'installer');db.prepare("UPDATE portal_mcp_tokens SET audience='https://elsewhere.example/mcp' WHERE id=?").run(c.tokenId);assert.equal((await rpc(env,c)).status,401);
});
test('read-only tools cannot mutate, impersonate an account or access token management through MCP',async()=>{
 const {env,db}=setup(),a=await actor(env,'retailer',['retailer:read']);const list=await rpc(env,a);
 assert.deepEqual(list.body.result.tools.map(t=>t.name),['retailer_whoami','retailer_dashboard']);
 assert.equal((await invoke(env,a,'retailer_device_create',{})).body.error.code,-32602);
 assert.equal((await invoke(env,a,'retailer_dashboard',{account_id:'someone-else'})).body.error.code,-32602);
 assert.equal((await invoke(env,a,'mcp_token_create',{})).body.error.code,-32602);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM retailer_device_links').get().n,0);
 const identity=output(await invoke(env,a,'retailer_whoami'));assert.equal(identity.account_id,a.body.profile.id);assert.equal(identity.account_kind,'retailer');assert.ok(!JSON.stringify(identity).includes(a.token));
});
test('MCP full cycle uses retailer and installer web ownership, rating and proximity rules',async()=>{
 const {env,db}=setup(),retailer=await actor(env,'retailer'),installer=await actor(env,'installer'),outsider=await actor(env,'retailer');const device=await ownedDevice(env,retailer);
 const args={device_id:device,title:'Pantalla no enciende',description:'La pantalla lleva apagada toda la mañana.',priority:'normal',request_key:key()};
 const denied=await invoke(env,outsider,'retailer_incident_create',args);assert.equal(output(denied).http_status,404);
 const created=await invoke(env,retailer,'retailer_incident_create',args);assert.equal(created.body.result.isError,false);const id=output(created).id;
 const inbox=output(await invoke(env,installer,'installer_inbox'));assert.equal(inbox.notifications[0].id,id);
 const before=await invoke(env,retailer,'retailer_intervention_rate',{incident_id:id,stars:5,satisfied:true,comment:'Funciona',request_key:key()});assert.equal(output(before).http_status,409);
 assert.equal((await invoke(env,installer,'installer_accept',{incident_id:id,request_key:key()})).body.result.isError,false);
 assert.equal((await invoke(env,installer,'installer_resolve',{incident_id:id,resolution:'Cable de alimentación sustituido y encendido comprobado.',request_key:key()})).body.result.isError,false);
 const ratingArgs={incident_id:id,stars:2,satisfied:false,comment:'La pantalla vuelve a apagarse tras diez minutos.',request_key:key()};
 const rated=await invoke(env,retailer,'retailer_intervention_rate',ratingArgs);assert.equal(rated.body.result.isError,false);assert.ok(output(rated).followup_id);
 const replay=await invoke(env,retailer,'retailer_intervention_rate',ratingArgs);assert.equal(output(replay).replayed,true);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM retailer_ratings').get().n,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM installer_incidents').get().n,2);
 const web=(await retail(env,'/dashboard',undefined,retailer.cookie)).body;assert.equal(web.incidents.find(i=>i.id===id).stars,2);
 assert.equal((await call(env,'/inbox',undefined,installer.cookie)).body.reputation.average,2);
});
test('idempotent inventory creation handles reordered args, changed payload conflicts and pending receipts',async()=>{
 const {env,db}=setup(),a=await actor(env,'retailer');const args={name:'Local',kind:'other',country:'ES',city:'Barcelona',address:'Dirección propia 12',latitude:41.38,longitude:2.17,request_key:key()};
 const first=output(await invoke(env,a,'retailer_site_create',args));const reversed=Object.fromEntries(Object.entries(args).reverse());
 assert.equal(output(await invoke(env,a,'retailer_site_create',reversed)).id,first.id);assert.equal(db.prepare('SELECT COUNT(*) n FROM retailer_sites').get().n,1);
 assert.equal(output(await invoke(env,a,'retailer_site_create',{...args,name:'Otro local'})).http_status,409);
 db.prepare("UPDATE portal_mcp_requests SET state='pending',result_json=NULL").run();assert.equal(output(await invoke(env,a,'retailer_site_create',args)).outcome,'uncertain');assert.equal(db.prepare('SELECT COUNT(*) n FROM retailer_sites').get().n,1);
});
test('MCP cannot claim outside installer specialty/availability or overwrite another technician repair',async()=>{
 const {env}=setup(),a=await actor(env,'installer');await ingestEvent(await signed(env,event()),env);
 const inbox=output(await invoke(env,a,'installer_inbox')),id=inbox.notifications[0].id;
 const b=await actor(env,'installer');await sweepInstallers(env);await call(env,'/me',account({available:false}),a.cookie,'PATCH');
 assert.equal(output(await invoke(env,a,'installer_accept',{incident_id:id,request_key:key()})).http_status,409);
 assert.equal((await invoke(env,b,'installer_accept',{incident_id:id,request_key:key()})).body.result.isError,false);
 assert.equal(output(await invoke(env,a,'installer_resolve',{incident_id:id,resolution:'No puede modificar una reparación ajena.',request_key:key()})).http_status,409);
});
test('audit is account scoped, omits tokens and descriptions, and records both success and business rejection',async()=>{
 const {env}=setup(),a=await actor(env,'retailer'),b=await actor(env,'retailer');await invoke(env,a,'retailer_dashboard');await invoke(env,a,'retailer_device_create',{site_id:'not-owned',name:'Secret description',skill:'audio',request_key:key()});
 const audit=(await retail(env,'/mcp-audit',undefined,a.cookie)).body;assert.equal(audit.events.length,2);assert.deepEqual(new Set(audit.events.map(e=>e.outcome)),new Set(['success','rejected']));assert.ok(!JSON.stringify(audit).includes(a.token));assert.ok(!JSON.stringify(audit).includes('Secret description'));
 assert.equal((await retail(env,'/mcp-audit',undefined,b.cookie)).body.events.length,0);
});
test('MCP authenticates transport, validates origin/version/envelope, and never executes tool notifications',async()=>{
 const {env,db}=setup(),a=await actor(env,'installer');
 const invalid=await rpc(env,{...a,token:'invalid'});assert.equal(invalid.status,401);assert.match(invalid.headers.get('www-authenticate'),/^Bearer/);assert.equal(invalid.headers.get('cache-control'),'no-store');
 assert.equal((await rpc(env,a,'ping',{}, {headers:{Origin:'https://evil.example'}})).status,403);
 assert.equal((await rpc(env,a,'ping',{}, {headers:{'MCP-Protocol-Version':'future-version'}})).status,400);
 assert.equal((await rpc(env,a,'ping',{}, {headers:{Accept:'text/html'}})).status,406);
 assert.equal((await rpc(env,a,'ping',{}, {method:'GET'})).status,405);
 assert.equal((await rpc(env,a,'ping',{}, {raw:'[]'})).body.error.code,-32600);
 assert.equal((await rpc(env,a,'ping',{}, {raw:'not-json'})).body.error.code,-32700);
 assert.equal((await rpc(env,a,'ping',{}, {raw:' '.repeat(33000)})).status,413);
 const notification=await rpc(env,a,'ping',{}, {raw:JSON.stringify({jsonrpc:'2.0',method:'tools/call',params:{name:'installer_accept',arguments:{incident_id:'fake',request_key:key()}}})});assert.equal(notification.status,400);assert.equal(db.prepare('SELECT COUNT(*) n FROM portal_mcp_audit').get().n,0);
 assert.equal((await rpc(env,a,'ping',{}, {raw:JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})})).status,202);
 const init=await rpc(env,a,'initialize',{protocolVersion:'2025-11-25',clientInfo:{name:'test',version:'1'},capabilities:{}});assert.equal(init.body.result.serverInfo.name,'yokup-installer');assert.equal(init.body.result.protocolVersion,'2025-11-25');
});
test('token call limits return 429 and no business operation runs after throttling',async()=>{
 const {env,db}=setup(),a=await actor(env,'installer');await rpc(env,a);
 db.prepare('UPDATE installer_rate_limits SET count=120 WHERE key=?').run('mcp-call:'+a.tokenId);
 const limited=await invoke(env,a,'installer_accept',{incident_id:'fake',request_key:key()});assert.equal(limited.status,429);assert.equal(limited.headers.get('retry-after'),'60');assert.equal(db.prepare('SELECT COUNT(*) n FROM portal_mcp_audit').get().n,0);
});
test('published manifests are generated from actual tools and explicitly declare manual bearer authorization',()=>{
 for(const kind of ['installer','retailer']){
  const manifest=JSON.parse(readFileSync(new URL('../yokup-site/mcp/'+kind+'.json',import.meta.url),'utf8'));assert.deepEqual(manifest,publicManifest(kind));assert.equal(manifest.authentication.oauth_supported,false);
  assert.ok(manifest.tools.every(t=>t.inputSchema.additionalProperties===false));
 }
});

test('uncertain mutation receipts prevent duplicate work after result persistence fails',async()=>{
 const {env,db}=setup(),a=await actor(env,'retailer');const original=env.DB.prepare;let failOnce=true;
 env.DB.prepare=sql=>{if(sql.startsWith('UPDATE portal_mcp_requests')&&failOnce){failOnce=false;return{bind:()=>({run:async()=>{throw new Error('simulated storage interruption');}})};}return original(sql);};
 const args={name:'Local único',kind:'other',country:'ES',city:'Barcelona',address:'Dirección propia 12',latitude:41.38,longitude:2.17,request_key:key()};
 assert.equal(output(await invoke(env,a,'retailer_site_create',args)).outcome,'uncertain');
 assert.equal(output(await invoke(env,a,'retailer_site_create',args)).outcome,'uncertain');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM retailer_sites').get().n,1);
});

test('public stdio bridge is the same source and never accepts arbitrary hosts',()=>{
 const source=readFileSync(new URL('./tools/portal-mcp-stdio.mjs',import.meta.url),'utf8');
 assert.equal(readFileSync(new URL('../yokup-site/mcp/portal-client.mjs',import.meta.url),'utf8'),source);
 assert.match(source,/redirect:'error'/);assert.match(source,/info.mode&0o077/);
});

async function publicRpc(env,kind,method='tools/list',params={},options={}){
 const message={jsonrpc:'2.0',id:1,method,params},headers={'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25',...options.headers};
 const req=new Request('https://data.yokup.com/mcp/'+kind,{method:options.method||'POST',headers,body:options.method==='GET'?undefined:options.raw??JSON.stringify(message)});
 const r=await handlePortalMcp(req,env,kind),raw=await r.text();return {status:r.status,body:raw?JSON.parse(raw):null,headers:r.headers};
}

test('unauthenticated installer MCP lists installer_register and DEMO alta persists radius_km 40',async()=>{
 const {env}=setup();
 const listed=await publicRpc(env,'installer');
 assert.equal(listed.status,200);
 assert.deepEqual(listed.body.result.tools.map(t=>t.name),['installer_register']);
 assert.equal(listed.body.result.tools[0].public,true);
 const init=await publicRpc(env,'installer','initialize',{protocolVersion:'2025-11-25',clientInfo:{name:'test',version:'1'},capabilities:{}});
 assert.equal(init.body.result.serverInfo.name,'yokup-installer');
 assert.equal((await publicRpc(env,'installer','tools/call',{name:'installer_whoami',arguments:{}})).status,401);
 assert.deepEqual((await publicRpc(env,'retailer')).body.result.tools.map(t=>t.name),[]);
 const args={name:'DEMO MCP Register',email:'smith-mcp-register@example.invalid',password:'correct-horse-battery',country:'ES',city:'Barcelona',lat:41.3874,long:2.1686,radius_km:40,skills:['screen'],language:'es',available:false,notify_zone:true,demo:true,request_key:key()};
 const created=await publicRpc(env,'installer','tools/call',{name:'installer_register',arguments:args});
 assert.equal(created.body.result.isError,false);
 const data=output(created);
 assert.equal(data.http_status,201);
 assert.ok(data.profile.id);
 assert.equal(data.profile.email,'smith-mcp-register@example.invalid');
 assert.equal(data.profile.available,false);
 assert.equal(data.profile.radius_km,40);
 assert.equal(data.profile.demo,true);
 assert.match(data.mcp_token.token,/^ykp_[a-f0-9]{64}$/);
 assert.equal(data.mcp_token.show_once,true);
 assert.ok(!JSON.stringify(data.profile).includes(args.password));
 const replay=output(await publicRpc(env,'installer','tools/call',{name:'installer_register',arguments:args}));
 assert.equal(replay.replayed,true);
 assert.equal(replay.profile.id,data.profile.id);
 assert.equal(replay.mcp_token,undefined);
 const token=data.mcp_token.token;
 const who=output(await rpc(env,{kind:'installer',token},'tools/call',{name:'installer_whoami',arguments:{}}));
 assert.equal(who.account_id,data.profile.id);
 const profile=output(await rpc(env,{kind:'installer',token},'tools/call',{name:'installer_profile',arguments:{}}));
 assert.equal(profile.profile.radius_km,40);
 assert.equal(profile.profile.available,false);
 const missingCoords=await publicRpc(env,'installer','tools/call',{name:'installer_register',arguments:{...args,lat:undefined,long:undefined,request_key:key()}});
 assert.equal(missingCoords.body.error.code,-32602);
});

test('legacy CRUD rejects injected SQL identifiers before touching private portal data',async()=>{
 const {env,db}=setup(),a=await actor(env,'installer');
 db.exec("CREATE TABLE technicians(id TEXT PRIMARY KEY,name TEXT); INSERT INTO technicians VALUES('legacy-1','Original');");
 async function legacy(method,path,payload){return worker.fetch(new Request('https://data.yokup.com/api/'+path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),env);}
 const injected={'name = (SELECT token_hash FROM portal_mcp_tokens LIMIT 1), name':'malicious'};
 assert.equal((await legacy('PATCH','technicians/legacy-1',injected)).status,400);
 assert.equal((await legacy('POST','technicians',{'name) SELECT token_hash FROM portal_mcp_tokens --':'malicious'})).status,400);
 assert.equal(db.prepare('SELECT name FROM technicians').get().name,'Original');
 const valid=await legacy('PATCH','technicians/legacy-1',{name:'Nombre legítimo'});assert.equal(valid.status,200);assert.equal(db.prepare('SELECT name FROM technicians').get().name,'Nombre legítimo');
 assert.equal((await rpc(env,a)).status,200);
 for(const table of ['portal_mcp_tokens','portal_mcp_audit','installer_accounts','retailer_accounts'])assert.equal((await worker.fetch(new Request('https://data.yokup.com/api/'+table),env)).status,404);
});
