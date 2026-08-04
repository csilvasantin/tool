import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("./highscore.html",import.meta.url),"utf8");
const identitySource=fs.readFileSync(new URL("./yk-agent-identity.js",import.meta.url),"utf8");
const identitySandbox={};
vm.runInNewContext(identitySource,identitySandbox);
const identity=identitySandbox.ykAgentIdentity;

function functionSource(name){
  const start=source.indexOf(`function ${name}(`);
  assert.notEqual(start,-1,`falta ${name}`);
  const brace=source.indexOf("{",start);
  let depth=0,quote="",escaped=false;
  for(let index=brace;index<source.length;index++){
    const char=source[index];
    if(quote){
      if(escaped)escaped=false;
      else if(char==="\\")escaped=true;
      else if(char===quote)quote="";
      continue;
    }
    if(char==='"'||char==="'"||char==='`'){quote=char;continue;}
    if(char==="{")depth++;
    else if(char==="}"&&--depth===0)return source.slice(start,index+1);
  }
  throw new Error(`función ${name} incompleta`);
}

function groupApi(){
  const functions=["hsSetAgentScopeGroup","hsAgentScopeGroups"].map(functionSource).join("\n");
  return new Function("identity",`
    var window={ykAgentIdentity:identity};
    function normaliza(value){return String(value==null?"":value).trim();}
    function hsAgentKey(value){return normaliza(value).normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"");}
    ${functions}
    return {groups:hsAgentScopeGroups,setGroup:hsSetAgentScopeGroup};
  `)(identity);
}

const rows=[
  {agente:"OraculoMacMini",maquinas:["Mac Mini"],maquinasVivas:["admira-macmini"]},
  {agente:"MorfeoMacMini",maquinas:[],maquinasVivas:[]},
  {agente:"SmithMacMini",maquinas:["macmini"],maquinasVivas:[]},
  {agente:"NeoMBP14",maquinas:["MacBookProNegro14"],maquinasVivas:[]},
  {agente:"WhiteRabbit",maquinas:[],maquinasVivas:[]},
];
const presence=[
  {persona:"Morfeo",machine:"Mac Mini",updated:1},
  {persona:"Agente Smith",machine:"admira-macmini",updated:2},
  {persona:"OraculoMacMini",machine:"MacBook Pro 16",updated:3},
];

test("los grupos nacen de todas las sesiones conocidas y colapsan aliases de equipo",()=>{
  const census=groupApi().groups(rows,presence,identity);
  const mac=census.groups.find(group=>group.key==="MacMini");
  assert.ok(mac);
  assert.deepEqual(mac.items.map(item=>item.label),["MorfeoMacMini","OraculoMacMini","SmithMacMini"]);
  assert.equal(mac.items.length,3,"Mac Mini, macmini y admira-macmini son un único equipo");
  assert.ok(mac.items.some(item=>item.label==="MorfeoMacMini"),"una sesión histórica también cuenta");
});

test("un agente multi-equipo aparece en ambos grupos con una sola identidad global",()=>{
  const census=groupApi().groups(rows,presence,identity);
  const global=census.items.filter(item=>item.key==="oraculomacmini");
  assert.equal(global.length,1);
  assert.deepEqual(global[0].teams,["MacMini","MBP16"]);
  const macCopy=census.groups.find(group=>group.key==="MacMini").items.find(item=>item.key==="oraculomacmini");
  const mbpCopy=census.groups.find(group=>group.key==="MBP16").items.find(item=>item.key==="oraculomacmini");
  assert.equal(macCopy,mbpCopy,"las copias comparten item/key de selección, no duplican el censo global");
});

test("SINMAQ se muestra como dato honesto y no inventa una máquina",()=>{
  const census=groupApi().groups(rows,presence,identity);
  const unknown=census.groups.find(group=>group.key==="SINMAQ");
  assert.ok(unknown);
  assert.equal(unknown.label,"Sin equipo identificado");
  assert.deepEqual(unknown.items.map(item=>item.label),["WhiteRabbit"]);
  assert.equal(census.groups.at(-1).key,"SINMAQ","el grupo desconocido queda separado al final");
});

test("el nodo equipo marca o desmarca hijos, conserva parcial y vuelve a Todos",()=>{
  const api=groupApi(),census=api.groups(rows,presence,identity);
  const allKeys=census.items.map(item=>item.key),macKeys=census.groups.find(group=>group.key==="MacMini").items.map(item=>item.key);
  const withoutMac=api.setGroup(null,macKeys,false,allKeys);
  assert.ok(withoutMac instanceof Set);
  assert.ok(macKeys.every(key=>!withoutMac.has(key)));
  assert.equal(withoutMac.size,allKeys.length-macKeys.length);

  const partial=new Set([macKeys[0],...withoutMac]);
  const selected=macKeys.filter(key=>partial.has(key)).length;
  assert.ok(selected>0&&selected<macKeys.length,"el padre debe quedar indeterminate");
  assert.equal(api.setGroup(partial,macKeys,true,allKeys),null,"completar todos los hijos restablece Todos");
});

test("cambiar un agente individual sincroniza todas sus copias al rerender",()=>{
  assert.match(source,/querySelectorAll\("\[data-agent-scope-item\]"\)\.forEach/);
  assert.match(source,/AGENT_SCOPE = hsSetAgentScopeItem\(AGENT_SCOPE, input\.value, input\.checked, keys\)/);
  assert.match(source,/hsWriteAgentScope\(AGENT_SCOPE\); hsRenderAgentScope\(listaCompletaCache \|\| \[\]\); pintaVistaFiltrada\(\)/);
  assert.match(source,/group\.items\.map\(function \(item\) \{[\s\S]*?data-agent-scope-item value="' \+ esc\(item\.key\)/);
});

test("Todos, 0/N, persistencia, Clonar y reset conservan sus contratos",()=>{
  assert.match(source,/count\.textContent = AGENT_SCOPE === null \? "Todos" : selected \+ "\/" \+ items\.length/);
  assert.match(source,/AGENT_SCOPE = allInput\.checked \? null : new Set\(\)/);
  assert.match(source,/function hsReadAgentScope\(\)/);
  assert.match(source,/function hsWriteAgentScope\(scope\)/);
  assert.match(source,/id="agentScopeClone"/);
  assert.match(source,/hsCloneAgentScopeToDashboard\(AGENT_SCOPE, listaCompletaCache \|\| \[\], localStorage, window\.ykAgentIdentity\)/);
  assert.match(source,/id="agentScopeReset"/);
  assert.match(source,/AGENT_SCOPE = null; hsWriteAgentScope\(AGENT_SCOPE\)/);
});

test("cada equipo es un grupo semántico, con padre parcial y layout móvil seguro",()=>{
  assert.match(source,/<fieldset class="agent-scope-group" data-agent-scope-group=/);
  assert.match(source,/<legend class="sr-only">Equipo físico /);
  assert.match(source,/data-agent-scope-team[^>]*aria-label="Seleccionar agentes de /);
  assert.match(source,/input\.indeterminate = teamSelected > 0 && teamSelected < childKeys\.length/);
  assert.match(source,/\.agent-scope-group\{[^}]*min-width:0[^}]*border:0/);
  assert.match(source,/\.agent-scope-children\{[^}]*display:grid[^}]*padding-left:14px/);
  assert.match(source,/\.agent-scope-label\{[^}]*min-width:0[^}]*text-overflow:ellipsis/);
  assert.match(source,/@media \(max-width:620px\)/);
});

test("los equipos arrancan compactados y conservan su apertura solo durante la vista",()=>{
  assert.match(source,/var AGENT_SCOPE_OPEN_TEAMS = new Set\(\)/,
    "el estado de apertura no se persiste entre sesiones");
  assert.match(source,/groupOpen = AGENT_SCOPE_OPEN_TEAMS\.has\(group\.key\)/);
  assert.match(source,/data-agent-scope-toggle="' \+ esc\(group\.key\)/);
  assert.match(source,/aria-expanded="' \+ groupOpen/);
  assert.match(source,/\(groupOpen \? '' : ' hidden'\)/);
  assert.match(source,/children\.hidden = !open/);
  assert.match(source,/AGENT_SCOPE_OPEN_TEAMS\.add\(team\)/);
  assert.match(source,/AGENT_SCOPE_OPEN_TEAMS\.delete\(team\)/);
  assert.match(source,/\.agent-scope-children\[hidden\]\{display:none\}/);
});
