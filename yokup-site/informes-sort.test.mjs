import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('./yk-informes-sort.js',import.meta.url),'utf8');
const html=await readFile(new URL('./informes.html',import.meta.url),'utf8');
const context=vm.createContext({Intl});
vm.runInContext(source,context);
const api=context.YkInformesSort;
const options={agentName:row=>row.agent_identity||row.owner||'',missionLast:{M1:4_000_000,M2:5_000_000}};

const rows=[
  {id:'a',mission_id:'FLT-10',code:'b',subject:'Zeta',report:'Beta',agent_identity:'Neo',status:'done',process_image:'proc',process_captured_at:2200,image:'proof',mission_created:2000,updated_at:2300},
  {id:'b',mission_id:'FLT-2',code:'a',subject:'Alfa',report:'Alfa',agent_identity:'Morfeo',status:'pending',mission_proof:'mission-proof',mission_created:1000,updated_at:1300},
  {id:'c',mission_id:'FLT-2',code:'c',subject:'Alfa',report:'Alfa',agent_identity:'Morfeo',status:'in_progress',mission_created:1500,updated_at:1600}
];

test('las siete cabeceras son ordenables, accesibles y muestran dirección',()=>{
  assert.match(html,/script src="\/yk-informes-sort\.js\?v=r1"/);
  assert.deepEqual(Array.from(html.matchAll(/\["(mision|proceso|captura|informe|agente|estado|tiempo)",/g),m=>m[1]),
    ['mision','proceso','captura','informe','agente','estado','tiempo']);
  assert.match(html,/role="columnheader" aria-sort=/);
  assert.match(html,/class="sort-head" type="button"/);
  assert.match(html,/id="reps" role="table" aria-label="Informes de misiones"/);
  assert.match(html,/class="grow item" role="row"/);
  assert.equal((html.match(/class="gc[^"\n]*" role="cell"/g)||[]).length,7);
  assert.match(html,/SORT\.dir==="asc"\?"desc":"asc"/);
  assert.match(html,/if\(next\)next\.focus\(\)/);
});

test('Misión usa texto natural y el orden descendente se invierte',()=>{
  assert.deepEqual(Array.from(api.sort(rows,'mision','asc',options),r=>r.id),['b','c','a']);
  assert.deepEqual(Array.from(api.sort(rows,'mision','desc',options),r=>r.id),['a','c','b']);
});

test('Misión prioriza la referencia humana publicada para ids DCL opacos',()=>{
  const declared=[
    {id:'segundo',mission_id:'DCL-aaa',mission_display_ref:'0048.06/08/2026.19:10',code:'a'},
    {id:'primero',mission_id:'DCL-zzz',mission_display_ref:'0047.06/08/2026.19:09',code:'a'}
  ];
  assert.deepEqual(Array.from(api.sort(declared,'mision','asc',options),r=>r.id),['primero','segundo']);
});

test('Proceso y Captura ordenan por presencia/tipo y fecha real',()=>{
  assert.deepEqual(Array.from(api.sort(rows,'proceso','asc',options),r=>r.id),['b','c','a']);
  assert.deepEqual(Array.from(api.sort(rows,'captura','asc',options),r=>r.id),['c','b','a']);
});

test('Proceso ignora live_shot no tipado y sólo usa process_image',()=>{
  const legacy=[
    {id:'fallback',live_shot:'final-reutilizada',live_kind:'final-fallback',updated_at:2},
    {id:'real',process_image:'proceso-real',process_captured_at:3,updated_at:3}
  ];
  assert.deepEqual(Array.from(api.sort(legacy,'proceso','asc',options),r=>r.id),['fallback','real']);
});

test('Informe, Agente, Estado y Tiempo usan comparadores propios',()=>{
  assert.deepEqual(Array.from(api.sort(rows,'informe','asc',options),r=>r.id),['b','c','a']);
  assert.deepEqual(Array.from(api.sort(rows,'agente','asc',options),r=>r.id),['b','c','a']);
  assert.deepEqual(Array.from(api.sort(rows,'estado','asc',options),r=>r.id),['b','c','a']);
  assert.deepEqual(Array.from(api.sort(rows,'tiempo','asc',options),r=>r.id),['b','c','a']);
});

test('la ordenación es estable cuando la clave empata',()=>{
  const tied=[{id:'uno',report:'igual'},{id:'dos',report:'igual'},{id:'tres',report:'igual'}];
  assert.deepEqual(Array.from(api.sort(tied,'informe','asc',options),r=>r.id),['uno','dos','tres']);
  assert.deepEqual(Array.from(api.sort(tied,'informe','desc',options),r=>r.id),['uno','dos','tres']);
});
