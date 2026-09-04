import test from "node:test";
import assert from "node:assert/strict";
import groups from "./presence-groups.js";
import identity from "./yk-agent-identity.js";
import detail from "./agent-detail.js";

const row=(persona,machine,runtime,host,extra={})=>({persona,machine,runtime,host,updated:100,...extra});
const options={identity,detailUrl:detail.detailUrl};

test("host, y sólo host, separa CLI de Desktop App aunque el runtime sugiera lo contrario",()=>{
  const result=groups.classify([
    row("Oraculo","MacMini","Claude Desktop","cli"),
    row("Neo","MacBookPro14","terminal-cli","app"),
    row("Trinity","MacBook Pro 16","Codex","CLI"),
  ],options);
  assert.deepEqual(result.by_key.cli.items.map(item=>item.persona).sort(),["Oraculo","Trinity"]);
  assert.deepEqual(result.by_key.app.items.map(item=>item.persona),["Neo"]);
});

test("las secciones y sus filas conservan un orden estable independiente del feed",()=>{
  const rows=[
    row("Trinity","MacBook Pro 16","Codex","cli"),
    row("Neo","MacBookPro14","Claude","app"),
    row("Oraculo","MacMini","Codex","cli"),
  ];
  const forward=groups.classify(rows,options),reverse=groups.classify(rows.slice().reverse(),options);
  assert.deepEqual(forward.groups.map(group=>[group.key,group.label]),[
    ["cli","Agentes CLI"],["app","Agentes Desktop App"],["unknown","Sin superficie identificada"]
  ]);
  assert.deepEqual(forward.groups.map(group=>group.items.map(item=>item.identity_key)),
    reverse.groups.map(group=>group.items.map(item=>item.identity_key)));
});

test("los contadores principales no absorben superficies desconocidas",()=>{
  const result=groups.classify([
    row("Oraculo","MacMini","Codex","cli"),row("Neo","MacBookPro14","Claude","app"),
    row("Trinity","MacBook Pro 16","Codex","")
  ],options);
  assert.deepEqual(result.counts,{cli:1,app:1,unknown:1,primary:2,total:3,source_total:3,duplicates_removed:0});
});

test("host vacío o ajeno permanece visible y honesto en el grupo residual",()=>{
  const result=groups.classify([
    row("Oraculo","MacMini","Codex",""),row("Neo","MacBookPro14","Claude","web")
  ],options);
  assert.equal(result.by_key.unknown.label,"Sin superficie identificada");
  assert.equal(result.by_key.unknown.count,2);
  assert.deepEqual(result.by_key.unknown.items.map(item=>item.host),["web",""]);
  assert.ok(result.by_key.unknown.items.every(item=>item.surface_group==="unknown"));
});

test("una identidad exacta aparece una vez, conserva la fila más reciente y su enlace agentDetail",()=>{
  const result=groups.classify([
    row("Oraculo","admira-macmini","Codex","cli",{updated:100,session_id:"old",pid:10}),
    row("OraculoMacMini","Mac Mini","Codex","cli",{updated:200,session_id:"new",pid:20}),
    row("Oraculo","MacMini","Codex","app",{updated:150,session_id:"desktop",pid:30}),
  ],options);
  assert.equal(result.counts.source_total,3);
  assert.equal(result.counts.total,2);
  assert.equal(result.counts.duplicates_removed,1);
  assert.equal(result.by_key.cli.count,1);
  assert.equal(result.by_key.cli.items[0].session_id,"new");
  assert.equal(result.by_key.cli.items[0].detail_url,"/agentDetail?agent=OraculoMacMini&machine=Mac+Mini&runtime=Codex&surface=cli");
  assert.doesNotMatch(result.by_key.cli.items[0].detail_url,/session_id|new/);
});
