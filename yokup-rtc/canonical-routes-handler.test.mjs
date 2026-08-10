import test from "node:test";
import assert from "node:assert/strict";
import worker from "./src/index.js";

function emptyEnv() {
  const statement = (sql, args = []) => ({
    sql, args,
    bind(...next) { return statement(sql, next); },
    async run() { return { meta: { changes: 0 } }; },
    async first() { return null; },
    async all() { return { results: [] }; }
  });
  return {
    DB: {
      async exec() {},
      prepare(sql) { return statement(sql); },
      async batch() { return []; }
    }
  };
}

test("GET /fleet/cli conserva handler JSON y no cae al fallback 200", async () => {
  const response = await worker.fetch(new Request("https://api.yokup.test/fleet/cli"), emptyEnv(), {});
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /^application\/json/);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.ok(Array.isArray(body.items));
});

test("GET /fleet/onidle-state con identidad exacta conserva handler JSON", async () => {
  const url = "https://api.yokup.test/fleet/onidle-state?agent=OraculoMini&machine=admira-macmini";
  const response = await worker.fetch(new Request(url), emptyEnv(), {});
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /^application\/json/);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(typeof body.can_open, "boolean");
});

test("una ruta realmente desconocida conserva el fallback compatible text/plain", async () => {
  const response = await worker.fetch(new Request("https://api.yokup.test/ruta-que-no-existe"), emptyEnv(), {});
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /^text\/plain/);
  assert.equal(await response.text(), "yokup-rtc · helpdesk API + realtime");
});
