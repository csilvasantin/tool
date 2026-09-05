import {CLI_POLICY,cliPolicyFor,cliPolicyBlocked} from './src/cli-policy.js';
import {automationPermission} from './src/fleet-automation-control.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {resolveAgentPrincipalProject,principalDays,principalTargetKey} from './src/agent-principal-project.js';
import {selectDecisionProjectAssignment,memberRefMatches} from './src/decision-project.js';
import {modeTargetKey,normalizeModeTarget} from './src/fleet-hourly-modes.js';
const now=Date.parse('2026-09-05T10:00:00Z'),target={persona:'Morfeo',machine:'MacMini',runtime:'Claude',host:'app'};
const projects=['daily','recent','default','admiranext'].map(id=>({id,name:id==='admiranext'?'AdmiraNeXT':id,status:'activo'}));
const decl=(project_id,day='2026-09-05',agent='MorfeoMacMini')=>({project_id,day,agent,agent_key:agent.toLowerCase(),updated_at:Date.parse(day+'T08:00:00Z')});
const mission=(patch={})=>({id:'M1',assignee:'MorfeoMacMini',loc:'MacMini',project_id:'recent',source:'cli-declare',status:'resolved',started_at:now-3600000,resolved_at:now-1800000,...patch});
const resolve=(input={})=>resolveAgentPrincipalProject({target,projects,now,...input});

test('prioridad completa con procedencia legible y fallback real',()=>{
 const all={declarations:[decl('daily'),decl('default','2026-09-01')],missions:[mission()]};
 assert.equal(resolve(all).project_source,'daily_primary');assert.equal(resolve(all).project_id,'daily');
 const recent=resolve({...all,declarations:all.declarations.slice(1)});assert.equal(recent.project_id,'recent');assert.equal(recent.project_source_ref,'M1');
 const configured=resolve({declarations:all.declarations.slice(1)});assert.equal(configured.project_id,'default');assert.equal(configured.project_source_day,'2026-09-01');
 assert.equal(resolve().project_id,'admiranext');assert.equal(resolve().project_available,true);
 const missing=resolve({projects:[]});assert.equal(missing.project_name,'AdmiraNeXT');assert.equal(missing.project_available,false);
});

test('medianoche Madrid cambia hoy a default, misión ayer vence exactamente al día siguiente',()=>{
 const input={declarations:[decl('daily')],missions:[mission({started_at:Date.parse('2026-09-05T21:00:00Z'),resolved_at:Date.parse('2026-09-05T21:30:00Z')})]};
 assert.equal(resolve({...input,now:Date.parse('2026-09-05T21:59:59Z')}).project_id,'daily');
 assert.equal(resolve({...input,now:Date.parse('2026-09-05T22:00:00Z')}).project_source,'last_mission');
 assert.equal(resolve({...input,now:Date.parse('2026-09-06T22:00:00Z')}).project_source,'configured_default');
 assert.deepEqual(principalDays(Date.parse('2026-10-25T23:00:00Z')),{today:'2026-10-26',yesterday:'2026-10-25'});
});

test('misión de varios días requiere evidencia material reciente; latido genérico no la rejuvenece',()=>{
 const old=mission({status:'in_progress',started_at:now-5*86400000,resolved_at:null,live_at:now,updated_at:now});
 assert.equal(resolve({missions:[old]}).project_source,'admiranext_fallback');
 assert.equal(resolve({missions:[{...old,material_at:now-60000}]}).project_source,'last_mission');
 assert.equal(resolve({missions:[{...old,live_kind:'process',live_shot:'https://proof.example/real.png'}]}).project_source,'last_mission');
 assert.equal(resolve({missions:[{...old,material_at:now+3600000}]}).project_source,'admiranext_fallback');
});

test('alias físicos convergen pero otros equipos/personas y contradicciones nunca prestan proyecto',()=>{
 assert.equal(principalTargetKey('SubMorfeoMini','Mac Mini'),principalTargetKey('MorfeoMacMini','MacMini'));
 assert.equal(principalTargetKey('Morfeo16','MacMini'),'');
 assert.equal(resolve({declarations:[decl('daily','2026-09-05','MorfeoMini')]}).project_id,'daily');
 for(const row of [mission({assignee:'Morfeo16',loc:'MacBook Pro 16'}),mission({assignee:'Morfeo16'}),mission({assignee:'NeoMini'}),mission({loc:''})])assert.equal(resolve({missions:[row]}).project_id,'admiranext');
});

test('fuentes incompletas/futuras/archivadas y colas sin empezar no son principal reciente',()=>{
 for(const row of [mission({status:'open'}),mission({source:'decision-window',role:'mission'}),mission({status:'cancelled'}),mission({started_at:0,resolved_at:0,updated_at:now}),mission({resolved_at:now+3600000}),mission({project_id:'unknown'})])assert.equal(resolve({missions:[row]}).project_source,'admiranext_fallback');
 assert.equal(resolve({declarations:[decl('daily','2026-09-06')]}).project_id,'admiranext');
 assert.equal(resolve({declarations:[{...decl('daily'),updated_at:now+3600000}]}).project_id,'admiranext');
 assert.equal(resolve({projects:projects.map(p=>p.id==='daily'?{...p,status:'archivado'}:p),declarations:[decl('daily')]}).project_id,'admiranext');
});

test('empates de aliases y actividad conflictiva fallan cerrado sin orden alfabético arbitrario',()=>{
 const declarations=[decl('daily'),decl('default','2026-09-05','MorfeoMini')];
 const result=resolve({declarations});assert.equal(result.project_issue,'project_ambiguous');assert.equal(result.project_available,false);assert.equal(result.project_conflict_refs.length,2);
 const recent=resolve({missions:[mission(),mission({id:'M2',project_id:'daily'})]});assert.equal(recent.project_issue,'project_ambiguous');
});

const source=await readFile(new URL('./src/index.js',import.meta.url),'utf8');
const fn=name=>{const start=source.indexOf(`async function ${name}(`);assert.ok(start>=0);return source.slice(start,source.indexOf('\n}',start)+2);};
const members=['daily','recent','default'].flatMap(project_id=>[{project_id,kind:'agent',ref:'MorfeoMacMini'},{project_id,kind:'machine',ref:'MacMini'}]);

test('proyecto operativo comparte resolver y bloquea preferencia antigua sin escribirla',async()=>{
 const snapshot={projects,members,declarations:[decl('daily')],missions:[mission()],now};
 const context={resolveAgentPrincipalProject,selectDecisionProjectAssignment,agentPrincipalSnapshot:async()=>snapshot};
 vm.runInNewContext(fn('hourlyModeProject')+';this.resolve=hourlyModeProject',context);
 assert.equal((await context.resolve({},target,'daily',now)).id,'daily');
 await assert.rejects(()=>context.resolve({},target,'default',now),/principal_project_changed/);
 await assert.rejects(()=>context.resolve({},{...target,persona:'Neo'},'',now),/project_required/);
 snapshot.declarations.push(decl('default','2026-09-05','MorfeoMini'));
 await assert.rejects(()=>context.resolve({},target,'',now),/project_ambiguous/);
});

test('inventario resuelve Manual y expone mismatch sin modificar preferencias guardadas',async()=>{
 const saved=[{...normalizeModeTarget(target),identity_key:modeTargetKey(target),mode:'learning',project_id:'default',project_name:'default'}];
 const before=JSON.stringify(saved);
 const context={CLI_POLICY,cliPolicyFor,cliPolicyBlocked,automationPermission,automationControls:async()=>[],Date,principalTargetKey,scopedAgentIdentity:(agent)=>agent,parseAgentIdentity:(agent)=>({persona:agent}),resolveAgentPrincipalProject,normalizeModeTarget,modeTargetKey,memberRefMatches,agentPrincipalSnapshot:async()=>({projects,declarations:[decl('daily')],missions:[],now}),listAgentModes:async()=>structuredClone(saved),hourlyModeTelemetry:async()=>({presence:[{...target,persona:'Neo'},{...target,persona:'LinkMBAAzul',machine:'MacBook Air Azul',host:''}],control_machines:[]})};
 vm.runInNewContext(fn('hourlyModeInventory')+';this.inventory=hourlyModeInventory',context);
 const items=await context.inventory({}),mode=items.find(x=>x.mode==='learning'),manual=items.find(x=>x.mode==='manual');
 assert.equal(mode.project_id,'daily');assert.equal(mode.mode_project_id,'default');assert.equal(mode.project_mismatch,true);assert.equal(mode.reason,'principal_project_changed');
 assert.equal(manual.project_id,'admiranext');assert.equal(manual.mode_project_id,'');assert.equal(JSON.stringify(saved),before);
 const unknown=items.find(item=>item.metadata_only);assert.equal(unknown.host,'unknown');assert.equal(unknown.project_id,'admiranext');assert.equal(unknown.available_modes.length,0);
 assert.throws(()=>normalizeModeTarget(unknown),/exact_target_required/);
});
