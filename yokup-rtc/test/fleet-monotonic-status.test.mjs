import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");

test("el reconciliador individual no degrada en curso a pendiente por un árbol 0/N", () => {
  const start = source.indexOf("async function fleetReconcileMission(env, mid)");
  const end = source.indexOf("__name(fleetReconcileMission", start);
  const block = source.slice(start, end);

  assert.match(block, /const derived = allDone && proof[\s\S]*t\.status === "in_progress" && derived === "open" \? "in_progress" : derived/);
});

test("el barrido global aplica la misma transición monotónica", () => {
  const start = source.indexOf("async function fleetReconcileAll(env)");
  const end = source.indexOf("__name(fleetReconcileAll", start);
  const block = source.slice(start, end);

  assert.match(block, /const derived = allDone && proof[\s\S]*r\.status === "in_progress" && derived === "open" \? "in_progress" : derived/);
});

test("el espejo de Telegram tampoco degrada un progreso ya confirmado", () => {
  const start = source.indexOf("async function fleetSync(env)");
  const end = source.indexOf("__name(fleetSync", start);
  const block = source.slice(start, end);

  assert.match(block, /prev\.status === "in_progress" && st === "open"\) st = "in_progress"/);
});

test("la política conserva en curso pero permite las promociones legítimas", () => {
  const monotonic = (current, derived) =>
    current === "in_progress" && derived === "open" ? "in_progress" : derived;

  assert.equal(monotonic("in_progress", "open"), "in_progress");
  assert.equal(monotonic("open", "in_progress"), "in_progress");
  assert.equal(monotonic("in_progress", "resolved"), "resolved");
  assert.equal(monotonic("open", "open"), "open");
});
