import test from 'node:test';import assert from 'node:assert/strict';
import {PROFILES,SCENARIOS,buildStory,stateAt,applyEvent,initialState,estimateCost,dialogueText} from './calls-demo-model.mjs';
test('all demo scenarios terminate honestly and only satisfaction closes the case',()=>{
 for(const name of Object.keys(SCENARIOS)){const story=buildStory(name),s=stateAt(story,story.length-1);assert.equal(s.closed,name!=='handoff');assert.equal(s.status,name==='handoff'?'human_handoff':'closed');assert.equal(s.history.at(-1).kind,name==='handoff'?'handoff':'satisfied');}
 assert.throws(()=>applyEvent(initialState(),{kind:'satisfied',stage:5}),/reparación/);
});
test('rescheduling resets both acceptances and an old yes cannot confirm a new version',()=>{
 const story=buildStory('reschedule'),n=story.findIndex(e=>e.kind==='proposal'&&e.version===2),before=stateAt(story,n-1),after=stateAt(story,n);
 assert.equal(before.acceptances.installer,true);assert.deepEqual(after.acceptances,{retailer:false,installer:false});assert.equal(after.status,'proposed');
 assert.throws(()=>applyEvent(after,{kind:'accept_retailer',stage:3,version:1}),/vigente/);
 const one=applyEvent(after,{kind:'accept_retailer',stage:3,version:2});assert.equal(one.status,'proposed');assert.equal(applyEvent(one,{kind:'accept_installer',stage:3,version:2}).status,'scheduled');
});
test('no answer schedules a retry, and unsatisfied retailer creates a review before closure',()=>{
 const missed=buildStory('no_answer'),s=stateAt(missed,1);assert.equal(s.retries,1);assert.equal(s.closed,false);assert.deepEqual(s.acceptances,{retailer:false,installer:false});
 const reopen=buildStory('reopen'),n=reopen.findIndex(e=>e.kind==='unsatisfied');assert.equal(stateAt(reopen,n).status,'reopened');assert.equal(stateAt(reopen,n).closed,false);assert.equal(stateAt(reopen,n+2).status,'awaiting_rating');
});
test('every profile has a complete readable script with explicit AI introduction',()=>{
 for(const profile of Object.keys(PROFILES))for(const scenario of Object.keys(SCENARIOS)){const story=buildStory(scenario);for(const e of story)for(const line of e.dialogue)assert.ok(dialogueText(line,profile).length>5);const first=story.find(e=>e.kind==='contact').dialogue[0];assert.match(dialogueText(first,profile),/IA/);}
});
test('cost comparison uses modality rates, real input volume and no fictitious price multiplier',()=>{
 const usage={audioIn:2000,audioOut:3000,textIn:500,textOut:500};assert.ok(Math.abs(estimateCost('fast',usage)-.0815)<1e-9);assert.equal(estimateCost('balanced',usage),.266);assert.equal(estimateCost('premium',usage),.27);
 assert.equal(estimateCost('fast',{}),0);assert.throws(()=>estimateCost('fast',{audioIn:-1}));assert.throws(()=>estimateCost('fast',{audioIn:NaN}));assert.throws(()=>estimateCost('unknown',{}));
});
test('replay does not mutate historical snapshots and invalid variants safely select normal',()=>{
 const story=buildStory(),s=stateAt(story,2),snapshot=JSON.stringify(s);applyEvent(s,story[3]);assert.equal(JSON.stringify(s),snapshot);assert.deepEqual(buildStory('<script>'),story);
 assert.throws(()=>applyEvent(stateAt(story,story.length-1),story[0]),/cerrada/);
});
