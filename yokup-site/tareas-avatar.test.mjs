import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const read=name=>readFile(new URL(name,import.meta.url),"utf8");

async function load(pref=null){
  const window={fetch:async()=>({json:async()=>({customize:{}})})};
  const noop=()=>{};
  const context=vm.createContext({window,document:{addEventListener:noop,querySelector:()=>null},localStorage:{getItem:key=>key==="yk_pref_avatars"?pref:null,setItem:noop},Promise,Date,Math,JSON,RegExp,Object,Array,String,Number,Boolean,setTimeout,clearTimeout,console});
  await Promise.all(["./yk-agent-identity.js","./yk-avatar.js","./yk-misiones.js"].map(read)).then(([identity,avatar,missions])=>{
    vm.runInContext(identity,context);vm.runInContext(avatar,context);vm.runInContext(missions,context);
  });
  await window.ykAvatar.ready;
  return window;
}

test("/tareas carga identidad y avatar antes del renderer compartido",async()=>{
  const html=await read("./tareas.html");
  const identity=html.indexOf("/yk-agent-identity.js"),avatar=html.indexOf("/yk-avatar.js"),missions=html.indexOf("/yk-misiones.js");
  assert.ok(identity>=0&&identity<avatar&&avatar<missions);
  assert.equal((html.match(/\/yk-avatar\.js/g)||[]).length,1);
});

test("roles y personas con equipo heredan el retrato base con fallback accesible",async()=>{
  const window=await load();
  for(const [owner,base] of [["SubOraculoMini","oraculo"],["InfraOraculoMini","oraculo"],["SmithMacMini","smith"],["NeoMacMini","neo"]]){
    const html=window.YkMisiones.taskNode({code:"a",title:"Paso",status:"pending",owner},false);
    assert.match(html,/class="node-owner-avatar"/);assert.match(html,new RegExp('src="\\/avatars\\/'+base+'\\.jpg"'));
    assert.match(html,new RegExp('alt="'+owner+'"'));assert.match(html,/onerror="this\.nextElementSibling\.hidden=false;this\.remove\(\)"/);
    assert.match(html,new RegExp('class="node-owner-fallback" hidden aria-label="'+owner+'"'));
  }
});

test("preferencia OFF y owner genérico conservan emoji sin imágenes",async()=>{
  const window=await load("0");
  for(const owner of ["SubOraculoMini","InfraOraculoMini","SmithMacMini","NeoMacMini"]){
    const html=window.YkMisiones.taskNode({code:"a",title:"Paso",status:"pending",owner},false);
    assert.doesNotMatch(html,/<img\b/);assert.match(html,/<span class="own"[^>]*>⚙️<\/span>/);
  }
  assert.match(window.YkMisiones.taskNode({code:"c",title:"Informe",status:"pending",owner:"infraagente"},false),/<span class="own"[^>]*>📝<\/span>/);
});
