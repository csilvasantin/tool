import test from 'node:test';
import assert from 'node:assert/strict';
import {onIdleProposalTitleKey,selectOnIdleProposals} from './src/onidle-proposals.js';

test('normaliza títulos para excluir duplicados cosméticos',()=>{
  assert.equal(onIdleProposalTitleKey('  Corregir  misión… '),'corregir mision');
});

test('elige exactamente tres por prioridad, antigüedad e id de forma determinista',()=>{
  const candidates=[
    {title:'Normal reciente',target_mission_id:'MIS-4',status:'open',priority:'normal',created_at:40},
    {title:'Alta nueva',target_mission_id:'MIS-3',status:'open',priority:'high',created_at:30},
    {title:'Alta antigua B',target_mission_id:'MIS-2',status:'open',priority:'high',created_at:20},
    {title:'Alta antigua A',target_mission_id:'MIS-1',status:'open',priority:'high',created_at:20}
  ];
  const result=selectOnIdleProposals(candidates);
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
    {title:'Primera válida',target_mission_id:'MIS-1',status:'open',priority:'normal',created_at:8},
    {title:' primera válida ',target_mission_id:'MIS-DUP-TITLE',status:'open',priority:'normal',created_at:9},
    {title:'Segunda válida',target_mission_id:'MIS-2',status:'open',priority:'normal',created_at:10},
    {title:'Otro id duplicado',target_mission_id:'MIS-2',status:'open',priority:'normal',created_at:11},
    {title:'Tercera válida',target_mission_id:'MIS-3',status:'open',priority:'normal',created_at:12}
  ];
  const result=selectOnIdleProposals(candidates,{
    active_mission_ids:['MIS-B'],used_target_ids:['MIS-U'],used_titles:['Ya usada por título']
  });
  assert.equal(result.ok,true);
  assert.deepEqual(result.proposals.map(row=>row.target_mission_id),['MIS-1','MIS-2','MIS-3']);
});

test('target null exige mejora nueva explícita y conserva el marcador estructurado',()=>{
  const result=selectOnIdleProposals([
    {title:'Ambigua sin misión',target_mission_id:null,status:'open',created_at:1},
    {title:'Nueva explícita',target_mission_id:null,explicit_new:true,status:'new',created_at:2},
    {title:'Misión dos',target_mission_id:'MIS-2',status:'open',created_at:3},
    {title:'Misión tres',target_mission_id:'MIS-3',status:'open',created_at:4}
  ]);
  assert.equal(result.ok,true);
  assert.deepEqual(result.proposals[0],{title:'Nueva explícita',target_mission_id:null,explicit_new:true});
});

test('falla cerrado y no devuelve lista parcial si quedan menos de tres',()=>{
  const result=selectOnIdleProposals([
    {title:'Una',target_mission_id:'MIS-1',status:'open'},
    {title:'Dos',target_mission_id:'MIS-2',status:'open'}
  ]);
  assert.deepEqual(result,{ok:false,code:'onidle_proposals_insufficient',required:3,available:2,proposals:[]});
});
