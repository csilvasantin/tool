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

async function login(env,kind,intent,claims={}){const c=await req(env,'/google/challenge',{});return req(env,'/google/login',{kind,intent,credential:await jwt(c.body.nonce,claims)},c.cookie);}
const identity=(email='professional@gmail.com')=>({email,hd:undefined,sub:'sub-'+email,name:'Google Test'});
test('Google routes the owner from register/login in either portal and only server roles grant admin',async()=>{
 const {env,db}=fixture();for(const kind of ['installer','retailer'])for(const intent of ['register','login']){const r=await login(env,kind,intent);assert.equal(r.status,200);assert.equal(r.body.role,'superuser');assert.equal(r.body.redirect,'/superusuario');assert.equal((await req(env,'/admin/dashboard',undefined,r.cookie)).status,200);}
 assert.equal(db.prepare('SELECT count(*) n FROM installer_accounts').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM retailer_accounts').get().n,0);
 const c=await req(env,'/google/challenge',{});const forged=await req(env,'/google/login',{kind:'retailer',intent:'register',role:'superuser',email:'csilva@admira.com',credential:await jwt(c.body.nonce,identity())},c.cookie);assert.equal(forged.body.needs_profile,true);assert.equal(forged.body.role,undefined);assert.equal((await req(env,'/admin/dashboard',undefined,forged.cookie)).status,401);
 assert.ok((await login(env,'retailer','login',{hd:undefined})).status>=400);
});
test('Google creates both account types without password and logs back in to isolated portal sessions',async()=>{
 for(const kind of ['installer','retailer']){const {env,db}=fixture(),claims=identity(),pending=await login(env,kind,'register',claims);assert.equal(pending.body.needs_profile,true);
 const data={...account(),kind,ticket:pending.body.ticket,email:'attacker@gmail.com',role:'superuser'};delete data.password;
 const registered=await req(env,'/google/register',data,pending.cookie);assert.equal(registered.status,201);assert.equal(registered.body.profile.email,claims.email);assert.equal(registered.body.role,kind);assert.equal(registered.body.profile.password_hash,undefined);
 const me=kind==='installer'?await call(env,'/me',undefined,registered.cookie):await (async()=>{const r=await handleRetailer(new Request('https://data.yokup.com/api/retailer/me',{headers:{Cookie:registered.cookie}}),env);return {status:r.status,body:await r.json()};})();assert.equal(me.status,200);assert.equal(me.body.profile.id,registered.body.profile.id);
 assert.equal((await req(env,'/google/register',data,pending.cookie)).status,401);
 for(const intent of ['login','register']){const r=await login(env,kind,intent,claims);assert.equal(r.status,200);assert.equal(r.body.profile.id,registered.body.profile.id);assert.equal(r.body.needs_profile,undefined);}
 assert.equal(db.prepare(`SELECT count(*) n FROM ${kind==='installer'?'installer_accounts':'retailer_accounts'}`).get().n,1);
 assert.equal((await req(env,'/admin/dashboard',undefined,registered.cookie)).status,401);
 }
});
test('Signup validates installer details and rejects stolen, expired, wrong-kind or concurrently reused tickets',async()=>{
 const {env,db}=fixture(),p=await login(env,'installer','register',identity());
 const data={...account(),kind:'installer',ticket:p.body.ticket};assert.equal((await req(env,'/google/register',{kind:'installer',ticket:p.body.ticket},p.cookie)).status,400);
 assert.equal((await req(env,'/google/register',data)).status,401);
 assert.equal((await req(env,'/google/register',{...data,kind:'retailer'},p.cookie)).status,401);
 const results=await Promise.all([req(env,'/google/register',data,p.cookie),req(env,'/google/register',data,p.cookie)]);assert.equal(results.filter(r=>r.status===201).length,1);assert.equal(db.prepare('SELECT count(*) n FROM installer_accounts').get().n,1);
 const expired=await login(env,'retailer','register',identity('expired@gmail.com'));db.exec('UPDATE portal_google_signup SET expires_at=1');assert.equal((await req(env,'/google/register',{kind:'retailer',ticket:expired.body.ticket,name:'Test'},expired.cookie)).status,401);
});
test('Existing accounts link to authoritative Google identity without duplicating and cannot be rebound',async()=>{
 const {env,db}=fixture(),claims=identity();const created=await call(env,'/register',account({email:claims.email}));
 const r=await login(env,'installer','login',claims);assert.equal(r.status,200);assert.equal(r.body.profile.id,created.body.profile.id);
 assert.equal((await login(env,'installer','login',{...claims,sub:'other-sub'})).status,403);
 assert.equal((await login(env,'retailer','login',claims)).status,404);
 assert.equal(db.prepare('SELECT count(*) n FROM installer_accounts').get().n,1);
});
test('Only owner grants roles; assigned Google superusers enter automatically and revocation ends access immediately',async()=>{
 const {env,db}=fixture(),owner=await login(env,'retailer','login'),claims=identity('admin@gmail.com');
 assert.equal((await req(env,'/admin/superusers',{action:'grant',email:claims.email})).status,401);
 assert.equal((await req(env,'/admin/superusers',{action:'grant',email:claims.email},owner.cookie,'https://evil.test')).status,403);
 assert.equal((await req(env,'/admin/superusers',{action:'grant',email:claims.email},owner.cookie)).status,200);
 const admin=await login(env,'installer','register',claims);assert.equal(admin.body.role,'superuser');assert.equal((await req(env,'/admin/dashboard',undefined,admin.cookie)).status,200);
 assert.equal((await req(env,'/admin/superusers',{action:'grant',email:'third@gmail.com'},admin.cookie)).status,403);
 assert.equal((await req(env,'/admin/superusers',{action:'revoke',email:'csilva@admira.com'},owner.cookie)).status,400);
 assert.equal((await login(env,'retailer','login',{...claims,sub:'replaced-sub'})).status,403);
 assert.equal((await req(env,'/admin/superusers',{action:'revoke',email:claims.email},owner.cookie)).status,200);
 assert.equal((await req(env,'/admin/dashboard',undefined,admin.cookie)).status,401);
 assert.equal((await login(env,'retailer','login',claims)).status,404);
 assert.equal(db.prepare('SELECT count(*) n FROM portal_role_audit').get().n,2);
});
