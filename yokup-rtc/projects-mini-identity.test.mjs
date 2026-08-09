import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import {
  canonicalProjectAgentRef,
  canonicalProjectAgentRefs,
  YOKUP_MINI_MEMBER_BACKFILL_SQL
} from "./src/project-member-identity.js";

const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");

function censusDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE projects(id TEXT PRIMARY KEY, owner TEXT)");
  db.exec("CREATE TABLE project_members(project_id TEXT,kind TEXT,ref TEXT,added_at INTEGER,PRIMARY KEY(project_id,kind,ref))");
  return db;
}

test("el censo escribe OraculoMini sin tocar SmithMacMini ni NeoMBP14", () => {
  assert.equal(canonicalProjectAgentRef("OraculoMacMini"), "OraculoMini");
  assert.equal(canonicalProjectAgentRef("OraculoMini"), "OraculoMini");
  assert.equal(canonicalProjectAgentRef("SmithMacMini"), "SmithMacMini");
  assert.equal(canonicalProjectAgentRef("NeoMBP14"), "NeoMBP14");
  assert.deepEqual(canonicalProjectAgentRefs([
    "neo", "Morfeo Negro", "OraculoMacMini", "OraculoMini", "SmithMacMini", "NeoMBP14"
  ]), ["neo", "Morfeo Negro", "OraculoMini", "SmithMacMini", "NeoMBP14"]);
});

test("el backfill relacional de yokup converge sin duplicar y es idempotente", () => {
  const db = censusDb();
  db.prepare("INSERT INTO projects(id,owner) VALUES(?,?)").run("yokup", "OraculoMacMini");
  const insert = db.prepare("INSERT INTO project_members(project_id,kind,ref,added_at) VALUES(?,?,?,?)");
  insert.run("yokup", "agent", "OraculoMacMini", 10);
  insert.run("yokup", "agent", "OraculoMini", 20);
  insert.run("yokup", "agent", "SmithMacMini", 30);
  insert.run("yokup", "agent", "NeoMBP14", 40);

  db.exec(YOKUP_MINI_MEMBER_BACKFILL_SQL);
  db.exec(YOKUP_MINI_MEMBER_BACKFILL_SQL);

  assert.equal(db.prepare("SELECT owner FROM projects WHERE id='yokup'").get().owner, "OraculoMini");
  assert.deepEqual(db.prepare("SELECT ref FROM project_members WHERE project_id='yokup' AND kind='agent' ORDER BY ref").all().map((r) => r.ref),
    ["NeoMBP14", "OraculoMini", "SmithMacMini"]);
  db.close();
});

test("cada línea del backfill es una sentencia completa para D1.exec", () => {
  const statements = YOKUP_MINI_MEMBER_BACKFILL_SQL.trim().split(/\n+/);
  assert.equal(statements.length, 3);
  for (const statement of statements) assert.match(statement, /;$/);
});

test("/projects canoniza salida, owner, reemplazo y remove histórico", () => {
  assert.match(source, /owner: canonicalOwner/);
  assert.match(source, /primary_responsible: canonicalOwner \|\| "NeoMacMini"/);
  assert.match(source, /agents: canonicalProjectAgentRefs\([\s\S]*\.map\(\(m\) => m\.ref\)\)/);
  assert.match(source, /return kind === "agent" \? canonicalProjectAgentRef\(ref\) : ref/);
  assert.match(source, /lower\(ref\) IN \('oraculomini','oraculomacmini'\)/);
  assert.match(source, /env\.DB\.exec\(YOKUP_MINI_MEMBER_BACKFILL_SQL\)/);
  assert.ok(source.indexOf('ALTER TABLE projects ADD COLUMN owner TEXT') <
    source.indexOf('env.DB.exec(YOKUP_MINI_MEMBER_BACKFILL_SQL)'), "owner debe existir antes del backfill");
});
