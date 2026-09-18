import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleInstaller} from './src/installer-portal.js';
import {setup,call,account,event,signed} from './test-fixture.mjs';
async function withFetch(reply,fn){const sent=[],original=globalThis.fetch;globalThis.fetch=async(url,init)=>{sent.push({url,body:JSON.parse(init.body)});return new Response('{}',{status:reply()});};try{await fn(sent);}finally{globalThis.fetch=original;}}
async function linked(env,db){const reg=await call(env,'/register',account());db.prepare('INSERT INTO installer_telegram VALUES(?,?,?)').run(reg.body.profile.id,'8663681',Date.now());return reg;}
test('una oportunidad nueva llega una sola vez por Telegram al chat vinculado',async()=>{
 const {env,db}=setup();env.TELEGRAM_BOT_TOKEN='test-token';await linked(env,db);await call(env,'/register',account());
 await withFetch(()=>200,async sent=>{
  assert.equal((await handleInstaller(await signed(env,event()),env)).status,202);
  await handleInstaller(await signed(env,event({event_id:crypto.randomUUID()})),env);
  assert.equal(sent.length,1);assert.equal(sent[0].body.chat_id,'8663681');
  assert.ok(sent[0].url.includes('/bottest-token/sendMessage'));assert.match(sent[0].body.text,/nueva oportunidad[\s\S]*Pantalla sin señal[\s\S]*yokup\.com\/instalador/);
  assert.doesNotMatch(sent[0].body.text,/Dirección privada/);
 });
});
test('si Telegram falla se reintenta y sin token no se envía nada',async()=>{
 const {env,db}=setup();await linked(env,db);
 await withFetch(()=>200,async sent=>{await handleInstaller(await signed(env,event()),env);assert.equal(sent.length,0);});
 env.TELEGRAM_BOT_TOKEN='test-token';let status=500;
 await withFetch(()=>status,async sent=>{
  await handleInstaller(await signed(env,event({event_id:crypto.randomUUID()})),env);assert.equal(sent.length,1);
  status=200;await handleInstaller(await signed(env,event({event_id:crypto.randomUUID()})),env);assert.equal(sent.length,2);
  await handleInstaller(await signed(env,event({event_id:crypto.randomUUID()})),env);assert.equal(sent.length,2);
 });
});
