import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  aggregateConsumoByProject,
  projectIdsForOwner,
  tokensUsdEstimate,
  TOKEN_USD_RATES,
  UNASSIGNED_PROJECT_ID,
  HOSTING_COST_MAP_SEED,
  HOSTING_COST_MAP_TABLE_SQL, HOSTING_COST_MAP_SEED_SQL,
} from "../src/consumo-proyectos.js";

const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
const moduleSrc = await readFile(new URL("../src/consumo-proyectos.js", import.meta.url), "utf8");

test("tarifas estimate documentadas (input/cache/output)", () => {
  assert.equal(TOKEN_USD_RATES.entrada_per_mtok, 3);
  assert.equal(TOKEN_USD_RATES.cache_per_mtok, 0.75);
  assert.equal(TOKEN_USD_RATES.salida_per_mtok, 15);
  assert.equal(tokensUsdEstimate(1e6, 1e6, 1e6), 3 + 0.75 + 15);
});

test("agente en 0 proyectos → _unassigned", () => {
  const out = aggregateConsumoByProject({
    partes: [{ owner: "GhostMacMini", machine: "MacMini", datos: { total: 100, entrada: 50, cache: 10, salida: 40 } }],
    members: [{ project_id: "yokup", kind: "agent", ref: "OraculoMini" }],
    projects: [{ id: "yokup", name: "Yokup" }],
    hostingRows: [],
    dias: 7,
  });
  assert.equal(out.proyectos.length, 1);
  assert.equal(out.proyectos[0].project_id, UNASSIGNED_PROJECT_ID);
  assert.equal(out.proyectos[0].name, "Sin asignar");
  assert.equal(out.proyectos[0].tokens.total, 100);
  assert.equal(out.proyectos[0].agents.length, 1);
});

test("agente en 1 proyecto → todo el consumo a ese proyecto", () => {
  const out = aggregateConsumoByProject({
    partes: [{ owner: "OraculoMini", machine: "MacMini", datos: { total: 200, entrada: 100, cache: 20, salida: 80 } }],
    members: [{ project_id: "yokup", kind: "agent", ref: "Oraculo" }],
    projects: [{ id: "yokup", name: "Yokup" }],
    dias: 7,
  });
  assert.equal(out.proyectos.length, 1);
  assert.equal(out.proyectos[0].project_id, "yokup");
  assert.equal(out.proyectos[0].tokens.total, 200);
  assert.equal(out.attribution, "equal_split");
});

test("agente en 2 proyectos → equal split", () => {
  const out = aggregateConsumoByProject({
    partes: [{ owner: "MorfeoMBARosa", machine: "MacBookAirRosa", datos: { total: 100, entrada: 50, cache: 0, salida: 50 } }],
    members: [
      { project_id: "yokup", kind: "agent", ref: "Morfeo" },
      { project_id: "admiranext", kind: "agent", ref: "MorfeoMBARosa" },
    ],
    projects: [
      { id: "yokup", name: "Yokup" },
      { id: "admiranext", name: "AdmiraNeXT" },
    ],
    dias: 7,
  });
  assert.equal(out.proyectos.length, 2);
  const by = Object.fromEntries(out.proyectos.map((p) => [p.project_id, p]));
  assert.equal(by.yokup.tokens.total, 50);
  assert.equal(by.admiranext.tokens.total, 50);
  assert.equal(by.yokup.agents[0].share, 0.5);
  assert.equal(out.totales.tokens.total, 100);
});

test("hosting_cost_map se suma por proyecto sin inventar factura", () => {
  const out = aggregateConsumoByProject({
    partes: [],
    members: [],
    projects: [{ id: "yokup", name: "Yokup" }],
    hostingRows: [
      { id: "d1:yokup-tickets", kind: "d1", resource: "yokup-tickets", project_id: "yokup", monthly_usd: 12, share_pct: 0, note: "est" },
      { id: "worker:yokup", kind: "worker", resource: "yokup", project_id: "yokup", monthly_usd: 8, share_pct: 10, note: "" },
    ],
    dias: 1,
  });
  assert.equal(out.proyectos[0].hosting.monthly_usd, 20);
  assert.equal(out.proyectos[0].hosting.resources.length, 2);
  assert.equal(out.totales.hosting_monthly_usd, 20);
});

test("projectIdsForOwner usa memberRefMatches (persona sin apellido)", () => {
  assert.deepEqual(
    projectIdsForOwner("NeoMacMini", [
      { project_id: "a", kind: "agent", ref: "Neo" },
      { project_id: "b", kind: "machine", ref: "MacMini" },
    ]),
    ["a"],
  );
});

test("worker cablea schema + rutas consumo/proyectos y hosting-map", () => {
  assert.match(source, /from "\.\/consumo-proyectos\.js"/);
  assert.match(source, /HOSTING_COST_MAP_TABLE_SQL/);
  assert.match(source, /HOSTING_COST_MAP_SEED_SQL/);
  assert.match(moduleSrc, /CREATE TABLE IF NOT EXISTS hosting_cost_map/);
  assert.ok(HOSTING_COST_MAP_TABLE_SQL.includes("hosting_cost_map"));
  assert.ok(HOSTING_COST_MAP_SEED_SQL.includes("INSERT OR IGNORE"));
  assert.match(source, /pathname === "\/fleet\/consumo\/proyectos"/);
  assert.match(source, /pathname === "\/fleet\/consumo\/hosting-map"/);
  assert.match(source, /HOSTING_COST_MAP_SEED/);
  assert.ok(HOSTING_COST_MAP_SEED.length >= 4);
});
