import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import {annotateMissionDuplicates} from "../../yokup-rtc/src/mission-duplicates.js";

const fixture=JSON.parse(await readFile(new URL("./fixtures/superman-loop-18.json",import.meta.url),"utf8"));
const clone=value=>JSON.parse(JSON.stringify(value));

test("snapshot real del bucle Superman conserva 18 miembros en un único grupo activo",()=>{
  const rows=annotateMissionDuplicates(clone(fixture.rows));
  const keys=new Set(rows.map(row=>row.duplicate&&row.duplicate.key));
  assert.deepEqual([...keys],["story|admira-live|active|root|flt-1893"]);
  assert.ok(rows.every(row=>row.duplicate.count===18));
  assert.ok(rows.every(row=>row.duplicate.duplicate_scope==="response-page"));
  assert.deepEqual(rows[0].duplicate.states,{open:1,in_progress:17});
  assert.deepEqual(new Set(rows[0].duplicate.member_ids),new Set(fixture.rows.map(row=>row.id)));
});

test("proyecto y estados terminales del snapshot no se funden con el grupo activo",()=>{
  const active=annotateMissionDuplicates(clone(fixture.rows))[0].duplicate.key;
  const controls=annotateMissionDuplicates(clone(fixture.separation_controls));
  const keys=new Set(controls.map(row=>row.duplicate.key));
  assert.ok([...keys].every(key=>key!==active));
  assert.ok([...keys].some(key=>key.includes("story|pixeria|active|")));
  assert.ok([...keys].some(key=>key.includes("story|admira-live|resolved|")));
  assert.ok([...keys].some(key=>key.includes("story|admira-live|cancelled|")));
});

test("un TG ambiguo no colapsa trabajos canónicos distintos",()=>{
  const base={project_id:"admira-live",status:"in_progress",assignee:"WozniakGrokBot",loc:"grokbot"};
  const rows=annotateMissionDuplicates([
    {...base,id:"FLT-9001",subject:"TG999 story FLT-100 · publicar asset A"},
    {...base,id:"FLT-9002",subject:"TG999 story FLT-200 · publicar asset B"},
    {...base,id:"FLT-9003",subject:"TG999 eco sin referencia de story"}
  ]);
  assert.equal(new Set(rows.map(row=>row.duplicate.key)).size,3);
});

test("el cliente muestra 18→1 sin perder miembros y conserva el contrato accesible",async()=>{
  const client=await readFile(new URL("../../yokup-site/yk-mission-duplicates.js",import.meta.url),"utf8");
  const html=await readFile(new URL("../../yokup-site/misiones.html",import.meta.url),"utf8");
  const css=await readFile(new URL("../../yokup-site/yk-misiones.css",import.meta.url),"utf8");
  const context=vm.createContext({window:{},Map,Set,Array,String,Number,Object});
  vm.runInContext(client,context);
  const rows=annotateMissionDuplicates(clone(fixture.rows));
  const grouped=context.window.YkMissionDuplicates.group(rows,{machineOf:row=>row.loc});
  assert.equal(grouped.length,1);
  assert.equal(grouped[0]._n,18);
  assert.equal(grouped[0]._members.length,18);
  assert.equal(new Set(grouped[0]._ids).size,18);
  assert.deepEqual(new Set(grouped[0]._machines),new Set(["macmini","grokbot"]));

  assert.match(html,/role="group" aria-label="'\+members\.length\+' misiones equivalentes"/);
  assert.match(html,/aria-controls="'\+esc\(panelId\)\+'" aria-expanded=/);
  assert.match(html,/role="region" aria-label="Miembros del grupo/);
  assert.match(css,/\.yk-dup-tg:focus-visible,\.yk-dup-select:focus-visible/);
  assert.match(html,/rawTickets\.forEach\(t=>\{ ROWS_BY_ID\[t\.id\]/);
  assert.match(html,/\(t\._members\|\|\[t\]\)\.forEach\(member=>/);
  assert.match(html,/const equiposDe=t=>t\._machines\|\|/);
});
