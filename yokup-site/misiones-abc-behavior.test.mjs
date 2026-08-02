import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";
const src=await readFile(new URL("./yk-misiones.js",import.meta.url),"utf8");
const noop=()=>{},windowObj={};
const ctx=vm.createContext({window:windowObj,document:{addEventListener:noop,querySelector:()=>null},localStorage:{getItem:()=>null,setItem:noop},Date,Math,JSON,Promise,RegExp,Object,Array,String,Number,Boolean,setTimeout,clearTimeout,setInterval,console});
vm.runInContext(src,ctx);const YK=windowObj.YkMisiones;
const task=(code,status,title=code.toUpperCase())=>({code,status,title});

test("una subtarea activa convierte su letra en EN CURSO y semáforo amarillo",()=>{
  const html=YK.tasksAbcHtml({id:"FLT-1",status:"in_progress",_tasks:[task("a","done"),task("b","pending"),task("b2","in_progress"),task("c","pending")]});
  assert.match(html,/abc-task in_progress[^>]*href="\/tareas\?mission=FLT-1#b"/);
  assert.match(html,/>EN CURSO</);
  assert.match(html,/traffic-yellow[^>]*role="progressbar"[^>]*aria-valuenow="50"[^>]*aria-label="Estado de la misión: B en curso"/);
});

test("misión en curso infiere la primera A-B-C pendiente",()=>{
  const html=YK.tasksAbcHtml({id:"FLT-2",status:"in_progress",_tasks:[task("a","done"),task("b","pending","Implementar: panel"),task("c","pending")]});
  assert.match(html,/href="\/tareas\?mission=FLT-2#b"[^>]*title="[^"]*por secuencia A-B-C"/);
  assert.match(html,/Implementar · panel/);
});

test("tarea faltante no enlaza y misión pendiente muestra semáforo rojo",()=>{
  const html=YK.tasksAbcHtml({id:"FLT-3",status:"open",assignee:"Neo",_tasks:[task("a","pending"),task("b","pending")]});
  const missing=(html.match(/<span class="abc-task pending missing"[\s\S]*?<\/span><\/span>/)||[])[0]||"";
  assert.ok(missing);assert.doesNotMatch(missing,/<a\b|href=/);
  assert.match(html,/traffic-red[^>]*aria-valuenow="0"[^>]*aria-label="Estado de la misión: sin empezar"/);
});

test("misión resuelta muestra semáforo verde accesible",()=>{
  const html=YK.tasksAbcHtml({id:"FLT-4",status:"resolved",_tasks:[task("a","done"),task("b","done"),task("c","done")]});
  assert.match(html,/traffic-green[^>]*aria-valuenow="100"[^>]*aria-label="Estado de la misión: realizada"/);
});

test("la columna Tareas conserva suelo de 300px al restaurar y arrastrar",()=>{
  assert.match(src,/function suelo\(col\) \{ return CFG\.columnMode === "tasks" && col === "ord" \? 300 : 56; \}/);
  assert.equal((src.match(/Math\.max\(suelo\((?:k|drag\.col)\)/g)||[]).length,2);
});
