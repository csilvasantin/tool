import test from 'node:test';import assert from 'node:assert/strict';
import {setup,call,account,event,signed} from './test-fixture.mjs';
import {handleAccess} from './src/portal-access.js';import {handleAdmin} from './src/portal-admin.js';import {handleRetailer} from './src/retailer-portal.js';import {ingestEvent,hash} from './src/installer-portal.js';
const origin='https://www.yokup.com',client='861856772040-e1ri6kpu6maagtb6crdfbb923hsaalgb.apps.googleusercontent.com';
const kp=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',kp.publicKey),kid:'test-key',alg:'RS256',use:'sig'};
const b64=b=>Buffer.from(b).toString('base64url');
async function jwt(nonce,changes={}){const now=Math.floor(Date.now()/1000),claims={iss:'https://accounts.google.com',aud:client,sub:'google-user',email:'csilva@admira.com',email_verified:true,hd:'admira.com',iat:now,exp:now+3600,nonce,...changes};const data=b64(JSON.stringify({alg:'RS256',kid:jwk.kid}))+'.'+b64(JSON.stringify(claims));return data+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',kp.privateKey,new TextEncoder().encode(data)));}
function fixture(){const f=setup(),sent=[];f.env.PORTAL_FETCH=async(url,options)=>{if(url.includes('/certs'))return Response.json({keys:[jwk]});if(url==='https://api.resend.com/emails'){sent.push(JSON.parse(options.body));return Response.json({id:'mail'});}throw Error('Unexpected endpoint');};return {...f,sent};}
async function req(env,path,body,cookie,customOrigin=origin){const admin=path.startsWith('/admin/'),url='https://data.yokup.com/api/portal-'+(admin?'admin'+path.slice(6):'access'+path),r=await(admin?handleAdmin:handleAccess)(new Request(url,{method:body?'POST':'GET',headers:{Origin:customOrigin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined}),env);return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function google(env,route='/google/admin',claims={},kind){const c=await req(env,'/google/challenge',{});const credential=await jwt(c.body.nonce,claims);return {...await req(env,route,{credential,kind},c.cookie),credential,challenge:c};}

test('Google admin requires verified exact Workspace identity, signature, audience, nonce and unused challenge',async()=>{
 const {env}=fixture();assert.equal((await req(env,'/admin/dashboard')).status,401);
 for(const changes of [{email:'other@admira.com'},{email:'csilvasantin@gmail.com',hd:undefined},{hd:undefined},{aud:'other-app'},{email_verified:false},{exp:1},{nonce:'wrong'}])assert.ok((await google(env,'/google/admin',changes)).status>=400);
 const valid=await google(env);assert.equal(valid.status,200);assert.equal((await req(env,'/admin/me',undefined,valid.cookie)).body.email,'csilva@admira.com');
 assert.equal((await req(env,'/google/admin',{credential:valid.credential},valid.challenge.cookie)).status,401);
 const c=await req(env,'/google/challenge',{}),good=await jwt(c.body.nonce);const parts=good.split('.');parts[1]=b64(JSON.stringify({email:'csilva@admira.com'}));assert.equal((await req(env,'/google/admin',{credential:parts.join('.')},c.cookie)).status,401);
 assert.equal((await req(env,'/admin/logout',{},valid.cookie,'https://evil.invalid')).status,403);
 assert.equal((await req(env,'/admin/logout',{},valid.cookie)).status,200);assert.equal((await req(env,'/admin/me',undefined,valid.cookie)).status,401);
});

test('email recovery is generic, one-use, portal scoped and revokes sessions and MCP credentials',async()=>{
 const {env,sent,db}=fixture();env.RESEND_API_KEY='test-only';env.PORTAL_MAIL_FROM='Yokup <acceso@yokup.com>';
 const a=await call(env,'/register',account({email:'reset@example.test'}));const token=await call(env,'/mcp-tokens',{label:'Old token',scopes:['installer:read']},a.cookie);
 const issued=await req(env,'/password/request',{kind:'installer',email:'reset@example.test'}),unknown=await req(env,'/password/request',{kind:'installer',email:'absent@example.test'});
 assert.deepEqual(issued.body,unknown.body);assert.equal(sent.length,1);assert.ok(!JSON.stringify(issued.body).includes('token'));const reset=sent[0].text.match(/#token=([a-f0-9]{64})/)[1];
 assert.equal((await req(env,'/password/complete',{kind:'retailer',token:reset,password:'new-long-password'})).status,400);
 const results=await Promise.all([req(env,'/password/complete',{kind:'installer',token:reset,password:'new-long-password'}),req(env,'/password/complete',{kind:'installer',token:reset,password:'another-password'})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
 assert.equal((await call(env,'/me',undefined,a.cookie)).status,401);assert.ok(db.prepare('SELECT revoked_at FROM portal_mcp_tokens WHERE id=?').get(token.body.id).revoked_at);
 assert.equal((await call(env,'/login',{email:'reset@example.test',password:results[0].status===200?'new-long-password':'another-password'})).status,200);
 assert.equal((await req(env,'/password/complete',{kind:'installer',token:reset,password:'third-password'})).status,400);
});

test('Google recovery requires ownership, supports retailer, rejects unverified external email and expires reset links',async()=>{
 const {env,db}=fixture();const body={name:'Retail Owner',email:'csilva@admira.com',password:'original-password'};
 const r=await handleRetailer(new Request('https://data.yokup.com/api/retailer/register',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}),env);assert.equal(r.status,201);
 const reset=await google(env,'/google/recover',{},'retailer');assert.equal(reset.status,200);
 assert.equal((await req(env,'/password/complete',{kind:'retailer',token:reset.body.token,password:'changed-password'})).status,200);
 const again=await google(env,'/google/recover',{},'retailer');db.prepare('UPDATE portal_password_resets SET expires_at=1').run();assert.equal((await req(env,'/password/complete',{kind:'retailer',token:again.body.token,password:'changed-password'})).status,400);
 assert.equal((await google(env,'/google/recover',{email:'outside@example.test',hd:undefined},'retailer')).status,401);
 assert.equal((await req(env,'/password/request',{kind:'retailer',email:body.email})).status,503);
});

test('superuser matches by specialty and distance; atomic assignment notifies once and audit is idempotent',async()=>{
 const {env,db}=fixture(),admin=await google(env);const near=await call(env,'/register',account({name:'Near',skills:['screen']}));
 await call(env,'/register',account({name:'Unavailable',available:false}));await call(env,'/register',account({name:'Other skill',skills:['hvac']}));await call(env,'/register',account({name:'Far',latitude:40,longitude:-3}));
 await ingestEvent(await signed(env,event()),env);const incident=db.prepare('SELECT id FROM installer_incidents').get();
 const candidates=await req(env,'/admin/candidates?incident_id='+incident.id,undefined,admin.cookie);assert.equal(candidates.status,200);assert.deepEqual(candidates.body.matches.map(a=>a.name),['Near']);
 const dashboard=await req(env,'/admin/dashboard',undefined,admin.cookie);assert.equal(dashboard.body.installers.length,4);assert.ok(!JSON.stringify(dashboard.body).includes('password_hash'));assert.ok(!JSON.stringify(dashboard.body).includes('salt'));
 const body={incident_id:incident.id,installer_id:near.body.profile.id,request_key:'assignment-one'};assert.equal((await req(env,'/admin/assign',body,near.cookie)).status,401);
 const results=await Promise.all([req(env,'/admin/assign',body,admin.cookie),req(env,'/admin/assign',{...body,request_key:'assignment-two'},admin.cookie)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM installer_notifications WHERE installer_id=?').get(near.body.profile.id).n,1);
 const winning=results[0].status===200?body:{...body,request_key:'assignment-two'};assert.equal((await req(env,'/admin/assign',winning,admin.cookie)).body.replayed,true);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM portal_admin_assignments WHERE status='assigned'").get().n,1);
});
