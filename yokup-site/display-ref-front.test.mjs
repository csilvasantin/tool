import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const refSource=await readFile(new URL('./yk-display-ref.js',import.meta.url),'utf8');
const files=Object.fromEntries(await Promise.all(['objetivos.html','decisiones.html','misiones.html','tareas.html','yk-decisions.js','yk-misiones.js','normativa.html'].map(async name=>[name,await readFile(new URL('./'+name,import.meta.url),'utf8')])));
const windowObj={};
vm.runInContext(refSource,vm.createContext({window:windowObj,Intl,Date,Number,String}));

test('display_ref del worker siempre gana y no se altera',()=>{
  assert.equal(windowObj.YkDisplayRef.of({display_ref:'0042.04/08/2026.09:17',created_at:1}),'0042.04/08/2026.09:17');
});

test('fallback común usa 0000, fecha completa con año y hora de Madrid',()=>{
  assert.equal(windowObj.YkDisplayRef.of({created_at:Date.UTC(2026,7,4,6,49)}),'0000.04/08/2026.08:49');
  assert.equal(windowObj.YkDisplayRef.of({}),'0000.--/--/----.--:--');
});

test('las cuatro vistas cargan la fuente común y conservan ids técnicos en acciones',()=>{
  for(const name of ['objetivos.html','decisiones.html','misiones.html','tareas.html']) assert.match(files[name],/\/yk-display-ref\.js/);
  assert.match(files['objetivos.html'],/href="\/tareas\?mission='\+encodeURIComponent\(i\.mission_id\)/);
  assert.match(files['tareas.html'],/href="\/ticket\?id=\$\{encodeURIComponent\(g\.mission\.id\)\}/);
  assert.match(files['misiones.html'],/projectIdLayout:true/);
});

test('Objetivos, Decisiones, Misiones y Tareas pintan la referencia humana',()=>{
  assert.match(files['objetivos.html'],/function workRef\(row\)/);
  assert.match(files['yk-decisions.js'],/function workRef\(d\)/);
  assert.match(files['yk-misiones.js'],/function visibleId\(t\)[\s\S]*display_ref/);
  assert.match(files['tareas.html'],/YkMisiones\.visibleId\(g\.mission\)/);
  assert.match(files['yk-misiones.js'],/class="scode"[\s\S]*visibleId\(t\)/);
});

test('la normativa incluye año y documenta el fallback no inventado',()=>{
  assert.match(files['normativa.html'],/NNNN\.DD\/MM\/AAAA\.HH:MM/);
  assert.match(files['normativa.html'],/0000\.DD\/MM\/AAAA\.HH:MM/);
});

test('Tareas no confunde la referencia de la misión con la de cada tarea',()=>{
  const source=files['yk-misiones.js'];
  const windowModule={};
  const documentObj={addEventListener(){},querySelector(){return null}};
  vm.runInContext(source,vm.createContext({window:windowModule,document:documentObj,localStorage:{getItem(){return null},setItem(){},removeItem(){}},Intl,Date,Math,JSON,Promise,RegExp,Object,Array,String,Number,Boolean,CustomEvent:function(){},setTimeout,clearTimeout,console}));
  const Yk=windowModule.YkMisiones;
  const groups=Yk.groupByMission([{mission_id:'FLT-1',mission_display_ref:'0001.04/08/2026.08:49',display_ref:'0002.04/08/2026.08:50',mission_created:Date.UTC(2026,7,4,6,49),created_at:Date.UTC(2026,7,4,6,50),code:'a',title:'Paso',status:'pending'}]);
  assert.equal(Yk.visibleId(groups[0].mission),'0001.04/08/2026.08:49');
  assert.match(Yk.stepsHtml(groups[0].tasks),/>0002\.04\/08\/2026\.08:50<\/a>/);
});
