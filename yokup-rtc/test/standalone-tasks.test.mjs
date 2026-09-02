import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {DatabaseSync} from "node:sqlite";
import {readFile} from "node:fs/promises";
import {baseAgentIdentity, scopedAgentIdentity, reportAgentIdentity} from "../src/agent-identity.js";

const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
const grab = (name) => {
  const re = new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}\\n__name\\(${name}, "${name}"\\);`);
  const match = re.exec(source);
  assert.ok(match, `no se pudo extraer ${name}`);
  return match[0];
};

function harness() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE mission_tasks(mission_id TEXT,code TEXT,title TEXT,status TEXT,owner TEXT,report TEXT,image TEXT,created_at INTEGER,updated_at INTEGER,executor TEXT,PRIMARY KEY(mission_id,code))");
  const DB = {prepare(sql) { const stmt = db.prepare(sql); return {
    bind(...args) { return {
      first: async () => stmt.get(...args) || null,
      run: async () => ({meta: stmt.run(...args)}),
      all: async () => ({results: stmt.all(...args)})
    }; }
  }; }};
  const listMissionTasks = async (_env, id) => DB.prepare("SELECT * FROM mission_tasks WHERE mission_id=? ORDER BY code").bind(id).all().then((r) => r.results);
  const context = vm.createContext({String, Date, baseAgentIdentity, scopedAgentIdentity, reportAgentIdentity, listMissionTasks, __name: (fn) => fn});
  vm.runInContext(["cleanMissionAttributions", "quitarPreambuloDeAgente", "fleetSubject", "fleetStandaloneTask", "ensureFleetStandaloneTask"].map(grab).join("\n"), context);
  return {db, env: {DB}, F: context};
}

test("el marcador de tarea suelta no contamina el título visible", () => {
  const {F} = harness();
  assert.equal(F.fleetStandaloneTask("[TAREA SUELTA] Dibujar un plátano en ASCII."), true);
  assert.equal(F.fleetStandaloneTask("Dibujar un plátano en ASCII."), false);
  assert.equal(F.fleetSubject("[TAREA SUELTA] Dibujar un plátano en ASCII."), "Dibujar un plátano en ASCII.");
});

test("fleetSubject retira atribuciones editoriales sin perder el contenido posterior", () => {
  const {F} = harness();
  assert.equal(
    F.fleetSubject("Recuperar usuarios. Encargo de Carlos el 7-ago-2026: es importantísima y tiene que quedar visible."),
    // Desde el 7-ago la frase que queda detrás recupera su mayúscula (FLT-1268):
    // se borra un metadato, no se estropea la redacción.
    "Recuperar usuarios. Es importantísima y tiene que quedar visible."
  );
  assert.equal(
    F.fleetSubject("Mejoras de AdmiraNeXT. Responsable MorfeoMacMini. Estado medido hoy en producción."),
    "Mejoras de AdmiraNeXT. Estado medido hoy en producción."
  );
  assert.equal(
    F.fleetSubject("Corregir presencia. Responsable: Morfeo en MacMini. Proyecto: AdmiraNeXT."),
    "Corregir presencia. Proyecto: AdmiraNeXT."
  );
});

test("fleetSubject no recorta menciones sustantivas parecidas a una atribución", () => {
  const {F} = harness();
  for (const title of [
    "Mejorar el campo Responsable de carbono",
    "Responsable de revisar los permisos antes de publicar",
    "Documentar «Encargo de Carlos el 7-ago-2026» como ejemplo",
    "Encargo de Carlos el Grande para la exposición",
  ]) assert.equal(F.fleetSubject(title), title);
});

test("una tarea suelta crea una sola fila y conserva misión-contenedor", async () => {
  const {db, env, F} = harness();
  const assignment = {assignee: "OraculoMBAPlata", loc: "MacBookAirPlata"};
  await F.ensureFleetStandaloneTask(env, "FLT-TEST", "Dibujar un plátano en ASCII.", assignment, false);
  const rows = db.prepare("SELECT code,title,status,owner FROM mission_tasks ORDER BY code").all().map((row) => ({...row}));
  assert.deepEqual(rows, [{code:"a", title:"Dibujar un plátano en ASCII.", status:"pending", owner:"OraculoMBAPlata"}]);
  await F.ensureFleetStandaloneTask(env, "FLT-TEST", "Dibujar un plátano en ASCII.", assignment, false);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM mission_tasks").get().n, 1);
});

test("la reparación elimina ceremonia pendiente, nunca trabajo iniciado", async () => {
  const {db, env, F} = harness();
  const insert = db.prepare("INSERT INTO mission_tasks(mission_id,code,title,status,owner,report,image,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)");
  insert.run("FLT-TEST", "a", "Tarea real", "pending", "SubOraculoMBAPlata", null, null, 1, 1);
  insert.run("FLT-TEST", "b", "Ceremonia", "pending", "SubOraculoMBAPlata", null, null, 1, 1);
  insert.run("FLT-TEST", "c", "Evidencia ya iniciada", "in_progress", "InfraOraculoMBAPlata", null, null, 1, 1);
  await F.ensureFleetStandaloneTask(env, "FLT-TEST", "Tarea real", {assignee:"OraculoMBAPlata",loc:"MacBookAirPlata"}, false);
  assert.deepEqual(db.prepare("SELECT code,status FROM mission_tasks ORDER BY code").all().map((row) => ({...row})), [
    {code:"a",status:"pending"}, {code:"c",status:"in_progress"}
  ]);
});

test("fleetSync distingue el encargo y no genera el plan A/B/C", () => {
  const start = source.indexOf("async function fleetSync(env)");
  const block = source.slice(start, source.indexOf("__name(fleetSync", start));
  assert.match(block, /const standalone = fleetStandaloneTask\(it\.text\)/);
  assert.match(block, /if \(standalone\) await ensureFleetStandaloneTask/);
  assert.match(source, /role = standalone \? "standalone-task"/);
});
