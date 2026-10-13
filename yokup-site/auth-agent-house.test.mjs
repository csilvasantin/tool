import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from './functions/auth/agente.js';
test('agent login uses each current platform API rather than the former Biz mirror',async()=>{
  const old=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,init)=>{calls.push({url:String(url),origin:init.headers.get('Origin')});return new Response('login');};
  try{
    for(const host of ['admira.app','www.admira.app','admira.biz','www.admira.biz','www.yokup.com']){
      await onRequest({request:new Request('https://'+host+'/auth/agente')});
      const apex=host.replace(/^www\./,'');
      assert.deepEqual(calls.at(-1),{url:'https://api.'+apex+'/auth/agente',origin:'https://www.'+apex});
    }
  }finally{globalThis.fetch=old;}
});
