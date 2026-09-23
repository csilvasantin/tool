import test from 'node:test';
import assert from 'node:assert/strict';
import {authProxy} from './src/auth-proxy.js';
const state='portal-calls.'+'a'.repeat(64);
function request(s=state,csrf='test'){return new Request('https://www.yokup.com/auth/callback',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Cookie:'g_csrf_token=test'},body:new URLSearchParams({credential:'signed-google-id-token',state:s,g_csrf_token:csrf})});}
test('portal callbacks reach portal validation; fleet remains on existing backend',async()=>{
 for(const [s,expected] of [[state,'https://data.yokup.com/api/portal-access/google/redirect-callback'],['fleet-state','https://api.yokup.com/auth/callback']]){
  let target,body;const r=await authProxy(request(s),async(url,init)=>{target=url;body=init;return new Response(null,{status:303,headers:{Location:'https://data.yokup.com/complete'}});});
  assert.equal(target,expected);assert.equal(body.headers.Cookie,'g_csrf_token=test');assert.equal(new URLSearchParams(body.body).get('state'),s);assert.equal(body.redirect,'manual');assert.equal(r.status,303);assert.equal(r.headers.get('cache-control'),'no-store');
 }
});
test('invalid CSRF never reaches either identity backend',async()=>{
 let called=false;const r=await authProxy(request(state,'wrong'),async()=>{called=true;});assert.equal(r.status,403);assert.equal(called,false);
});
