import test from 'node:test';
import assert from 'node:assert/strict';
import {mountCallsGoogle} from './calls-google.mjs';

function fixture(overrides={}){
 const button={},widget={replaceChildren(){}},messages=[],config={},c={google_client_id:'client',nonce:'nonce',state:'portal-calls.state',login_uri:'https://www.yokup.com/auth/callback'};
 mountCallsGoogle({button,widget,status:t=>messages.push(t),load:async()=>({initialize:o=>config.init=o,renderButton:(w,o)=>config.button=o}),begin:async()=>c,...overrides});
 return {button,messages,config,c};
}
test('calls uses top-level Google redirect with nonce/state, without popup or FedCM',async()=>{
 const f=fixture();await f.button.onclick();
 assert.equal(f.config.init.ux_mode,'redirect');assert.equal(f.config.init.use_fedcm_for_button,false);
 assert.equal(f.config.init.nonce,f.c.nonce);assert.equal(f.config.init.login_uri,f.c.login_uri);assert.equal(f.config.button.state,f.c.state);
 assert.equal(f.config.init.callback,undefined);assert.equal(f.button.disabled,false);
 assert.match(f.messages.at(-1),/Elige tu cuenta/);assert.ok(!f.messages.some(t=>/Guardado|verificado/i.test(t)));
});
test('challenge failure remains visible and can be retried, without false success',async()=>{
 let calls=0;const f=fixture({begin:async()=>{calls++;throw Error('No se pudo iniciar el acceso.');}});
 await f.button.onclick();assert.equal(f.messages.at(-1),'No se pudo iniciar el acceso.');assert.equal(f.config.init,undefined);assert.equal(f.button.disabled,false);
 await f.button.onclick();assert.equal(calls,2);
});
test('repeated clicks cannot replace an outstanding challenge',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r),f=fixture({load:()=>pending});
 const first=f.button.onclick();await f.button.onclick();assert.equal(f.messages.length,1);
 resolve({initialize(){},renderButton(){}});await first;assert.equal(f.button.disabled,false);
});
