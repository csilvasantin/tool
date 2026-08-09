// El agente escribe su propio árbol (Carlos, 2026-08-09).
//
// Lo que se protege aquí es que ampliar el plan NUNCA destruya: `saveMissionPlan`
// borra el plan entero antes de reescribirlo, y ese era el único camino que había
// para tocar tareas. Si `mergeMissionPlan` se comportara igual, un agente que sólo
// quiere colgar «a1» borraría el informe y la captura que otro ya dejó en «b».
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { baseAgentIdentity, scopedAgentIdentity, parseAgentIdentity, sameAgentFamily } from "../src/agent-identity.js";

const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
const grab = (name) => {
  const re = new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}\\n__name\\(${name}, "${name}"\\);`);
  const match = re.exec(source);
  assert.ok(match, `no se pudo extraer ${name}`);
  return match[0];
};
const grabVar = (name) => {
  const re = new RegExp(`^var ${name} = .*$`, "m");
  const match = re.exec(source);
  assert.ok(match, `no se pudo extraer ${name}`);
  return match[0];
};

function harness() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE mission_tasks(mission_id TEXT,code TEXT,title TEXT,status TEXT,owner TEXT,report TEXT,image TEXT,image_kind TEXT,created_at INTEGER,updated_at INTEGER,PRIMARY KEY(mission_id,code))");
  const DB = { prepare(sql) { const stmt = db.prepare(sql); return {
    bind(...args) { return {
      first: async () => stmt.get(...args) || null,
      run: async () => ({ meta: stmt.run(...args) }),
      all: async () => ({ results: stmt.all(...args) })
    }; }
  }; } };
  const listMissionTasks = async (_env, id) =>
    DB.prepare("SELECT * FROM mission_tasks WHERE mission_id=? ORDER BY code").bind(id).all().then((r) => r.results);
  const context = vm.createContext({
    String, Date, Array, Set, Map, RegExp, Object,
    baseAgentIdentity, scopedAgentIdentity, parseAgentIdentity, sameAgentFamily,
    listMissionTasks, __name: (fn) => fn
  });
  vm.runInContext([
    grabVar("SKELETON_TITLE_RE"),
    ["ownerFor", "scopedMissionOwner", "isVirginSkeleton", "mergeMissionPlan"].map(grab).join("\n")
  ].join("\n"), context);
  return { db, env: { DB }, F: context };
}

const TICKET = { assignee: "MorfeoMacMini", loc: "MacMini" };
const seed = (db, rows) => {
  for (const r of rows) {
    db.prepare("INSERT INTO mission_tasks(mission_id,code,title,status,owner,report,image,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .run("FLT-T", r.code, r.title, r.status || "pending", r.owner || "SubMorfeoMacMini", r.report || null, r.image || null, 1, 1);
  }
};
const esqueleto = [
  { code: "a", title: "Implementar: arreglar la presencia" },
  { code: "b", title: "Probar y aportar evidencia: arreglar la presencia" },
  { code: "c", title: "Documentar y reportar el resultado" }
];

test("el esqueleto de fábrica intacto se reconoce; tocado, ya no", () => {
  const { F } = harness();
  assert.equal(F.isVirginSkeleton(esqueleto.map((t) => ({ ...t, status: "pending" }))), true);
  // El auto-pickup marca «a» en curso a los segundos del alta. Reclamar no es
  // trabajar: si no hay informe ni captura, sigue siendo sustituible.
  assert.equal(F.isVirginSkeleton(esqueleto.map((t, i) => ({ ...t, status: i ? "pending" : "in_progress" }))), true);
  // Un solo hecho dentro —un done, un informe o una prueba— y deja de serlo.
  assert.equal(F.isVirginSkeleton(esqueleto.map((t, i) => ({ ...t, status: i ? "pending" : "done" }))), false);
  assert.equal(F.isVirginSkeleton(esqueleto.map((t, i) => ({ ...t, status: "pending", report: i ? "" : "hecho" }))), false);
  assert.equal(F.isVirginSkeleton(esqueleto.map((t, i) => ({ ...t, status: "pending", image: i ? "" : "https://x/y.png" }))), false);
  // Un plan real nunca es esqueleto, aunque esté entero pendiente.
  assert.equal(F.isVirginSkeleton([
    { code: "a", title: "Recolectar commits del fin de semana", status: "pending" },
    { code: "b", title: "Verificar producción", status: "pending" },
    { code: "c", title: "Publicar el parte", status: "pending" }
  ]), false);
  // Con subtareas ya no lo es: el esqueleto son exactamente tres filas.
  assert.equal(F.isVirginSkeleton([...esqueleto.map((t) => ({ ...t, status: "pending" })), { code: "a1", title: "x", status: "pending" }]), false);
});

test("el agente cuelga sus subtareas y la madre entra antes que la hija venga donde venga", async () => {
  const { db, env, F } = harness();
  seed(db, esqueleto);
  // «a1» llega ANTES que su madre «b»: el merge ordena por código, así que una
  // tarea madre declarada en la misma tanda ya existe cuando le toca a su hija.
  const r = await F.mergeMissionPlan(env, "FLT-T", [
    { code: "b1", title: "Sondear los dominios" },
    { code: "a1", title: "Fetch a origin y listar commits" },
    { code: "a2", title: "Leer AgoraMatrix" }
  ], TICKET);
  assert.deepEqual(Array.from(r.added), ["a1", "a2", "b1"]);
  assert.deepEqual(Array.from(r.tasks.map((t) => t.code)), ["a", "a1", "a2", "b", "b1", "c"]);
  // Se cuelgan del agente de la misión, no del genérico «subagente».
  assert.equal(r.tasks.find((t) => t.code === "a1").owner, "SubMorfeoMacMini");
});

test("ampliar el árbol no borra el trabajo ya hecho por otro", async () => {
  const { db, env, F } = harness();
  seed(db, [
    { code: "a", title: "Recolectar el trabajo del fin de semana" },
    { code: "b", title: "Verificar producción", status: "done", report: "verificado en real", image: "https://x/y.png" },
    { code: "c", title: "Publicar el parte" }
  ]);
  const r = await F.mergeMissionPlan(env, "FLT-T", [
    { code: "a1", title: "Fetch a origin" },
    { code: "b", title: "Otro título para b" }
  ], TICKET);
  const b = r.tasks.find((t) => t.code === "b");
  assert.equal(b.title, "Verificar producción");
  assert.equal(b.status, "done");
  assert.equal(b.report, "verificado en real");
  assert.equal(b.image, "https://x/y.png");
  assert.deepEqual(Array.from(r.retitled), []);
  assert.match(r.ignored.find((i) => i.code === "b").why, /avance, informe o prueba/);
  // Y las tres tareas siguen ahí: el merge no borra nunca.
  assert.equal(r.tasks.filter((t) => t.code.length === 1).length, 3);
});

test("un título de fábrica sí se corrige, porque nadie lo ha tocado", async () => {
  const { db, env, F } = harness();
  seed(db, esqueleto);
  const r = await F.mergeMissionPlan(env, "FLT-T", [
    { code: "a", title: "Recolectar commits, tags y Ágora del fin de semana" }
  ], TICKET);
  assert.deepEqual(Array.from(r.retitled), ["a"]);
  assert.equal(r.tasks.find((t) => t.code === "a").title, "Recolectar commits, tags y Ágora del fin de semana");
});

test("una tarea reclamada por el auto-pickup se retitula si aún es la de fábrica, y no si ya es real", async () => {
  const { db, env, F } = harness();
  seed(db, [
    { code: "a", title: "Implementar: lo que sea", status: "in_progress" },
    { code: "b", title: "Sondear los dominios cabecera", status: "in_progress" },
    { code: "c", title: "Documentar y reportar el resultado" }
  ]);
  const r = await F.mergeMissionPlan(env, "FLT-T", [
    { code: "a", title: "Abrir el carril público /fleet/plan-tasks" },
    { code: "b", title: "Otro título para b" }
  ], TICKET);
  assert.deepEqual(Array.from(r.retitled), ["a"]);
  assert.equal(r.tasks.find((t) => t.code === "b").title, "Sondear los dominios cabecera");
  assert.match(r.ignored.find((i) => i.code === "b").why, /avance, informe o prueba/);
});

test("la regla de los tercios se aplica en la puerta: ni cuartas subtareas ni pasos d..h", async () => {
  const { db, env, F } = harness();
  seed(db, esqueleto);
  const r = await F.mergeMissionPlan(env, "FLT-T", [
    { code: "a1", title: "uno" }, { code: "a2", title: "dos" }, { code: "a3", title: "tres" },
    { code: "d", title: "un cuarto paso" },
    { code: "a4", title: "una cuarta subtarea" },
    { code: "z1", title: "cierre a mano" }
  ], TICKET);
  assert.deepEqual(Array.from(r.added), ["a1", "a2", "a3"]);
  for (const code of ["d", "a4", "z1"]) {
    assert.ok(r.ignored.some((i) => i.code === code), `${code} debería quedar fuera`);
  }
  assert.equal(r.tasks.length, 6);
});

test("la cuarta subtarea de un paso que ya tiene tres se rechaza con su motivo", async () => {
  const { db, env, F } = harness();
  seed(db, [...esqueleto,
    { code: "a1", title: "uno" }, { code: "a2", title: "dos" }, { code: "a3", title: "tres" }]);
  const r = await F.mergeMissionPlan(env, "FLT-T", [{ code: "b1", title: "válida" }], TICKET);
  assert.deepEqual(Array.from(r.added), ["b1"]);
  const r2 = await F.mergeMissionPlan(env, "FLT-T", [{ code: "a1", title: "uno" }], TICKET);
  assert.match(r2.ignored[0].why, /ya decía eso/);
});

test("una subtarea huérfana no se cuela", async () => {
  const { db, env, F } = harness();
  seed(db, [{ code: "a", title: "Implementar: algo" }]);
  const r = await F.mergeMissionPlan(env, "FLT-T", [{ code: "c1", title: "sin madre" }], TICKET);
  assert.deepEqual(Array.from(r.added), []);
  assert.match(r.ignored[0].why, /madre/);
});
