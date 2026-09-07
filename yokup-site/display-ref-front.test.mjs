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

// MISIÓN DEL DÍA (Carlos → Wozniak → Smith, encargo #2815, 7-sep-2026): hacia fuera una misión
// se nombra «Hoy #N» (contador del día en Madrid) y en historial «7 sep · #N»; el FLT sigue
// dentro y se pinta en gris. El fallback 0000.DD/MM/AAAA.HH:MM de la regla anterior desaparece:
// sin alias no se inventa nada y en pantalla queda el FLT.
test('misión del día: Hoy #N si es de hoy, «D mon · #N» en historial, y sin alias no se inventa nada',()=>{
  const hoy=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  assert.equal(windowObj.YkDisplayRef.of({display_n:12,display_day:hoy,created_at:1}),'Hoy #12');
  assert.equal(windowObj.YkDisplayRef.of({display_n:12,display_day:'2026-09-07',created_at:1}).replace('Hoy #12','7 sep · #12'),'7 sep · #12');
  assert.equal(windowObj.YkDisplayRef.of({display_n:3,display_day:'2026-08-04',created_at:1}),'4 ago · #3');
  assert.equal(windowObj.YkDisplayRef.of({created_at:Date.UTC(2026,7,4,6,49)}),'', 'sin alias del worker no se inventa una secuencia');
  assert.equal(windowObj.YkDisplayRef.of({}),'');
  assert.match(windowObj.YkDisplayRef.screenHtml({id:'FLT-100061',display_n:12,display_day:hoy},s=>s),/<span class="mision-dia">Hoy #12<\/span><span class="flt-id">FLT-100061<\/span>/,'alias grande + FLT en gris');
  assert.match(windowObj.YkDisplayRef.screenHtml({id:'FLT-100061'},s=>s),/<span class="mision-dia">FLT-100061<\/span>/,'sin alias, en pantalla queda el FLT');
  assert.ok(windowObj.YkDisplayRef.matchesQuery({id:'FLT-100061',display_n:12,display_day:hoy},'hoy #12'));
  assert.ok(windowObj.YkDisplayRef.matchesQuery({id:'FLT-100061',display_n:12,display_day:hoy},'FLT-100061'));
});

test('las cuatro vistas cargan la fuente común y conservan ids técnicos en acciones',()=>{
  for(const name of ['objetivos.html','decisiones.html','misiones.html','tareas.html']) assert.match(files[name],/\/yk-display-ref\.js/);
  assert.match(files['objetivos.html'],/href="\/tareas\?mission='\+encodeURIComponent\(i\.mission_id\)/);
  assert.match(files['tareas.html'],/YkMisiones\.rowHtml\(mission\)/);
  assert.match(files['misiones.html'],/projectIdLayout:true/);
});

test('Objetivos, Decisiones, Misiones y Tareas pintan la referencia humana',()=>{
  assert.match(files['objetivos.html'],/function workRef\(row\)/);
  assert.match(files['yk-decisions.js'],/function workRef\(d\)/);
  assert.match(files['yk-misiones.js'],/function visibleId\(t\)[\s\S]*display_ref/);
  assert.match(files['tareas.html'],/YkMisiones\.visibleId\(_focusMission/);
  assert.match(files['yk-misiones.js'],/class="scode"[\s\S]*visibleId\(t\)/);
});

test('la normativa documenta la misión del día: Hoy #N fuera, FLT dentro, y cómo se resuelve',()=>{
  assert.match(files['normativa.html'],/Hoy #N/);
  assert.match(files['normativa.html'],/FLT-########/);
  assert.match(files['normativa.html'],/\/fleet\/alias\?q=/);
  assert.doesNotMatch(files['normativa.html'],/0000\.DD\/MM\/AAAA\.HH:MM/,'el fallback 0000 de la regla anterior ya no se documenta');
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
