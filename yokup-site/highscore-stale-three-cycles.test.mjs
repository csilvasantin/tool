import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("./highscore-race.js",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("./highscore.html",import.meta.url),"utf8");
const sandbox={module:{exports:{}},exports:{}};
vm.runInNewContext(source,sandbox);
const race=sandbox.module.exports;
const CYCLE=42_000;

test("assigned_stale permanece tres ciclos completos y expira exactamente al tercero",()=>{
  let row=race.staleRaceRecord(null,"family|mission|FLT-1|10|20",1_000);
  assert.equal(row.cycles,0); assert.equal(race.staleRaceVisible(row),true);
  row=race.staleRaceComplete(row,1_000,CYCLE);
  assert.equal(row.cycles,1); assert.equal(race.staleRaceVisible(row),true);
  row=race.staleRaceComplete(row,43_000,CYCLE);
  assert.equal(row.cycles,2); assert.equal(race.staleRaceVisible(row),true);
  row=race.staleRaceComplete(row,85_000,CYCLE);
  assert.equal(row.cycles,3); assert.equal(race.staleRaceVisible(row),false);
});

test("reload/refetch/presence/title no reinician; work assignment o progress sí",()=>{
  const old={revision:"f|task|M:b|100|200",server_started_at:43_000,cycles:2};
  assert.deepEqual({...race.staleRaceRecord(JSON.stringify(old),old.revision,999_000)},old);
  for(const changed of ["f|task|N:b|100|200","f|task|M:b|101|200","f|task|M:b|100|201"])
    assert.deepEqual({...race.staleRaceRecord(JSON.stringify(old),changed,999_000)},
      {revision:changed,server_started_at:999_000,cycles:0});
});

test("dos tabs con el mismo ancla no consumen dos veces el mismo ciclo",()=>{
  const old={revision:"r",server_started_at:1_000,cycles:1};
  const first=race.staleRaceComplete(old,1_000,CYCLE);
  const duplicate=race.staleRaceComplete(first,1_000,CYCLE);
  assert.equal(first.cycles,2); assert.equal(duplicate.cycles,2);
});

test("sólo el cierre real del ciclo consume y la retirada es visual",()=>{
  assert.match(html,/if \(document\.hidden\) return/);
  // El cierre real del ciclo consume el presupuesto stale y, desde el 6-sep-2026, levanta el cerrojo de la parrilla.
  assert.match(html,/completaCicloStale\(\); liberaParrilla\(\); actualizaMarcador\(\)\.then\(iniciaCarrera\)/);
  assert.match(html,/trabajosCarrera\(\)/);
  assert.match(html,/window\.addEventListener\("storage"/);
  assert.match(html,/new BroadcastChannel\("yk\.highscore\.stale-race\.v1"\)/);
  assert.doesNotMatch(html,/work_progress_at\s*=|state\s*=\s*"(?:resolved|cancelled)"/);
});
