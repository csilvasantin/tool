import test from 'node:test';
import assert from 'node:assert/strict';
import {assessOnIdleProposal,buildOnIdleExplicitNewCandidates,ONIDLE_EVIDENCE_MAX_AGE_MS,onIdleProposalTitleKey,selectOnIdleProposals} from './src/onidle-proposals.js';

const NOW=Date.parse('2026-08-10T09:00:00Z');
const proposal=(title,target_mission_id,overrides={})=>({
  title,target_mission_id,status:'open',priority:'normal',created_at:NOW-3_600_000,
  updated_at:NOW-3_600_000,evidence_at:NOW-3_600_000,...overrides
});

test('normaliza títulos para excluir duplicados cosméticos',()=>{
  assert.equal(onIdleProposalTitleKey('  Corregir  misión… '),'corregir mision');
});

test('elige exactamente tres por prioridad, antigüedad e id de forma determinista',()=>{
  const candidates=[
    proposal('Reducir /status de 240 KB a 90 KB y verificar el peso','MIS-4'),
    proposal('Corregir API /coach: 5 errores y verificar 0 errores','MIS-3',{priority:'high',created_at:NOW-20}),
    proposal('Completar sitemap: 7 rutas de 9 y verificar las 9','MIS-2',{priority:'high',created_at:NOW-30}),
    proposal('Rehacer /404: 1140 bytes y verificar salida visual','MIS-1',{priority:'high',created_at:NOW-30})
  ];
  const result=selectOnIdleProposals(candidates,{now:NOW});
  assert.equal(result.ok,true);
  assert.deepEqual(result.proposals.map(row=>row.target_mission_id),['MIS-1','MIS-2','MIS-3']);
});

test('excluye terminales, activas, usadas y duplicados de id o título',()=>{
  const candidates=[
    {title:'Resuelta',target_mission_id:'MIS-R',status:'resolved',priority:'high',created_at:1},
    {title:'Cancelada',target_mission_id:'MIS-C',status:'cancelled',priority:'high',created_at:2},
    {title:'Cerrada',target_mission_id:'MIS-X',status:'closed',priority:'high',created_at:3},
    {title:'Activa por estado',target_mission_id:'MIS-A',status:'in_progress',priority:'high',created_at:4},
    {title:'Activa por batch',target_mission_id:'MIS-B',status:'open',priority:'high',created_at:5},
    {title:'Ya usada por id',target_mission_id:'MIS-U',status:'open',priority:'high',created_at:6},
    {title:'Ya usada por título',target_mission_id:'MIS-T',status:'open',priority:'high',created_at:7},
    proposal('Reducir /uno de 10 pasos a 5 y verificar 5','MIS-1'),
    proposal(' reducir /uno de 10 pasos a 5 y verificar 5 ','MIS-DUP-TITLE'),
    proposal('Corregir API /dos: 2 errores y verificar 0','MIS-2'),
    proposal('Eliminar /doble: 2 envíos y verificar 1','MIS-2'),
    proposal('Completar sitemap: 7 rutas de 9 y verificar 9','MIS-3')
  ];
  const result=selectOnIdleProposals(candidates,{
    active_mission_ids:['MIS-B'],used_target_ids:['MIS-U'],used_titles:['Ya usada por título'],now:NOW
  });
  assert.equal(result.ok,true);
  assert.deepEqual(result.proposals.map(row=>row.target_mission_id),['MIS-1','MIS-2','MIS-3']);
});

test('target null y el catálogo genérico quedan fuera aunque estén marcados como nuevos',()=>{
  const result=selectOnIdleProposals([
    {title:'Ambigua sin misión',target_mission_id:null,status:'open',created_at:1},
    {title:'Nueva explícita',target_mission_id:null,explicit_new:true,status:'new',created_at:2},
    proposal('Reducir /dos de 10 pasos a 5 y verificar 5','MIS-2'),
    proposal('Corregir API /tres: 3 errores y verificar 0','MIS-3')
  ],{now:NOW});
  assert.equal(result.ok,false);
  assert.equal(result.available,2);
  assert.equal(result.action,'investigate');
  assert.equal(result.rejected.generic,2);
});

test('falla cerrado y no devuelve lista parcial si quedan menos de tres',()=>{
  const result=selectOnIdleProposals([
    proposal('Reducir /uno de 10 pasos a 5 y verificar 5','MIS-1'),
    proposal('Corregir API /dos: 2 errores y verificar 0','MIS-2')
  ],{now:NOW});
  assert.deepEqual(result,{ok:false,code:'onidle_proposals_insufficient',required:3,available:2,
    rejected:{stale:0,generic:0},action:'investigate',proposals:[]});
});

test('el fallback del proyecto ya no fabrica alternativas para rellenar silencio',()=>{
  const rows=buildOnIdleExplicitNewCandidates({id:'yokup',name:'Yokup'},'2026-08-09');
  assert.deepEqual(rows,[]);
});

test('una propuesta específica pero con evidencia de hace 65 horas se rechaza',()=>{
  const stale=proposal('Rehacer /404: 1140 bytes y verificar salida visual','MIS-STALE',{
    evidence_at:NOW-65*3_600_000,updated_at:NOW-65*3_600_000
  });
  const quality=assessOnIdleProposal(stale,NOW);
  assert.equal(quality.criteria.evidence,false);
  assert.equal(quality.ok,false);
  assert.equal(quality.max_age_ms,ONIDLE_EVIDENCE_MAX_AGE_MS);
  const result=selectOnIdleProposals([
    stale,
    proposal('Reducir /uno de 10 pasos a 5 y verificar 5','MIS-1'),
    proposal('Corregir API /dos: 2 errores y verificar 0','MIS-2')
  ],{now:NOW});
  assert.equal(result.ok,false);
  assert.equal(result.available,2);
  assert.equal(result.rejected.stale,1);
});

test('tres propuestas frescas, concretas y medibles sí abren la ventana',()=>{
  const result=selectOnIdleProposals([
    proposal('Reducir /status de 216 KB a 80 KB y verificar el peso','MIS-1'),
    proposal('Completar sitemap: 7 rutas de 9 y verificar las 9','MIS-2'),
    proposal('Corregir API /coach: 5 errores y verificar 0 errores','MIS-3')
  ],{now:NOW});
  assert.equal(result.ok,true);
  assert.equal(result.quality_contract,'academy-improvement-v1');
  assert.deepEqual(result.proposals.map(row=>Object.keys(row)),[['title','target_mission_id'],['title','target_mission_id'],['title','target_mission_id']]);
});
