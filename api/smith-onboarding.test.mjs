import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setup,call,event,signed} from './test-fixture.mjs';
import {handlePortalMcp} from './src/portal-mcp.js';
import {ingestEvent} from './src/installer-portal.js';

test('Smith public batch bootstraps 20 unavailable accounts and verifies each by read-only MCP',async()=>{
 const dataset=JSON.parse(readFileSync(new URL('../yokup-site/mcp/smith-installers-iberia.json',import.meta.url)));
 const {env,db}=setup();assert.equal(dataset.profiles.length,20);
 assert.equal(new Set(dataset.profiles.map(p=>p.email)).size,20);
 assert.equal(dataset.profiles.filter(p=>p.country==='ES').length,14);
 assert.equal(dataset.profiles.filter(p=>p.country==='PT').length,6);
 for(const p of dataset.profiles){
  assert.match(p.name,/^DEMO Smith \d{2} · /);assert.match(p.email,/@example\.invalid$/);assert.equal(p.available,false);assert.ok(!p.password);
  assert.ok(p.latitude>36&&p.latitude<44&&p.longitude>-10&&p.longitude<4);
  const account=await call(env,'/register',{...p,password:crypto.randomUUID()});assert.equal(account.status,201);assert.equal(account.body.profile.available,false);
  const token=await call(env,'/mcp-tokens',{label:'Smith DEMO Iberia',scopes:['installer:read'],expires_in_days:7},account.cookie);assert.equal(token.status,201);
  const invoke=async(method,params)=>{
   const r=await handlePortalMcp(new Request('https://data.yokup.com/mcp/installer',{method:'POST',headers:{Authorization:'Bearer '+token.body.token,'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}),env,'installer');assert.equal(r.status,200);return (await r.json()).result;
  };
  const tools=await invoke('tools/list',{});assert.deepEqual(tools.tools.map(t=>t.name),['installer_whoami','installer_profile','installer_inbox']);
  const result=await invoke('tools/call',{name:'installer_profile',arguments:{}});assert.equal(result.isError,false);
  const profile=result.structuredContent.profile;assert.equal(profile.id,account.body.profile.id);assert.equal(profile.email,p.email);assert.equal(profile.available,false);assert.equal(profile.latitude,p.latitude);assert.equal(profile.longitude,p.longitude);
 }
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM installer_accounts').get().n,20);
 // A real matching notification must not be dispatched to synthetic unavailable accounts.
 await ingestEvent(await signed(env,event({device:{id:'smith-check',name:'Local device',latitude:40.4168,longitude:-3.7038,address:'Local test',skill:'screen',timeout_seconds:120}})),env);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM installer_notifications').get().n,0);
});
