// El barrido de esqueletos sólo mira misiones VIVAS (Carlos, 2026-08-10 · #1334 a).
//
// `t.status != 'resolved'` incluye a las CANCELADAS, que son casi todo lo no resuelto.
// El 10-ago el contador decía 62 esqueletos y las misiones vivas de toda la flota eran
// DOS, las dos ya con plan real: «barrer hasta que no queden esqueletos» habría gastado
// 62 llamadas de IA en reescribirle el plan a misiones muertas. Se cazó en vivo
// replanificando FLT-1252, una cancelada cuyo texto entero era «ping».
//
// Las consultas NO se copian aquí: se extraen del fuente y se ejecutan contra sqlite,
// para que el día que alguien vuelva a escribir `!= resolved` esta prueba se entere.
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");

const VIVA_SQL = (() => {
  const m = /^const VIVA_SQL = "(.+)";$/m.exec(source);
  assert.ok(m, "no se pudo extraer VIVA_SQL del fuente");
  return m[1];
})();

// El cuerpo de fleetPlanPending, para mirar sólo ahí dentro.
const cuerpo = (() => {
  const i = source.indexOf("async function fleetPlanPending(");
  const j = source.indexOf('__name(fleetPlanPending, "fleetPlanPending");');
  assert.ok(i > 0 && j > i, "no se pudo acotar fleetPlanPending");
  return source.slice(i, j);
})();

// La consulta del contador de esqueletos, tal cual está escrita, con su interpolación.
const sqlEsqueletos = (() => {
  const m = /`SELECT COUNT\(\*\) c FROM tickets t WHERE t\.source='fleet' AND \$\{VIVA_SQL\}\s*\n\s*AND \(SELECT COUNT\(\*\) FROM mission_tasks m WHERE m\.mission_id=t\.id\) = 3[^`]*`/.exec(cuerpo);
  assert.ok(m, "no se pudo extraer la consulta del contador de esqueletos");
  return m[0].slice(1, -1).replace("${VIVA_SQL}", VIVA_SQL);
})();

function db() {
  const d = new DatabaseSync(":memory:");
  d.exec("CREATE TABLE tickets(id TEXT PRIMARY KEY, source TEXT, status TEXT, created_at INTEGER)");
  d.exec("CREATE TABLE mission_tasks(mission_id TEXT, code TEXT, title TEXT, status TEXT, report TEXT, image TEXT, PRIMARY KEY(mission_id,code))");
  const mision = (id, estado, tareas) => {
    d.prepare("INSERT INTO tickets VALUES(?,?,?,?)").run(id, "fleet", estado, 1);
    for (const [code, st, report, image] of tareas)
      d.prepare("INSERT INTO mission_tasks VALUES(?,?,?,?,?,?)").run(id, code, "Implementar…", st, report, image);
  };
  const esqueleto = [["a", "pending", null, null], ["b", "pending", null, null], ["c", "pending", null, null]];
  mision("FLT-VIVA-OPEN", "open", esqueleto);
  mision("FLT-VIVA-CURSO", "in_progress", esqueleto);
  mision("FLT-CANCELADA", "cancelled", esqueleto);      // ← la que colaba antes
  mision("FLT-RESUELTA", "resolved", esqueleto);
  mision("FLT-VIVA-CON-INFORME", "open", [["a", "pending", "ya hay parte", null], ["b", "pending", null, null], ["c", "pending", null, null]]);
  mision("FLT-VIVA-CON-CAPTURA", "open", [["a", "pending", null, "http://x/p.png"], ["b", "pending", null, null], ["c", "pending", null, null]]);
  mision("FLT-VIVA-CON-DONE", "open", [["a", "done", null, null], ["b", "pending", null, null], ["c", "pending", null, null]]);
  return d;
}

test("VIVA_SQL es open o in_progress, y no «distinto de resolved»", () => {
  assert.equal(VIVA_SQL, "t.status IN ('open','in_progress')");
});

test("dentro de fleetPlanPending ya no queda ni un «status != resolved»", () => {
  assert.ok(!/status\s*!=\s*'resolved'/.test(cuerpo),
    "una cancelada volvería a entrar en la tanda de replanificación");
  assert.equal((cuerpo.match(/\$\{VIVA_SQL\}/g) || []).length, 4, "las cuatro consultas de tanda y contador usan VIVA_SQL");
  assert.match(cuerpo, /AND " \+ VIVA_SQL/, "la consulta de una sola misión también");
});

test("el contador cuenta las vivas con esqueleto y NO las canceladas ni las resueltas", () => {
  const d = db();
  const ids = d.prepare(sqlEsqueletos.replace("COUNT(*) c", "t.id id")).all().map((r) => r.id);
  assert.deepEqual(ids.sort(), ["FLT-VIVA-CURSO", "FLT-VIVA-OPEN"]);
  assert.equal(d.prepare(sqlEsqueletos).get().c, 2);
});

test("una misión viva con informe, captura o done NO cuenta como esqueleto", () => {
  const d = db();
  const ids = d.prepare(sqlEsqueletos.replace("COUNT(*) c", "t.id id")).all().map((r) => r.id);
  for (const id of ["FLT-VIVA-CON-INFORME", "FLT-VIVA-CON-CAPTURA", "FLT-VIVA-CON-DONE"])
    assert.ok(!ids.includes(id), id + " tiene trabajo dentro: no se replanifica");
});

// Las dos puertas al mismo árbol tienen que decir lo mismo: /fleet/plan-tasks ya se
// niega a tocar una cancelada, así que el planificador tampoco puede hacerlo.
test("plan-tasks y el planificador coinciden en no tocar una misión cerrada", () => {
  assert.match(source, /su árbol no se reescribe/);
});
