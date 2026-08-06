import test from "node:test";
import assert from "node:assert/strict";
import worker from "./src/index.js";

test("task-status sin proceso rechaza el cierre open sin auto-claim, evento, plan ni tarea", async () => {
  const now = Date.now();
  const state = { writes: [] };
  const ticket = {
    id:"DCL-atomic", source:"fleet", proof_image:null, status:"open",
    assignee:"OraculoMacMini", loc:"MacMini", created_at:now - 60_000,
    live_shot:null, live_at:null, live_kind:null, live_surface:null, live_context:null,
  };
  const tasks = [
    { mission_id:ticket.id, code:"a", title:"A", status:"done", owner:"SubOraculoMacMini", created_at:now-50_000, updated_at:now-40_000 },
    { mission_id:ticket.id, code:"b", title:"B", status:"done", owner:"SubOraculoMacMini", created_at:now-45_000, updated_at:now-30_000 },
    { mission_id:ticket.id, code:"c", title:"C", status:"in_progress", owner:"InfraOraculoMacMini", created_at:now-35_000, updated_at:now-20_000 },
  ];
  const DB = {
    async exec() {},
    prepare(sql) {
      const bound = (args) => ({
        async first() {
          if (sql.includes("SELECT id,source,proof_image,status,assignee,loc,created_at,live_shot")) return { ...ticket };
          return null;
        },
        async all() {
          if (sql.includes("FROM mission_tasks WHERE mission_id=? ORDER BY code")) return { results:tasks.map((row) => ({ ...row })) };
          if (sql.includes("FROM display_refs WHERE entity_type=?")) {
            return { results:tasks.map((row, index) => ({ entity_type:"task", entity_key:`${row.mission_id}:${row.code}`, display_ref:`00${index}` })) };
          }
          return { results:[] };
        },
        async run() {
          state.writes.push({ sql, args });
          return { meta:{ changes:1 } };
        },
      });
      return {
        bind(...args) { return bound(args); },
        all() { return bound([]).all(); },
        first() { return bound([]).first(); },
        run() { return bound([]).run(); },
      };
    },
  };
  const env = { DB, MEDIA:{ async head() { return { httpMetadata:{ contentType:"image/png" } }; } } };
  const request = new Request("https://yokup.test/fleet/task-status", {
    method:"POST", headers:{ "content-type":"application/json" },
    body:JSON.stringify({
      mission:ticket.id, code:"c", status:"done", owner:"InfraOraculoMacMini",
      image:"https://yokup.test/media/fleet/final.png",
    }),
  });

  const response = await worker.fetch(request, env, {});
  const body = await response.json();
  assert.equal(response.status, 400, JSON.stringify(body));
  assert.equal(body.code, "process_evidence_missing");
  assert.equal(body.applied, false);
  assert.deepEqual(state.writes, [], "el rechazo no puede auto-reclamar, crear eventos/plan ni actualizar tareas");
});
