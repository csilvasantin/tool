import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { reportAgentIdentity } from "./src/agent-identity.js";

const worker = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
const site = await readFile(new URL("../yokup-site/informes.html", import.meta.url), "utf8");
const pdf = await readFile(new URL("../yokup-site/informe-pdf.js", import.meta.url), "utf8");

test("informes recompone persona + máquina real y conserva Sub/Infra", () => {
  assert.equal(reportAgentIdentity("Morfeo", "admira-macbookpro16"), "MorfeoMBP16");
  assert.equal(reportAgentIdentity("Oraculo", "Mac Mini"), "OraculoMacMini");
  assert.equal(reportAgentIdentity("SubMorfeo16", "MacBook Pro 16"), "SubMorfeoMBP16");
  assert.equal(reportAgentIdentity("InfraOraculoMini", "admira-macmini"), "InfraOraculoMini");
});

test("aliases históricos se normalizan sin inventar máquina", () => {
  assert.equal(reportAgentIdentity("Oráculo", "Mac Mini"), "OraculoMacMini");
  assert.equal(reportAgentIdentity("Morfeo", ""), "Morfeo");
  assert.equal(reportAgentIdentity("persona-externa", "Mac Mini"), "persona-externa");
});

test("el feed añade agent_identity y las dos salidas lo consumen", () => {
  assert.match(worker, /agent_identity:\s*reportAgentIdentity\(task\.assignee, task\.loc\)/);
  assert.match(worker, /reportAgentFamily\(task\.executor \|\| task\.owner, task\.loc\)/);
  assert.match(site, /const person=t\.agent_identity\|\|t\.owner\|\|""/);
  assert.match(pdf, /t\.agent_identity\s*\|\|\s*t\.owner\s*\|\|\s*""/);
});
