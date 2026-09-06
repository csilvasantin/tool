import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const source = await readFile(new URL("./yk-mission-duplicates.js", import.meta.url), "utf8");
function api() {
  const context = vm.createContext({window:{}, Map, Set, Array, String, Number, Object});
  vm.runInContext(source, context);
  return context.window.YkMissionDuplicates;
}
const descriptor = (project="admira-live", state="active") => ({
  version:"mission-duplicates-v1", basis:"story", reference:"FLT-1893",
  project_id:project, state_class:state, agent_key:"",
  key:["story",project,state,"root","flt-1893"].join("|")
});
const row = (i, extra={}) => ({id:"FLT-"+(2200+i), subject:"Eco "+i, project_id:"admira-live",
  status:i===0?"open":"in_progress", visible_state:i===0?"pending":"in_progress",
  assignee:i===17?"OraculoMacMini":"WozniakGrokBot", loc:i===17?"MacMini":"grokbot",
  created_at:i, updated_at:i, duplicate:descriptor(), ...extra});

test("18 miembros se presentan como un grupo y ninguno desaparece", () => {
  const grouped=api().group(Array.from({length:18},(_,i)=>row(i)),{machineOf:x=>x.loc});
  assert.equal(grouped.length,1);
  assert.equal(grouped[0]._n,18);
  assert.equal(grouped[0]._members.length,18);
  assert.equal(new Set(grouped[0]._ids).size,18);
  assert.deepEqual(JSON.parse(JSON.stringify(grouped[0]._duplicate.states)),{pending:1,in_progress:17});
  assert.deepEqual(Array.from(grouped[0]._agents),["WozniakGrokBot","OraculoMacMini"]);
});

test("proyecto y estado terminal siguen en grupos separados", () => {
  const rows=[row(1),row(2,{project_id:"pixeria",duplicate:descriptor("pixeria")}),
    row(3,{status:"resolved",visible_state:"resolved",duplicate:descriptor("admira-live","resolved")}),
    row(4,{status:"cancelled",visible_state:"cancelled",duplicate:descriptor("admira-live","cancelled")})];
  assert.equal(api().group(rows,{machineOf:x=>x.loc}).length,4);
});

test("el fallback legacy sólo colapsa igualdad exacta aislada por proyecto, estado, agente y máquina", () => {
  const rows=[row(1,{duplicate:null,subject:"Mismo tema"}),row(2,{duplicate:null,subject:" mismo tema "}),
    row(3,{duplicate:null,subject:"Mismo tema distinto"}),row(4,{duplicate:null,subject:"Mismo tema",project_id:"pixeria"})];
  const grouped=api().group(rows,{machineOf:x=>x.loc});
  assert.equal(grouped.length,3);
  assert.equal(grouped.find(x=>x._n===2)._members.length,2);
});

test("las hijas conservan su jerarquía y nunca se deduplican fuera de la madre", () => {
  const grouped=api().group([row(1,{parent_id:"FLT-P"}),row(2,{parent_id:"FLT-P"})],{machineOf:x=>x.loc});
  assert.equal(grouped.length,2);
  assert.ok(grouped.every(x=>!x._members));
});
