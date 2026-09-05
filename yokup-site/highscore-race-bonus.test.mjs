import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {create}=createRequire(import.meta.url)('./highscore-race-bonus.js');
const race={id:'race1',started_at:1,finish_at:23001,ends_at:42001,server_now:100,bonus_points:1,roster:[{agent:'OraculoMacMini',reference:'M1'}]};
const receipt={ok:true,awarded:true,race_id:'race1',mission_id:'M1',agent:'OraculoMacMini',points:1};
const response=data=>({ok:true,json:async()=>data});
test('official order and +1 only after a server receipt; repeated frames do not send duplicate claims',async()=>{
  const calls=[];const bonus=create({endpoint:'/race',fetch:async(_url,req)=>{const body=JSON.parse(req.body);calls.push(body);return response(body.action==='start'?{ok:true,race}:receipt);}});
  assert.equal(bonus.order('oraculomacmini','M1'),null);
  await bonus.start();assert.equal(bonus.order('oraculomacmini','M1'),1);assert.equal(bonus.order('neo','M1'),999);
  assert.equal(await bonus.finish('neo','M1'),null);assert.equal(await bonus.finish('oraculomacmini','different'),null);
  const results=await Promise.all([bonus.finish('oraculomacmini','M1'),bonus.finish('oraculomacmini','M1')]);
  assert.ok(results.some(x=>x?.points===1));
  await bonus.finish('oraculomacmini','M1');assert.equal(calls.filter(x=>x.action==='finish').length,1);
  assert.deepEqual(calls[1],{action:'finish',race_id:'race1'});
});
test('offline or rejected award never shows an invented +1',async()=>{
  const bonus=create({endpoint:'/race',fetch:async(_url,req)=>JSON.parse(req.body).action==='start'?response({ok:true,race}):response({ok:true,awarded:false})});
  await bonus.start();assert.equal(await bonus.finish('oraculomacmini','M1'),null);
  const offline=create({endpoint:'/race',fetch:async()=>{throw Error('offline');}});
  assert.equal(await offline.start(),null);assert.equal(await offline.finish('oraculomacmini','M1'),null);
});
test('an earlier asynchronous response cannot replace the next race or award it',async()=>{
  let complete;
  const bonus=create({endpoint:'/race',fetch:async(_url,req)=>JSON.parse(req.body).action==='start'?response({ok:true,race}):new Promise(resolve=>complete=()=>resolve(response(receipt)))});
  await bonus.start();const pending=bonus.finish('oraculomacmini','M1');await bonus.start();complete();assert.equal(await pending,null);
});

test('an incompatible race response cannot start a rewarded race',async()=>{
  const bonus=create({endpoint:'/race',fetch:async()=>response({ok:true,race:{...race,finish_at:27001}})});
  assert.equal(await bonus.start(),null);assert.equal(bonus.order('oraculomacmini','M1'),null);
});
