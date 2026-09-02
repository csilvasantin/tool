import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const groupSource=await readFile(new URL("./yk-informes-groups.js",import.meta.url),"utf8");
const identitySource=await readFile(new URL("./yk-agent-identity.js",import.meta.url),"utf8");
const html=await readFile(new URL("./informes.html",import.meta.url),"utf8");
const context=vm.createContext({});
vm.runInContext(identitySource,context);vm.runInContext(groupSource,context);
const api=context.YkInformesGroups,identity=context.ykAgentIdentity;

test("family_key canónico anida principal, Sub e Infra en una única familia",()=>{
  const rows=[
    {id:"a",executor:"OraculoMacMini",role:"main",family_key:"oraculo::macmini",family_name:"OraculoMacMini"},
    {id:"b",executor:"SubOraculoMacMini",role:"sub",family_key:"oraculo::macmini",family_name:"OraculoMacMini"},
    {id:"c",executor:"InfraOraculoMacMini",role:"infra",family_key:"oraculo::macmini",family_name:"OraculoMacMini"}
  ];
  const groups=api.group(rows,identity);
  assert.equal(groups.length,1);assert.equal(groups[0].name,"OraculoMacMini");
  assert.deepEqual(Array.from(groups[0].rows,r=>[r._executor,r._agent_role]),[
    ["OraculoMacMini","main"],["SubOraculoMacMini","sub"],["InfraOraculoMacMini","infra"]
  ]);
});

test("fallback legacy une capas sólo con persona y máquina inequívocas",()=>{
  const groups=api.group([
    {id:"mini-main",agent_identity:"OraculoMacMini",loc:"Mac Mini"},
    {id:"mini-sub",agent_identity:"SubOraculoMacMini",loc:"Mac Mini"},
    {id:"mbp",agent_identity:"InfraOraculoMBP16",loc:"MacBook Pro 16"}
  ],identity);
  assert.equal(groups.length,2);
  assert.deepEqual(Array.from(groups[0].rows,r=>r.id),["mini-main","mini-sub"]);
  assert.deepEqual(Array.from(groups[1].rows,r=>r.id),["mbp"]);
});

test("legacy sin máquina no inventa una unión entre roles",()=>{
  const groups=api.group([{agent_identity:"Oraculo"},{agent_identity:"SubOraculo"}],identity);
  assert.equal(groups.length,2);
  assert.notEqual(groups[0].key,groups[1].key);
});

test("agrupar conserva orden de familias y filas producido por el sorter",()=>{
  const groups=api.group([
    {id:"b2",family_key:"b",family_name:"B",executor:"SubNeoMacMini",role:"sub"},
    {id:"a1",family_key:"a",family_name:"A",executor:"MorfeoMBP14",role:"main"},
    {id:"b1",family_key:"b",family_name:"B",executor:"NeoMacMini",role:"main"}
  ],identity);
  assert.deepEqual(Array.from(groups,g=>g.key),["b","a"]);
  assert.deepEqual(Array.from(groups[0].rows,r=>r.id),["b2","b1"]);
});

test("Detalle resume por DeepAgent y misión, con tareas plegadas por defecto",()=>{
  const detail=html.slice(html.indexOf("function renderDetail(list)"),html.indexOf("$('reps').addEventListener",html.indexOf("function renderDetail(list)")));
  assert.match(detail,/YkInformesGroups\.group\(list,window\.ykAgentIdentity\)/);
  assert.match(detail,/YkInformesView\.missionGroups\(family\.rows\)\.map\(rollup\)/);
  assert.match(detail,/class="family-group" role="rowgroup"/);
  assert.match(detail,/class="mission-summary-row"|mission-summary-row/);
  assert.match(detail,/class="mission-rollup-group" role="rowgroup" data-mission=/);
  assert.match(detail,/class="mission-task-rows" data-family-detail="true"\$\{expanded\?"":" hidden"\}/);
  assert.match(detail,/DeepAgent · agente principal/);
  assert.ok(detail.indexOf("mission-summary-row")<detail.indexOf("mission-task-rows"),"cada resumen de misión precede inmediatamente a sus tareas");
});

test("si todos los grupos con resultados llegan plegados, abre el primero",()=>{
  const groups=[{key:"oraculo",rows:Array(7).fill({})},{key:"neo",rows:[{}]}],collapsed={oraculo:true,neo:true};
  api.ensureVisible(groups,collapsed);
  assert.equal(collapsed.oraculo,undefined);
  assert.equal(collapsed.neo,true);
  assert.equal(api.visibleCount(groups,collapsed),7);
});

test("contador visible distingue filas mostradas de informes cargados",()=>{
  assert.match(html,/visible\+" visibles · "\+loaded\+" cargados"/);
  assert.match(html,/const visible=LAST_VIEW_ROWS\.length,loaded=ALL\.length/);
  assert.match(html,/LAST_VIEW_ROWS=rows/);
  assert.match(html,/RENDERED_GROUPS=families/);
});

test("el desplegable de DeepAgent sólo abre el detalle solicitado",()=>{
  assert.match(html,/let EXPANDED_FAMILIES=\{\}/);
  assert.match(html,/const expanded=button\.getAttribute\("aria-expanded"\)==="true",nextExpanded=!expanded/);
  assert.match(html,/if\(nextExpanded\)EXPANDED_FAMILIES\[key\]=true;else delete EXPANDED_FAMILIES\[key\]/);
  assert.match(html,/rows\.querySelectorAll\("\[data-family-detail\]"\)\.forEach/);
  assert.match(html,/count===1\?"misión":"misiones"/);
});

test("todas las miniaturas difieren carga y decodificación",()=>{
  assert.match(html,/loading="lazy" decoding="async"/);
});
