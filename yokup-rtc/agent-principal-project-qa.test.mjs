import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAgentPrincipalProject as resolve,principalDays} from './src/agent-principal-project.js';
const projects=['daily','mission','default','admiranext'].map(id=>({id,name:id,status:'activo'}));
const target={agent:'OraculoMacMini',machine:'admira-macmini'};
const now=Date.parse('2026-09-05T04:00:00Z');
const declaration=(id,day,agent='Oraculo',machine='MacMini')=>({agent,machine,project_id:id,day,updated_at:now-60000});
const mission=(id,extra={})=>({id:'test-'+id,project_id:id,source:'cli-declare',role:'mission',status:'resolved',assignee:'OraculoMacMini',loc:'MacMini',started_at:now-3600000,resolved_at:now-1000,...extra});
test('principal priority remains exact across declaration, recent real mission, persisted default and fallback',()=>{
 const old=declaration('default','2026-09-01'),current=declaration('daily','2026-09-05'),work=mission('mission');
 for(const order of [[old,current],[current,old]])assert.equal(resolve({target,projects,declarations:order,missions:[work],now}).project_source,'daily_primary');
 assert.equal(resolve({target,projects,declarations:[old],missions:[work],now}).project_id,'mission');
 assert.equal(resolve({target,projects,declarations:[old],missions:[],now}).project_source,'configured_default');
 assert.equal(resolve({target,projects,now}).project_id,'admiranext');
});
test('another physical machine or contradictory suffixed identity never lends its project',()=>{
 const declarations=[declaration('daily','2026-09-05','Oraculo','MacBook Pro 16'),declaration('daily','2026-09-05','OraculoMBP16','MacMini')];
 const missions=[mission('mission',{loc:'MacBook Pro 16'}),mission('mission',{assignee:'OraculoMBP16',loc:'MacMini'})];
 assert.equal(resolve({target,projects,declarations,missions,now}).project_id,'admiranext');
});
test('pending, metadata-only, cancelled and future work cannot outrank an explicit persisted default',()=>{
 const old=declaration('default','2026-09-01');
 for(const row of [mission('mission',{status:'pending'}),mission('mission',{status:'cancelled'}),mission('mission',{started_at:null,resolved_at:null,updated_at:now}),mission('mission',{started_at:now+60000,resolved_at:now+120000}),mission('mission',{source:'decision-window'})]){
  assert.equal(resolve({target,projects,declarations:[old],missions:[row],now}).project_source,'configured_default');
 }
 assert.equal(resolve({target,projects,declarations:[old,declaration('daily','2026-09-06')],now}).project_id,'default');
});
test('Madrid yesterday is a calendar day at both DST boundaries and old work falls behind default',()=>{
 for(const instant of ['2026-03-29T22:30:00Z','2026-10-25T23:30:00Z']){
  const t=Date.parse(instant),{today,yesterday}=principalDays(t);
  assert.equal(today,instant.startsWith('2026-03')?'2026-03-30':'2026-10-26');
  const within=Date.parse(yesterday+'T12:00:00Z'),oldAt=within-86400000;
  const own={...declaration('default','2026-01-01'),updated_at:t-1};
  assert.equal(resolve({target,projects,declarations:[own],missions:[mission('mission',{started_at:within,resolved_at:within})],now:t}).project_id,'mission');
  assert.equal(resolve({target,projects,declarations:[own],missions:[mission('mission',{started_at:oldAt,resolved_at:oldAt,updated_at:t})],now:t}).project_id,'default');
 }
});
test('archived or unknown projects cannot be displayed as an available principal',()=>{
 const state=resolve({target,projects:projects.map(p=>p.id==='daily'?{...p,status:'archivado'}:p),declarations:[declaration('daily','2026-09-05')],now});
 assert.equal(state.project_id,'admiranext');assert.equal(state.project_available,true);
 const missing=resolve({target,projects:[],now});assert.equal(missing.project_id,'admiranext');assert.equal(missing.project_available,false);
});
