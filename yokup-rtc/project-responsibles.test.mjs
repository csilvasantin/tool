// FLT-1505 · contrato persistente y autenticado de responsables por proyecto.
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import worker from "./src/index.js";
import {
  PROJECT_BOTH_RESPONSIBLES_CAS_SQL,
  PROJECT_CARBON_CAS_SQL,
  PROJECT_METADATA_UPSERT_SQL,
  PROJECT_SILICON_CAS_SQL,
  validateProjectResponsibleTypes
} from "./src/project-responsibles.js";

const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
const migration = await readFile(new URL("./migrations/0009_project_responsibles.sql", import.meta.url), "utf8");
const start = source.indexOf('if (url.pathname === "/projects/responsibles"');
const end = source.indexOf('if (url.pathname === "/projects/principal"', start);
const endpoint = source.slice(start, end);

test("el modelo separa carbono de owner, que sigue siendo el responsable de silicio", () => {
  assert.match(source, /ALTER TABLE projects ADD COLUMN owner TEXT/);
  assert.match(source, /carbon_responsible TEXT NOT NULL DEFAULT ''/);
  assert.match(source, /ALTER TABLE projects ADD COLUMN carbon_responsible TEXT NOT NULL DEFAULT ''/);
  assert.match(migration, /ADD COLUMN carbon_responsible TEXT NOT NULL DEFAULT ''/);
  assert.doesNotMatch(migration, /ADD COLUMN owner/);
});

test("GET /projects publica nombres explícitos sin romper los alias históricos", () => {
  assert.match(source, /owner: canonicalOwner/);
  assert.match(source, /primary_responsible: canonicalOwner \|\| "NeoMacMini"/);
  assert.match(source, /silicon_responsible: siliconResponsible/);
  assert.match(source, /carbon_responsible: carbonResponsible/);
});

test("el alta histórica acepta aliases de Silicio y una edición existente preserva gobierno", () => {
  assert.match(source, /b && b\.silicon_responsible !== undefined/);
  assert.match(source, /b && b\.primary_responsible !== undefined/);
  assert.match(source, /const primaryResponsible = prev \? canonicalProjectAgentRef\(prev\.owner \|\| ""\) : requestedSiliconResponsible/);
  assert.match(source, /owner: primaryResponsible/);
});

test("POST /projects inicializa Carbono y editar otros metadatos conserva el valor", () => {
  assert.match(source, /const carbonResponsible = prev[\s\S]*?projectCarbonResponsible\(prev\.carbon_responsible\)/);
  assert.match(source, /carbon_responsible: carbonResponsible/);
  assert.match(source, /env\.DB\.prepare\(PROJECT_METADATA_UPSERT_SQL\)/);
  assert.doesNotMatch(PROJECT_METADATA_UPSERT_SQL, /DO UPDATE SET[^;]*owner=|DO UPDATE SET[^;]*carbon_responsible=/);
});

test("Mallory no puede reescribir responsables mediante el POST histórico", () => {
  const db = casDb();
  const result = db.prepare(PROJECT_METADATA_UPSERT_SQL).run(
    "yokup", "Yokup comprometido", "nuevo blurb", "www.yokup.com", "activo", "#fff",
    "MalloryMacMini", "Mallory", 1, 2, "mallory@example.com"
  );
  assert.equal(result.changes, 1);
  assert.deepEqual({ ...db.prepare("SELECT name,blurb,owner,carbon_responsible FROM projects WHERE id='yokup'").get() }, {
    name: "Yokup comprometido", blurb: "nuevo blurb", owner: "NiobeMacMini", carbon_responsible: "Carlos"
  });
  db.close();
});

test("un alta nueva sí puede inicializar ambos responsables", () => {
  const db = casDb();
  db.prepare(PROJECT_METADATA_UPSERT_SQL).run(
    "nuevo", "Nuevo", "", "", "activo", "", "NiobeMacMini", "Carlos", 10, 10, "creator@example.com"
  );
  assert.deepEqual({ ...db.prepare("SELECT owner,carbon_responsible FROM projects WHERE id='nuevo'").get() }, {
    owner: "NiobeMacMini", carbon_responsible: "Carlos"
  });
  db.close();
});

test("POST /projects rechaza tipos inválidos antes de tocar D1", async () => {
  const env = {};
  Object.defineProperty(env, "DB", {
    get() { throw new Error("D1 no debe tocarse para un body inválido"); }
  });
  const invalid = [
    { carbon_responsible: { nombre: "Mallory" } },
    { silicon_responsible: ["Mallory"] },
    { primary_responsible: 7 },
    { expected_carbon_responsible: null },
    { expected_silicon_responsible: { stale: true } }
  ];
  for (const fields of invalid) {
    const response = await worker.fetch(new Request("https://api.yokup.test/projects", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "nuevo-mallory", name: "Nuevo Mallory", ...fields })
    }), env, {});
    assert.equal(response.status, 400, JSON.stringify(fields));
    assert.match((await response.json()).error, /debe ser string/);
  }
  const routeStart = source.indexOf('if (url.pathname === "/projects" && req.method === "POST")');
  const routeEnd = source.indexOf('if (url.pathname === "/projects/importance"', routeStart);
  const route = source.slice(routeStart, routeEnd);
  assert.ok(route.indexOf("validateProjectResponsibleTypes(b)") < route.indexOf("upsertProject(env, b)"));
});

test("la edición dedicada exige sesión y atribuye updated_by al usuario autenticado", () => {
  assert.ok(start >= 0, "falta POST /projects/responsibles");
  assert.match(endpoint, /req\.method === "POST"/);
  assert.match(endpoint, /const sess = await requireAuth\(env, req\)/);
  assert.match(endpoint, /if \(!sess\).*unauthorized.*401/);
  assert.match(endpoint, /String\(sess\.email \|\| sess\.user \|\| "web"\)/);
  assert.doesNotMatch(endpoint, /b\.by|b\.updated_by/);
});

test("el endpoint usa el id exacto y distingue inexistente de archivado", () => {
  assert.match(endpoint, /SELECT id,status,owner,carbon_responsible,updated_at,updated_by FROM projects WHERE id=\?/);
  assert.doesNotMatch(endpoint, /projectSlug|projectIndex/);
  assert.match(endpoint, /project no existe en el censo.*404/);
  assert.match(endpoint, /project archivado.*409/);
});

test("cada responsable puede actualizarse solo y la cadena vacía borra carbono", () => {
  assert.match(endpoint, /hasOwnProperty\.call\(b \|\| \{\}, "silicon_responsible"\)/);
  assert.match(endpoint, /hasOwnProperty\.call\(b \|\| \{\}, "carbon_responsible"\)/);
  assert.match(endpoint, /projectCarbonResponsible\(b\.carbon_responsible\)/);
  assert.match(endpoint, /PROJECT_BOTH_RESPONSIBLES_CAS_SQL/);
  assert.match(endpoint, /PROJECT_SILICON_CAS_SQL/);
  assert.match(endpoint, /PROJECT_CARBON_CAS_SQL/);
});

test("silicio conserva la identidad canónica y carbono admite un nombre humano acotado", () => {
  assert.match(endpoint, /canonicalProjectAgentRef\(siliconInput\.trim\(\)\.slice\(0, 80\)\)/);
  assert.match(endpoint, /carbon_responsible[\s\S]*?trim\(\)\.slice\(0, 80\)/);
  assert.match(endpoint, /\\p\{Cc\}/u);
  assert.doesNotMatch(endpoint, /project_members|carbon_members/);
});

test("repetir ambos responsables es idempotente", () => {
  assert.match(endpoint, /!siliconChanged && !carbonChanged/);
  assert.match(endpoint, /changed: false/);
  assert.match(endpoint, /changed: true/);
});

test("cada campo incluido exige su expected y un conflicto devuelve los dos valores actuales", () => {
  assert.match(endpoint, /hasSilicon && !Object\.prototype\.hasOwnProperty\.call\(b \|\| \{\}, "expected_silicon_responsible"\)/);
  assert.match(endpoint, /hasCarbon && !Object\.prototype\.hasOwnProperty\.call\(b \|\| \{\}, "expected_carbon_responsible"\)/);
  assert.match(endpoint, /current_silicon_responsible: latestSilicon/);
  assert.match(endpoint, /current_carbon_responsible: latestCarbon/);
  assert.match(endpoint, /current_updated_at: Number\(latest\.updated_at\) \|\| 0/);
  assert.match(endpoint, /current_updated_by: latest\.updated_by \|\| ""/);
  assert.match(endpoint, /responsibles conflict/);
});

test("objetos, arrays, números y null se rechazan en todos los campos de responsables", () => {
  const fields = [
    "carbon_responsible", "expected_carbon_responsible",
    "silicon_responsible", "primary_responsible", "expected_silicon_responsible"
  ];
  for (const field of fields) {
    for (const bad of [{ nombre: "Mallory" }, ["Mallory"], 7, null]) {
      assert.deepEqual(validateProjectResponsibleTypes({ [field]: bad }), { ok: false, field }, `${field}: ${JSON.stringify(bad)}`);
    }
    assert.deepEqual(validateProjectResponsibleTypes({ [field]: "" }), { ok: true }, `${field}: vacío válido`);
    assert.deepEqual(validateProjectResponsibleTypes({ [field]: "Carlos" }), { ok: true }, `${field}: string válido`);
  }
  assert.ok(endpoint.indexOf("validateProjectResponsibleTypes(b)") < endpoint.indexOf("projectCarbonResponsible(b.carbon_responsible)"));
  assert.match(endpoint, /if \(!validTypes\.ok\)[\s\S]*?400/);
});

function casDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT,blurb TEXT,web TEXT,status TEXT,color TEXT,owner TEXT,carbon_responsible TEXT,created_at INTEGER,updated_at INTEGER,updated_by TEXT)");
  db.prepare("INSERT INTO projects(id,name,status,owner,carbon_responsible,created_at,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?)")
    .run("yokup", "Yokup", "activo", "NiobeMacMini", "Carlos", 1, 1, "seed");
  return db;
}

test("dos pestañas de Carbono: la primera gana y la segunda detecta el CAS", () => {
  const db = casDb();
  const tabA = db.prepare("SELECT carbon_responsible FROM projects WHERE id='yokup'").get().carbon_responsible;
  const tabB = tabA;
  const first = db.prepare(PROJECT_CARBON_CAS_SQL).run("Alicia", 2, "a@example.com", "yokup", tabA);
  const second = db.prepare(PROJECT_CARBON_CAS_SQL).run("Beatriz", 3, "b@example.com", "yokup", tabB);
  assert.equal(first.changes, 1);
  assert.equal(second.changes, 0);
  assert.equal(db.prepare("SELECT carbon_responsible FROM projects WHERE id='yokup'").get().carbon_responsible, "Alicia");
  db.close();
});

test("pestañas de Carbono y Silicio no se pisan entre sí", () => {
  const db = casDb();
  const before = db.prepare("SELECT owner,carbon_responsible FROM projects WHERE id='yokup'").get();
  const carbon = db.prepare(PROJECT_CARBON_CAS_SQL).run("Alicia", 2, "c@example.com", "yokup", before.carbon_responsible);
  const silicon = db.prepare(PROJECT_SILICON_CAS_SQL).run("TrinityMBP14", 3, "s@example.com", "yokup", before.owner);
  assert.equal(carbon.changes, 1);
  assert.equal(silicon.changes, 1);
  assert.deepEqual({ ...db.prepare("SELECT owner,carbon_responsible FROM projects WHERE id='yokup'").get() }, {
    owner: "TrinityMBP14", carbon_responsible: "Alicia"
  });
  db.close();
});

test('la cadena vacía desasigna Silicio de forma persistente', () => {
  const db = casDb();
  const changed = db.prepare(PROJECT_SILICON_CAS_SQL).run("", 2, "owner@example.com", "yokup", "NiobeMacMini");
  assert.equal(changed.changes, 1);
  assert.equal(db.prepare("SELECT owner FROM projects WHERE id='yokup'").get().owner, "");
  assert.match(endpoint, /canonicalProjectAgentRef\(siliconInput\.trim\(\)\.slice\(0, 80\)\)/);
  assert.doesNotMatch(endpoint, /canonicalProjectAgentRef\(siliconInput[\s\S]{0,100}\|\| "NeoMacMini"/);
  db.close();
});

test("la actualización conjunta compara ambos snapshots atómicamente", () => {
  const db = casDb();
  const before = db.prepare("SELECT owner,carbon_responsible FROM projects WHERE id='yokup'").get();
  db.prepare(PROJECT_CARBON_CAS_SQL).run("Cambio ajeno", 2, "other@example.com", "yokup", before.carbon_responsible);
  const stale = db.prepare(PROJECT_BOTH_RESPONSIBLES_CAS_SQL)
    .run("TrinityMBP14", "Alicia", 3, "both@example.com", "yokup", before.owner, before.carbon_responsible);
  assert.equal(stale.changes, 0);
  assert.deepEqual({ ...db.prepare("SELECT owner,carbon_responsible FROM projects WHERE id='yokup'").get() }, {
    owner: "NiobeMacMini", carbon_responsible: "Cambio ajeno"
  });
  db.close();
});
