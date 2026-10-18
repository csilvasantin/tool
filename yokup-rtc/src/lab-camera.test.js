import test from 'node:test';
import assert from 'node:assert/strict';
import {handleLabCamera} from './lab-camera.js';
const env={LAB_INSTA360_FRAME_URL:'https://macmini.tail48b61c.ts.net/webcam/test-only/foto.jpg'};
const req=(method='GET',origin='https://www.admira.app')=>new Request('https://api.admira.biz/agents/lab-camera/frame',{method,headers:{Origin:origin}});
const run=(session,fetcher,request=req(),config=env)=>handleLabCamera(request,config,{requireAuth:async()=>session,fetcher});
test('requires an allowed account and paired mobile scope before fetching',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error()};
 for(const [session,status] of [[null,401],[{email:'other@example.com'},403],[{email:'csilvasantin@gmail.com',conversation_device:true,conversation_device_label:'Other'},403]])assert.equal((await run(session,fetcher)).status,status);
 assert.equal(calls,0);
});
test('forwards only a JPEG, strips upstream headers and never caches private frames',async()=>{
 const r=await run({email:'csilvasantin@gmail.com',conversation_device:true,conversation_device_label:'Admirito iOS'},async()=>new Response(new Uint8Array([255,216,255,0]),{headers:{'Content-Type':'image/jpeg','Set-Cookie':'secret','Location':'secret'}}));
 assert.equal(r.status,200);assert.equal(r.headers.get('Set-Cookie'),null);assert.equal(r.headers.get('Location'),null);assert.match(r.headers.get('Cache-Control'),/no-store/);assert.equal(r.headers.get('Access-Control-Allow-Origin'),'https://www.admira.app');
});
test('fails closed for wrong origins, methods, configuration and upstream responses',async()=>{
 const s={email:'csilvasantin@gmail.com'};let count=0;const f=async()=>{count++;return new Response('not a JPEG')};
 assert.equal((await run(s,f,req('GET','https://evil.example'))).status,403);
 assert.equal((await run(s,f,req('POST'))).status,405);
 assert.equal((await run(s,f,req(),{LAB_INSTA360_FRAME_URL:'https://evil.example/'})).status,503);assert.equal(count,0);
 assert.equal((await run(s,f)).status,503);
});

test('redirects are inspected manually for workerd compatibility and never followed',async()=>{
 const r=await run({email:'csilvasantin@gmail.com'},async(url,options)=>{assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://other.example/'}})});
 assert.equal(r.status,503);assert.equal(r.headers.get('Location'),null);
});
