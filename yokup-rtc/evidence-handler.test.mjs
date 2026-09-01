import test from "node:test";
import assert from "node:assert/strict";
import worker from "./src/index.js";

function fleetClosureEnv(source = "fleet") {
  const state = {
    ticket: { id: "FLT-77", assignee: "OraculoMacMini", loc: "Mac Mini", status: "open", source, screen: source === "fleet" ? "Encargo #77" : "decision:B1", created_at: Date.now()-60_000, proof_image: null, proof_kind: null,
      live_shot:"https://yokup-rtc.test/media/fleet/process.png",live_at:Date.now()-30_000,live_kind:"process",live_surface:"cli",live_context:"command_output" },
    task: null,
    plan: ["a","b","c"].map((code) => ({ mission_id:"FLT-77",code,status:"done",report:"Informe "+code })),
    batches: 0, directRuns: 0, telegramFail: true, telegramCalls: 0,
    accepted: false, failBatchCoord: false, batch: { id: "B1", status: "active", active_mission_id: "FLT-77" }, item: { batch_id: "B1", mission_id: "FLT-77", status: "active", position: 0 }
  };
  const statement = (sql, args = []) => ({
    sql, args,
    bind(...next) { return statement(sql, next); },
    async first() {
      if (sql.includes("SELECT id,assignee,loc,status,source,screen,created_at,proof_image,proof_kind,live_shot")) return { ...state.ticket };
      if (sql.includes("SELECT inbox_id FROM fleet_ids")) return { inbox_id: 77 };
      if (sql.includes("SELECT owner,report,image,image_kind FROM mission_tasks")) return state.task && { ...state.task };
      if (sql.includes("SELECT image FROM mission_tasks WHERE mission_id=? AND image_kind='final'")) {
        return state.task && state.task.image_kind === "final" && state.task.image ? { image: state.task.image } : null;
      }
      if (sql.includes("SELECT 1 AS accepted FROM events")) return state.accepted ? { accepted: 1 } : null;
      if (sql.includes("SELECT batch_id FROM mission_batch_items")) return { batch_id: "B1" };
      if (sql.includes("SELECT * FROM mission_batch_items WHERE batch_id=? AND mission_id=?")) return { ...state.item };
      if (sql.includes("SELECT status FROM tickets")) return { status: state.ticket.status };
      if (sql.includes("SELECT * FROM mission_batches WHERE id=?")) return { ...state.batch };
      return null;
    },
    async all() {
      if (sql.includes("FROM mission_tasks WHERE mission_id=?") && sql.includes("ORDER BY code")) return { results:state.plan.map((row) => ({ ...row })) };
      if (sql.includes("FROM mission_batch_items i LEFT JOIN tickets")) return { results: [] };
      if (sql.includes("FROM mission_batch_items WHERE batch_id=? ORDER BY position")) return { results: [{ ...state.item }] };
      return { results: [] };
    },
    async run() {
      state.directRuns += 1;
      if (sql.startsWith("INSERT INTO events") && args[2] === "accept") {
        if (state.failBatchCoord) throw new Error("batch coordination failed");
        state.accepted = true;
      }
      if (sql.includes("UPDATE mission_batches SET status='completed'")) state.batch.status = "completed";
      return { meta: { changes: 1 } };
    }
  });
  const DB = {
    async exec() {},
    prepare(sql) { return statement(sql); },
    async batch(statements) {
      state.batches += 1;
      const results = statements.map((item) => {
        if (item.sql.startsWith("INSERT INTO mission_tasks")) {
          state.task = { owner: item.args[4], executor:item.args[5], report:item.args[6], image:item.args[7], image_kind:item.args[8] };
        }
        if (item.sql.startsWith("UPDATE tickets SET status='resolved'")) {
          state.ticket.status = "resolved";
          state.ticket.proof_image = item.args[1];
          state.ticket.proof_kind = "final";
        }
        if (item.sql.startsWith("UPDATE tickets SET proof_image=?,proof_kind='final',agent_runtime=")) {
          state.ticket.proof_image = item.args[0];
          state.ticket.proof_kind = "final";
          state.ticket.agent_runtime = item.args[1] || state.ticket.agent_runtime;
          state.ticket.agent_host = item.args[2] || state.ticket.agent_host;
          if (state.ticket.points_end == null) state.ticket.points_end = item.args[3];
          if (state.ticket.points_start == null) state.ticket.points_start = item.args[4];
        }
        if (item.sql.includes("UPDATE mission_batch_items SET status='completed'")) state.item.status = "completed";
        if (item.sql.includes("UPDATE mission_batches SET active_mission_id=NULL")) state.batch.active_mission_id = null;
        return { meta: { changes: 1 } };
      });
      return results;
    }
  };
  const env = {
    DB,
    MEDIA: { async head() { return { httpMetadata: { contentType: "image/png" } }; } },
    TELEGRAM: { async fetch() { state.telegramCalls += 1; return new Response("{}", { status: state.telegramFail ? 503 : 200 }); } }
  };
  return { env, state };
}

function informeRequest() {
  return new Request("https://yokup-rtc.test/fleet/informe", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ mission: "FLT-77", owner: "InfraOraculoMacMini", report: "Trabajo verificado", image: "https://yokup-rtc.test/media/fleet/0123456789abcdef.png", runtime: "Codex", host: "app" })
  });
}

test("informe open: fallo inbox no lanza ReferenceError ni muta; retry cierra", async () => {
  const { env, state } = fleetClosureEnv();
  const failed = await worker.fetch(informeRequest(), env, {});
  assert.equal(failed.status, 502);
  assert.equal((await failed.json()).code, "closure_partial");
  assert.equal(state.ticket.status, "open");
  assert.equal(state.task, null);
  assert.equal(state.batches, 0);
  assert.equal(state.directRuns, 0);

  state.telegramFail = false;
  const retried = await worker.fetch(informeRequest(), env, {});
  const result = await retried.json();
  assert.equal(retried.status, 200);
  assert.equal(result.ok, true);
  assert.equal(result.resolved, true);
  assert.equal(result.inbox_updated, true);
  assert.equal(state.ticket.status, "resolved");
  assert.equal(state.ticket.proof_kind, "final");
  assert.equal(state.task.image_kind, "final");
  assert.equal(state.batches, 1);
  assert.equal(state.telegramCalls, 4);
});

test("informe rechaza atómicamente un cierre sin proceso canónico", async () => {
  const { env, state } = fleetClosureEnv();
  state.ticket.live_shot=null; state.ticket.live_at=null; state.ticket.live_kind=null;
  const response=await worker.fetch(informeRequest(),env,{}),body=await response.json();
  assert.equal(response.status,400);
  assert.equal(body.code,"process_evidence_missing");
  assert.match(body.error,/final-fallback no sustituye el proceso/);
  assert.equal(body.applied,false);
  assert.equal(state.ticket.status,"open");
  assert.equal(state.task,null);
  assert.equal(state.batches,0);
  assert.equal(state.directRuns,0);
  assert.equal(state.telegramCalls,0,"el rechazo ocurre antes del espejo externo");
});

test("informe no acepta final-fallback como proceso previo", async () => {
  const {env,state}=fleetClosureEnv();
  state.ticket.live_kind="final-fallback"; state.ticket.live_surface=null; state.ticket.live_context=null;
  const response=await worker.fetch(informeRequest(),env,{}),body=await response.json();
  assert.equal(response.status,400);
  assert.equal(body.code,"process_evidence_missing");
  assert.equal(state.batches,0);
});

test("repetir exactamente el mismo cierre resuelto sólo completa coordinación", async () => {
  const { env, state } = fleetClosureEnv();
  state.telegramFail = false;
  await worker.fetch(informeRequest(), env, {});
  const batches = state.batches;
  const repeated = await worker.fetch(informeRequest(), env, {});
  const result = await repeated.json();
  assert.equal(repeated.status, 200);
  assert.equal(result.resumed, true);
  assert.equal(state.batches, batches, "el retry no reescribe D1");
  assert.equal(state.task.report, "Trabajo verificado");
});

test("árbol fleet auto-resuelto completa z1 y proof sin reabrir ni recalcular puntos", async () => {
  const {env,state}=fleetClosureEnv();
  state.telegramFail=false;
  state.ticket.role="status-web";
  state.ticket.status="resolved";
  state.ticket.proof_kind="final";
  state.ticket.proof_image="https://yokup-rtc.test/media/fleet/0123456789abcdef.png";
  state.ticket.points_start=0;
  state.ticket.points_end=null;
  const response=await worker.fetch(informeRequest(),env,{}),body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.repaired_auto_resolved,true);
  assert.equal(body.resolved,true);
  assert.equal(state.ticket.status,"resolved","no reabre");
  assert.equal(state.task.report,"Trabajo verificado");
  assert.equal(state.task.image_kind,"final");
  assert.equal(state.ticket.proof_image,"https://yokup-rtc.test/media/fleet/0123456789abcdef.png");
  const pointsEnd=state.ticket.points_end;
  const batches=state.batches;
  const retried=await worker.fetch(informeRequest(),env,{});
  const retry=await retried.json();
  assert.equal(retried.status,200);
  assert.equal(retry.resumed,true);
  assert.equal(retry.repaired_auto_resolved,undefined);
  assert.equal(state.ticket.status,"resolved");
  assert.equal(state.ticket.points_end,pointsEnd,"el retry no duplica puntos");
  assert.equal(state.batches,batches,"el retry exacto no reescribe D1");
});

test("standalone resuelta prematuramente repara informe canónico sin reabrir", async () => {
  const {env,state}=fleetClosureEnv();
  state.telegramFail=false;
  state.ticket.role="standalone-task";
  state.ticket.status="resolved";
  state.ticket.proof_kind="final";
  state.ticket.proof_image="https://yokup-rtc.test/media/fleet/0123456789abcdef.png";
  const response=await worker.fetch(informeRequest(),env,{}),body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.repaired_standalone,true);
  assert.equal(state.ticket.status,"resolved");
  assert.equal(state.task.report,"Trabajo verificado");
  assert.equal(state.task.image_kind,"final");
});

test("fallo de coordinación batch tras D1 se recupera con retry exacto", async () => {
  const { env, state } = fleetClosureEnv("decision-batch");
  state.failBatchCoord = true;
  const failed = await worker.fetch(informeRequest(), env, {});
  assert.equal(failed.status, 502);
  assert.equal((await failed.json()).code, "closure_partial");
  assert.equal(state.ticket.status, "resolved");
  assert.equal(state.accepted, false);
  assert.equal(state.batch.status, "active");

  state.failBatchCoord = false;
  const retried = await worker.fetch(informeRequest(), env, {});
  const result = await retried.json();
  assert.equal(retried.status, 200);
  assert.equal(result.resumed, true);
  assert.equal(result.resolved, true);
  assert.equal(state.accepted, true);
  assert.equal(state.item.status, "completed");
  assert.equal(state.batch.status, "completed");
});
