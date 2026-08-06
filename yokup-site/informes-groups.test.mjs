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

test("grupos nacen abiertos, se colapsan con botón accesible y persisten",()=>{
  assert.match(html,/class="family-toggle"[^>]*aria-expanded="\$\{collapsed\?"false":"true"\}"[^>]*aria-controls=/);
  assert.match(html,/class="family-rows"[^>]*\$\{collapsed\?" hidden":""\}/);
  assert.match(html,/FAMILY_COLLAPSE_KEY="yokup\.informes\.collapsedFamilies\.v1"/);
  assert.match(html,/localStorage\.setItem\(FAMILY_COLLAPSE_KEY,JSON\.stringify\(COLLAPSED_FAMILIES\)\)/);
  assert.match(html,/button\.setAttribute\("aria-expanded",expanded\?"false":"true"\)/);
  assert.match(html,/if\(expanded\)COLLAPSED_FAMILIES\[key\]=true;else delete COLLAPSED_FAMILIES\[key\]/);
  assert.match(html,/class="role-badge role-\$\{esc\(role\)\}"/);
});

test("todas las miniaturas difieren carga y decodificación",()=>{
  assert.match(html,/loading="lazy" decoding="async"/);
});
