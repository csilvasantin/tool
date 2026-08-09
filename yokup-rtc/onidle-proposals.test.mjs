import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOnIdleExplicitNewCandidates,onIdleProposalTitleKey,selectOnIdleProposals} from './src/onidle-proposals.js';

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

test('el fallback del proyecto ofrece las 24 alternativas diarias como explicit_new seguro',()=>{
  const rows=buildOnIdleExplicitNewCandidates({id:'yokup',name:'Yokup'},'2026-08-09');
  assert.equal(rows.length,24);
  assert.equal(new Set(rows.map(row=>onIdleProposalTitleKey(row.title))).size,24);
  assert.ok(rows.every(row=>row.target_mission_id===null&&row.explicit_new===true&&row.status==='new'));
  assert.ok(rows.every(row=>row.title.includes('Yokup')&&row.title.includes('2026-08-09')));
});

test('el catálogo completa exactamente tres después de backlog, activas y usadas',()=>{
  const fallback=buildOnIdleExplicitNewCandidates({id:'yokup',name:'Yokup'},'2026-08-09');
  const result=selectOnIdleProposals([
    {title:'Incidencia cerrada',target_mission_id:'INC-C',status:'resolved',priority:'urgent',created_at:1},
    {title:'Misión activa',target_mission_id:'MIS-A',status:'open',priority:'urgent',created_at:2},
    {title:'Incidencia vigente',target_mission_id:'INC-1',status:'open',priority:'high',created_at:3},
    ...fallback
  ],{active_mission_ids:['MIS-A'],used_titles:[fallback[0].title]});
  assert.equal(result.ok,true);
  assert.equal(result.proposals.length,3);
  assert.equal(result.proposals[0].target_mission_id,'INC-1');
  assert.ok(result.proposals.slice(1).every(row=>row.target_mission_id===null&&row.explicit_new===true));
  assert.ok(result.proposals.every(row=>row.title!==fallback[0].title));
});

test('24 alternativas cubren ocho ventanas sin repetir títulos usados',()=>{
  const fallback=buildOnIdleExplicitNewCandidates({id:'yokup',name:'Yokup'},'2026-08-09');
  for(let window=0;window<8;window++){
    const used=fallback.slice(0,window*3).map(row=>row.title);
    const result=selectOnIdleProposals(fallback,{used_titles:used});
    assert.equal(result.ok,true,`ventana ${window+1}`);
    assert.deepEqual(result.proposals.map(row=>row.title),fallback.slice(window*3,window*3+3).map(row=>row.title));
  }
});
