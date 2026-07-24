import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");

test("GET /decisions saca la materialización de tandas del camino crítico", () => {
  assert.match(source, /async fetch\(req, env, ctx\)/);
  assert.match(source, /await expireDecisions\(env\);[\s\S]{0,220}ctx\.waitUntil\(startDecisionBatches\(env\)/);
});

test("las lecturas dinámicas no ejecutan migraciones DDL por petición", () => {
  assert.match(source, /var schemaReady = null;[\s\S]{0,260}schemaReady = applySchema\(env\)/);
  const decisionsGet = source.match(/if \(url\.pathname === "\/decisions" && req\.method === "GET"\) \{([\s\S]*?)if \(\/\^\\\/decisions/);
  const ticketsGet = source.match(/if \(url\.pathname === "\/tickets"\) \{([\s\S]*?)if \(url\.pathname === "\/tasks\/all"\)/);
  assert.ok(decisionsGet && ticketsGet, "no se encontraron los handlers GET");
  assert.doesNotMatch(decisionsGet[1], /ensureSchema/);
  assert.doesNotMatch(ticketsGet[1], /ensureSchema/);
});

test("el histórico precarga carruseles en bloque y no hace N+1", () => {
  assert.match(source, /async function missionBatchSnapshots\(env, batchIds\)/);
  assert.match(source, /const batchMap = await missionBatchSnapshots\(env, batchIds\)/);
  assert.match(source, /batchMap\.get\(d\.batch_id \|\| batchIdForDecision\(d\.id\)\)/);
  const getBlock = source.match(/if \(url\.pathname === "\/decisions" && req\.method === "GET"\) \{([\s\S]*?)if \(\/\^\\\/decisions/);
  assert.ok(getBlock, "no se encontró el handler GET /decisions");
  assert.doesNotMatch(getBlock[1], /await missionBatchSnapshot\(/);
});

test("sólo reprocesa decisiones cuya tanda aún no refleja el cierre", () => {
  assert.match(source, /LEFT JOIN mission_batches own ON own\.decision_id=d\.id/);
  assert.match(source, /COALESCE\(shared\.updated_at,0\) < COALESCE\(d\.decided_at,d\.deadline,0\)/);
});
