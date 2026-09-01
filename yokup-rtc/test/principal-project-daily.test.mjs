import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { identityKey, machineSuffix, parseAgentIdentity, reportAgentIdentity } from "../src/agent-identity.js";
import { madridDayKey } from "../src/display-ref.js";
import { canonicalProjectAgentRef, canonicalProjectAgentRefs } from "../src/project-member-identity.js";

const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
const grab = (name) => {
  const re = new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}\\n__name\\(${name}, "${name}"\\);`);
  const match = re.exec(source);
  assert.ok(match, `no se pudo extraer ${name}`);
  return match[0];
};

function harness() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT,blurb TEXT,web TEXT,status TEXT,color TEXT,owner TEXT,sort_order INTEGER,created_at INTEGER,updated_at INTEGER,updated_by TEXT)");
  db.exec("CREATE TABLE project_members(project_id TEXT,kind TEXT,ref TEXT,PRIMARY KEY(project_id,kind,ref))");
  db.exec("CREATE TABLE agent_project_declarations(day TEXT,agent_key TEXT,agent TEXT,project_id TEXT,declared_by TEXT,statement TEXT,created_at INTEGER,updated_at INTEGER,PRIMARY KEY(day,agent_key))");
  db.exec("CREATE TABLE tickets(project TEXT,status TEXT)");
  db.exec("INSERT INTO projects(id,name,web,status) VALUES('xpaceos','XpaceOS','https://www.xpaceos.com','activo'),('yokup','Yokup','https://www.yokup.com','activo'),('viejo','Viejo','','archivado')");
  db.exec("INSERT INTO project_members VALUES('xpaceos','agent','NeoMacMini')");
  const DB = { prepare(sql) { const stmt = db.prepare(sql); return {
    bind(...args) { return {
      first: async () => stmt.get(...args) || null,
      run: async () => ({ meta: stmt.run(...args) }),
      all: async () => ({ results: stmt.all(...args) })
    }; },
    first: async () => stmt.get() || null,
    all: async () => ({ results: stmt.all() })
  }; } };
  const context = vm.createContext({ Map, String, Date, Number, Object,
    identityKey, machineSuffix, parseAgentIdentity, reportAgentIdentity, madridDayKey,
    canonicalProjectAgentRef, canonicalProjectAgentRefs,
    ensureSchema: async () => {}, __name: (fn) => fn });
  vm.runInContext([
    grab("projectSlug"), grab("projectIndex"), grab("principalAgentIdentity"),
    grab("listPrincipalProjectDeclarations"), grab("declarePrincipalProject"), grab("listProjects")
  ].join("\n"), context);
  return { db, env: { DB }, F: context };
}

test("la declaración exige identidad operativa exacta y project_id del censo activo", async () => {
  const { env, F } = harness();
  assert.equal((await F.declarePrincipalProject(env, { agent: "Neo", project: "xpaceos" })).code, "exact_agent_required");
  assert.equal((await F.declarePrincipalProject(env, { agent: "NeoMacMini", project: "no-existe" })).code, "exact_project_required");
  assert.equal((await F.declarePrincipalProject(env, { agent: "NeoMacMini", project: "viejo" })).code, "exact_project_required");
});

test("repetir la misma declaración diaria es no-op y cambiarla actualiza una fila", async () => {
  const { db, env, F } = harness();
  const first = await F.declarePrincipalProject(env, {
    agent: "NeoMacMini", project: "xpaceos", declared_by: "Carlos",
    statement: "hoy el proyecto principal de NeoMacMini es XpaceOS"
  });
  assert.equal(first.created, true);
  assert.equal(first.declaration.project_id, "xpaceos");
  const createdAt = first.declaration.created_at;

  const repeated = await F.declarePrincipalProject(env, { agent: "NeoMacMini", project: "XpaceOS" });
  assert.equal(repeated.unchanged, true);
  assert.equal(repeated.declaration.created_at, createdAt);

  const changed = await F.declarePrincipalProject(env, { agent: "NeoMacMini", project: "yokup" });
  assert.equal(changed.changed, true);
  assert.equal(changed.declaration.project_id, "yokup");
  assert.equal(changed.declaration.created_at, createdAt, "la corrección del día conserva el origen auditable");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM agent_project_declarations").get().n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM project_members").get().n, 1, "declarar no muta el censo estable");
});

test("Niobe declara proyecto como principal canónica del Mac Mini", async () => {
  const { db, env, F } = harness();
  const created = await F.declarePrincipalProject(env, {
    agent: "NiobeMacMini", project: "yokup", declared_by: "NiobeMacMini"
  });
  assert.equal(created.ok, true);
  assert.equal(created.declaration.agent, "NiobeMacMini");
  const alias = await F.declarePrincipalProject(env, { agent: "NiobeMini", project: "yokup" });
  assert.equal(alias.unchanged, true, "NiobeMini converge a la misma declaración física");
  assert.deepEqual(JSON.parse(JSON.stringify(db.prepare("SELECT agent,agent_key,project_id FROM agent_project_declarations").get())), {
    agent:"NiobeMacMini", agent_key:"niobemacmini", project_id:"yokup"
  });
});

test("dos equipos de la misma persona conservan declaraciones independientes", async () => {
  const { env, F } = harness();
  await F.declarePrincipalProject(env, { agent: "NeoMacMini", project: "xpaceos" });
  await F.declarePrincipalProject(env, { agent: "NeoMBAAzul", project: "yokup" });
  const rows = JSON.parse(JSON.stringify(await F.listPrincipalProjectDeclarations(env)));
  assert.deepEqual(rows.map((row) => [row.agent, row.project_id]), [
    ["NeoMacMini", "xpaceos"], ["NeoMBAAzul", "yokup"]
  ]);
  assert.ok(rows.every((row) => row.day === madridDayKey(Date.now())));
  const projects = JSON.parse(JSON.stringify(await F.listProjects(env)));
  assert.deepEqual(projects.find((project) => project.id === "xpaceos").daily_primary_agents.map((row) => row.agent), ["NeoMacMini"]);
  assert.deepEqual(projects.find((project) => project.id === "yokup").daily_primary_agents.map((row) => row.agent), ["NeoMBAAzul"]);
});

test("contrato HTTP y esquema publican la fuente canónica sin tocar membresías", () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS agent_project_declarations/);
  assert.match(source, /PRIMARY KEY\(day,agent_key\)/);
  assert.match(source, /url\.pathname === "\/projects\/principal" && req\.method === "GET"/);
  assert.match(source, /url\.pathname === "\/projects\/principal" && req\.method === "POST"/);
  assert.match(source, /principal_declarations: await listPrincipalProjectDeclarations\(env\)/);
  const declarationBlock = grab("declarePrincipalProject");
  assert.doesNotMatch(declarationBlock, /project_members/);
  assert.doesNotMatch(declarationBlock, /UPDATE projects|UPDATE tickets/);
});
