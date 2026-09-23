import test from 'node:test';import assert from 'node:assert/strict';
import {setup,call,account,event,signed} from './test-fixture.mjs';
import {handleAccess} from './src/portal-access.js';import {handleAdmin} from './src/portal-admin.js';import {handleRetailer} from './src/retailer-portal.js';import {ingestEvent,hash} from './src/installer-portal.js';
const origin='https://www.yokup.com',client='861856772040-e1ri6kpu6maagtb6crdfbb923hsaalgb.apps.googleusercontent.com';
const kp=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',kp.publicKey),kid:'test-key',alg:'RS256',use:'sig'};
const b64=b=>Buffer.from(b).toString('base64url');
async function jwt(nonce,changes={}){const now=Math.floor(Date.now()/1000),claims={iss:'https://accounts.google.com',aud:client,sub:'google-user',email:'csilva@admira.com',email_verified:true,hd:'admira.com',iat:now,exp:now+3600,nonce,...changes};const data=b64(JSON.stringify({alg:'RS256',kid:jwk.kid}))+'.'+b64(JSON.stringify(claims));return data+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',kp.privateKey,new TextEncoder().encode(data)));}
function fixture(){const f=setup(),sent=[];f.env.PORTAL_FETCH=async(url,options)=>{if(url.includes('/certs'))return Response.json({keys:[jwk]});if(url==='https://api.resend.com/emails'){sent.push(JSON.parse(options.body));return Response.json({id:'mail'});}throw Error('Unexpected endpoint');};return {...f,sent};}

import {handleCalls} from './src/calls.js';
async function begin(env,originOverride=origin){const r=await handleAccess(new Request('https://data.yokup.com/api/portal-access/google/redirect-challenge',{method:'POST',headers:{Origin:originOverride,'Content-Type':'application/json'},body:'{}'}),env);return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function callback(env,c,changes={},csrf='csrf'){return handleAccess(new Request('https://data.yokup.com/api/portal-access/google/redirect-callback',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded',Cookie:'g_csrf_token=csrf'},body:new URLSearchParams({state:c.body.state,g_csrf_token:csrf,credential:await jwt(c.body.nonce,changes)})}),env);}
async function complete(env,url,cookie){return handleAccess(new Request(url,{headers:cookie?{Cookie:cookie}:{}}),env);}
function failed(r){assert.equal(r.status,303);assert.match(r.headers.get('location'),/google_error=/);assert.doesNotMatch(r.headers.get('set-cookie')||'',/yk_portal_admin|yk_retailer_session/);}
test('redirect authenticates original browser, creates existing admin session and returns to calls',async()=>{
 const {env}=fixture(),c=await begin(env);assert.equal(c.status,200);
 const cb=await callback(env,c);assert.equal(cb.status,303);const handoff=cb.headers.get('location');assert.match(handoff,/^https:\/\/data.yokup.com\/api\/portal-access\/google\/redirect-complete\?code=/);
 failed(await complete(env,handoff));failed(await complete(env,handoff,'__Host-yk_portal_redirect='+'a'.repeat(64)));
 const ok=await complete(env,handoff,c.cookie);assert.equal(ok.headers.get('location'),origin+'/llamadas');assert.equal(ok.headers.get('cache-control'),'no-store');assert.equal(ok.headers.get('referrer-policy'),'no-referrer');
 const session=ok.headers.getSetCookie().find(x=>x.startsWith('__Host-yk_portal_admin=')).split(';')[0];
 const access=await handleAdmin(new Request('https://data.yokup.com/api/portal-admin/dashboard',{headers:{Cookie:session}}),env);assert.equal(access.status,200);
 failed(await complete(env,handoff,c.cookie));failed(await callback(env,c));
});
test('redirect rejects bad origin, CSRF, signature, nonce and expired challenge',async()=>{
 const {env,db}=fixture();assert.equal((await begin(env,'https://evil.test')).status,403);
 const c=await begin(env);failed(await callback(env,c,{},'wrong'));failed(await callback(env,c,{nonce:'wrong'}));failed(await callback(env,c,{aud:'wrong'}));failed(await callback(env,c,{email_verified:false}));
 db.exec('UPDATE portal_google_redirects SET expires_at=1');failed(await callback(env,c));
 assert.equal(db.prepare('SELECT count(*) n FROM portal_admin_sessions').get().n,0);
});
test('redirect never grants roles or creates accounts for an unknown Google identity',async()=>{
 const {env,db}=fixture(),c=await begin(env),cb=await callback(env,c,{email:'unassigned@gmail.com',hd:undefined,sub:'outsider'});
 const result=await complete(env,cb.headers.get('location'),c.cookie);failed(result);assert.match(result.headers.get('location'),/account_required/);
 assert.equal(db.prepare('SELECT count(*) n FROM retailer_accounts').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM portal_admin_sessions').get().n,0);
});
test('expired handoff cannot issue a session and identity is cleared on consumption',async()=>{
 const {env,db}=fixture(),c=await begin(env),cb=await callback(env,c);db.exec('UPDATE portal_google_redirects SET handoff_expires_at=1');failed(await complete(env,cb.headers.get('location'),c.cookie));
 const fresh=await begin(env),next=await callback(env,fresh);await complete(env,next.headers.get('location'),fresh.cookie);
 const row=db.prepare('SELECT identity_json,used_at FROM portal_google_redirects WHERE used_at IS NOT NULL').get();assert.equal(row.identity_json,null);assert.ok(row.used_at);
});
test('two callbacks/completions issue at most one session',async()=>{
 const {env,db}=fixture(),c=await begin(env);const attempts=await Promise.all([callback(env,c),callback(env,c)]);const ok=attempts.filter(r=>r.headers.get('location').startsWith('https://data.yokup.com/'));assert.equal(ok.length,1);
 const results=await Promise.all([complete(env,ok[0].headers.get('location'),c.cookie),complete(env,ok[0].headers.get('location'),c.cookie)]);assert.equal(results.filter(r=>r.headers.get('location')===origin+'/llamadas').length,1);assert.equal(db.prepare('SELECT count(*) n FROM portal_admin_sessions').get().n,1);
});
test('an existing retailer can sign in but does not gain operator rights',async()=>{
 const {env,db}=fixture();const email='retailer@gmail.com';
 const registered=await handleRetailer(new Request('https://data.yokup.com/api/retailer/register',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email,name:'Retailer Test',password:'correct-horse-battery'})}),env);assert.equal(registered.status,201);
 const c=await begin(env),cb=await callback(env,c,{email,hd:undefined,sub:'retailer-sub'}),ok=await complete(env,cb.headers.get('location'),c.cookie);
 assert.equal(ok.headers.get('location'),origin+'/llamadas');const session=ok.headers.getSetCookie().find(x=>!x.startsWith('__Host-yk_portal_redirect=')).split(';')[0];
 const access=await handleCalls(new Request('https://data.yokup.com/api/calls/me',{headers:{Cookie:session}}),env);assert.equal(access.status,403);
 assert.equal(db.prepare('SELECT count(*) n FROM call_operators').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM portal_admin_sessions').get().n,0);
});
