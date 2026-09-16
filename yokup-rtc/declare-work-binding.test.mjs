// /declare ata la sesión al trabajo declarado desde el CLI, y lo cuenta.
// Antes no: la ruta insertaba las tareas y escribía started_at sin atar nada, así que
// ningún agente de consola podía salir como running (sessionUnverified lo devolvía a
// assigned_stale). Medido el 16-09-2026: avance de hace 29 s y estado parado,
// 17 sesiones con no_linked_work y running_count 0. Misión DCL-50bc90c3245a3e463a6d9f80.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");

function fuente(nombre) {
  const inicio = source.indexOf(`async function ${nombre}(`);
  assert.notEqual(inicio, -1, `falta ${nombre}`);
  const llave = source.indexOf("{", inicio);
  let nivel = 0, comilla = "", escapado = false;
  for (let i = llave; i < source.length; i += 1) {
    const c = source[i];
    if (comilla) {
      if (escapado) escapado = false;
      else if (c === "\\") escapado = true;
      else if (c === comilla) comilla = "";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { comilla = c; continue; }
    if (c === "{") nivel += 1;
    else if (c === "}" && --nivel === 0) return source.slice(inicio, i + 1);
  }
  throw new Error(`${nombre} incompleta`);
}

// El entorno mínimo: un D1 de mentira y un binder espía en lugar del real.
// Un objeto creado dentro del vm pertenece a otro realm y deepEqual lo rechaza
// aunque la forma sea idéntica: se compara aplanado.
const plano = (v) => JSON.parse(JSON.stringify(v));

function monta({ mission = { loc: "MacBook Pro 16" }, tareas = {} } = {}) {
  const atados = [];
  const env = { DB: { prepare(sql) {
    return { bind(...args) { return { async first() {
      if (sql.includes("FROM tickets")) return mission;
      if (sql.includes("FROM mission_tasks")) return tareas[args[1]] || null;
      return null;
    } }; } };
  } } };
  const ctx = vm.createContext({ __name: () => {}, console,
    bindPresenceWork: async (e, persona, machine, ref, selector) => {
      atados.push({ persona, machine, ref, selector });
      return { bound: true, reason: "bound" };
    } });
  vm.runInContext(`${fuente("bindDeclaredWork")}\nglobalThis.ata = bindDeclaredWork;`, ctx);
  return { ata: ctx.ata, atados, env };
}

const TAREAS = {
  a: { owner: "NeoMBP16", executor: "SubNeoMBP16" },
  b: { owner: "NeoMBP16", executor: "" },
};

test("ata cada tarea en curso con su referencia mission:code", async () => {
  const { ata, atados, env } = monta({ tareas: TAREAS });
  const r = await ata(env, "DCL-1", ["a"], undefined);
  assert.deepEqual(atados, [{ persona: "SubNeoMBP16", machine: "MacBook Pro 16", ref: "DCL-1:a", selector: undefined }]);
  assert.deepEqual(plano(r), { a: { bound: true, reason: "bound" } });
});

test("si la tarea no declara ejecutor, ata a su dueño", async () => {
  const { ata, atados, env } = monta({ tareas: TAREAS });
  await ata(env, "DCL-1", ["b"], undefined);
  assert.equal(atados[0].persona, "NeoMBP16");
});

test("la máquina sale del ticket, no de quien llama", async () => {
  const { ata, atados, env } = monta({ mission: { loc: "MacMini" }, tareas: TAREAS });
  await ata(env, "DCL-1", ["a"], undefined);
  assert.equal(atados[0].machine, "MacMini");
});

test("el selector de sesión del cliente viaja tal cual al binder", async () => {
  const selector = { runtime: "Claude", host: "app", session_id: "s-42" };
  const { ata, atados, env } = monta({ tareas: TAREAS });
  await ata(env, "DCL-1", ["a"], selector);
  assert.deepEqual(atados[0].selector, selector);
});

test("sin tareas en curso no se ata nada: declarar no es trabajar", async () => {
  const { ata, atados, env } = monta({ tareas: TAREAS });
  assert.deepEqual(plano(await ata(env, "DCL-1", [], undefined)), {});
  assert.equal(atados.length, 0);
});

test("una tarea que no existe se salta sin romper la declaración", async () => {
  const { ata, atados, env } = monta({ tareas: TAREAS });
  const r = await ata(env, "DCL-1", ["a", "z"], undefined);
  assert.deepEqual(Object.keys(r), ["a"]);
  assert.equal(atados.length, 1);
});

test("sin misión no se inventa una atadura", async () => {
  const { ata, atados, env } = monta({ mission: null, tareas: TAREAS });
  assert.deepEqual(plano(await ata(env, "DCL-1", ["a"], undefined)), {});
  assert.equal(atados.length, 0);
});

test("/declare ata solo lo que queda en curso y devuelve el work_binding", () => {
  assert.match(source, /const enCurso = tasks\.filter\(\(t\) => \["in_progress", "doing", "active"\]\.includes\(t\.status\)\);/);
  assert.match(source, /const work_bindings = await bindDeclaredWork\(env, missionId, enCurso\.map\(\(t\) => t\.code\), b\.work_session\);/);
  assert.match(source, /work_binding: work_bindings\[t\.code\] \|\| null/);
});
