#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { closeSync, openSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { identityKey, reportAgentIdentity } from "../src/agent-identity.js";

const MISSION_SOURCES = new Set(["fleet", "decision-batch", "cli-declare"]);
const MISSION_ROLES = new Set(["mission", "standalone-task"]);

export function madridDay(ms) {
  if (!Number.isFinite(Number(ms))) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date(Number(ms)));
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function clean(value) { return String(value || "").trim(); }
function lower(value) { return clean(value).toLocaleLowerCase("es"); }

export function canonicalProjectIds(projects, value) {
  const raw = clean(value);
  if (!raw) return [];
  const available = (projects || []).filter((project) => !["archivado", "archived", "deleted", "borrado"]
    .includes(lower(project.status)));
  const exactId = available.filter((project) => lower(project.id) === lower(raw));
  if (exactId.length) return [...new Set(exactId.map((project) => clean(project.id)))];
  return [...new Set(available
    .filter((project) => lower(project.name) === lower(raw))
    .map((project) => clean(project.id)).filter(Boolean))];
}

function explicitLinksByMission(links) {
  const out = new Map();
  for (const link of links || []) {
    const missionId = clean(link && link.mission_id);
    const projectId = clean(link && link.project_id);
    const evidence = clean(link && link.evidence);
    if (!missionId || !projectId || !evidence) continue;
    if (!out.has(missionId)) out.set(missionId, []);
    out.get(missionId).push({ project_id: projectId, rule: "explicit_link", source_id: evidence });
  }
  return out;
}

function addCandidate(candidates, projectId, provenance) {
  const id = clean(projectId);
  if (!id) return;
  if (!candidates.has(id)) candidates.set(id, []);
  candidates.get(id).push({ ...provenance, project_id: id });
}

function missionRows(data) {
  return (data.tickets || []).filter((ticket) => (!clean(ticket.project) || !clean(ticket.project_id) || lower(ticket.project) !== lower(ticket.project_id)) && (
    MISSION_SOURCES.has(clean(ticket.source)) || MISSION_ROLES.has(clean(ticket.role)) ||
    (data.mission_ids || []).includes(clean(ticket.id))
  ));
}

export function buildBackfillAudit(data, explicitLinks = []) {
  const projects = data.projects || [];
  const validProjects = new Set(projects
    .filter((project) => !["archivado", "archived", "deleted", "borrado"].includes(lower(project.status)))
    .map((project) => clean(project.id)).filter(Boolean));
  const ticketById = new Map((data.tickets || []).map((ticket) => [clean(ticket.id), ticket]));
  const batchByMission = new Map();
  for (const row of data.batch_links || []) {
    const id = clean(row.mission_id);
    if (!id) continue;
    if (!batchByMission.has(id)) batchByMission.set(id, []);
    batchByMission.get(id).push(row);
  }
  const declarations = new Map();
  for (const row of data.declarations || []) {
    const key = `${clean(row.day)}|${clean(row.agent_key)}`;
    if (!declarations.has(key)) declarations.set(key, []);
    declarations.get(key).push(row);
  }
  const links = explicitLinksByMission(explicitLinks);
  const targets = new Set(missionRows(data).map((ticket) => clean(ticket.id)));
  const decided = new Map(), visiting = new Set();

  const resolveMission = (missionId) => {
    if (decided.has(missionId)) return decided.get(missionId);
    const ticket = ticketById.get(missionId);
    if (!ticket || !targets.has(missionId) || visiting.has(missionId)) return null;
    visiting.add(missionId);
    const candidates = new Map(), rejected = [];
    const oldProject = clean(ticket.project), oldProjectId = clean(ticket.project_id);
    for (const [field, value] of [["tickets.project", oldProject], ["tickets.project_id", oldProjectId]]) {
      if (!value) continue;
      const ids = canonicalProjectIds(projects, value);
      if (!ids.length) rejected.push({ rule: "existing_project_link", source_id: field, value, reason: "project_missing_or_inactive" });
      for (const projectId of ids) addCandidate(candidates, projectId, { rule: "existing_project_link", source_id: field });
    }
    for (const row of batchByMission.get(missionId) || []) {
      const ids = canonicalProjectIds(projects, row.decision_project);
      if (!ids.length && clean(row.decision_project)) rejected.push({ rule: "decision_batch", source_id: `${clean(row.decision_id)}/${clean(row.batch_id)}`, value: clean(row.decision_project), reason: "project_missing_or_inactive" });
      for (const projectId of ids) addCandidate(candidates, projectId, {
        rule: "decision_batch", source_id: `${clean(row.decision_id) || "unknown"}/${clean(row.batch_id) || "unknown"}`
      });
    }

    const parentId = clean(ticket.parent_id);
    if (parentId) {
      const parent = ticketById.get(parentId);
      let parentProject = "";
      if (targets.has(parentId)) {
        const parentResult = resolveMission(parentId);
        if (parentResult && parentResult.new_project) parentProject = parentResult.new_project;
      } else if (parent) {
        const values = [clean(parent.project), clean(parent.project_id)].filter(Boolean);
        const ids = [...new Set(values.flatMap((value) => canonicalProjectIds(projects, value)))];
        if (values.length && ids.length === 1 && values.every((value) => canonicalProjectIds(projects, value).length === 1)) parentProject = ids[0];
      }
      if (validProjects.has(parentProject)) addCandidate(candidates, parentProject, { rule: "parent_mission", source_id: parentId });
      else if (parentProject) rejected.push({ rule: "parent_mission", source_id: parentId, value: parentProject, reason: "project_missing_or_inactive" });
    }

    const visibleAgent = reportAgentIdentity(ticket.assignee || "", ticket.loc || "");
    const missionAt = Number(ticket.created_at), agentKey = identityKey(visibleAgent), day = madridDay(missionAt);
    if (day && agentKey) {
      for (const row of declarations.get(`${day}|${agentKey}`) || []) {
        const projectId = clean(row.project_id), declaredAt = Number(row.created_at) || 0;
        const changedAt = Number(row.updated_at) || declaredAt;
        const temporal = (!declaredAt || declaredAt <= missionAt) && (!changedAt || changedAt <= missionAt);
        if (!temporal) rejected.push({ rule: "principal_declaration", source_id: `${day}/${agentKey}`, value: projectId, reason: "not_proven_at_mission_creation" });
        else if (validProjects.has(projectId)) addCandidate(candidates, projectId, { rule: "principal_declaration", source_id: `${day}/${agentKey}` });
        else if (projectId) rejected.push({ rule: "principal_declaration", source_id: `${day}/${agentKey}`, value: projectId, reason: "project_missing_or_inactive" });
      }
    }

    for (const link of links.get(missionId) || []) {
      if (validProjects.has(link.project_id)) addCandidate(candidates, link.project_id, link);
      else rejected.push({ ...link, value: link.project_id, reason: "project_missing_or_inactive" });
    }

    const ids = [...candidates.keys()].sort(), provenance = ids.flatMap((id) => candidates.get(id));
    const sourceIds = [...new Set(provenance.map((row) => clean(row.source_id)).filter(Boolean))].sort();
    const base = { mission_id: missionId, source_id: sourceIds.join("+"), mission_source: clean(ticket.source) || clean(ticket.role),
      old_project: oldProject, old_project_id: oldProjectId, provenance, rejected_sources: rejected };
    const lockedByInvalidExisting = rejected.some((row) => row.rule === "existing_project_link");
    const result = ids.length === 1 && !lockedByInvalidExisting
      ? { ...base, new_project: ids[0], new_project_id: ids[0], rule: [...new Set(provenance.map((row) => row.rule))].sort().join("+"), action: "would_update" }
      : ids.length > 1
        ? { ...base, new_project: null, new_project_id: null, rule: "conflicting_1_to_1_sources", action: "skipped_ambiguous" }
        : { ...base, new_project: null, new_project_id: null, rule: lockedByInvalidExisting ? "incompatible_existing_project_fields" : "no_active_trazable_source", action: "skipped_unresolved" };
    visiting.delete(missionId);
    decided.set(missionId, result);
    return result;
  };

  for (const missionId of targets) resolveMission(missionId);

  const assigned = [], ambiguous = [], unresolved = [];
  for (const ticket of missionRows(data)) {
    const missionId = clean(ticket.id), result = decided.get(missionId);
    if (result && result.new_project) assigned.push(result);
    else if (result && result.action === "skipped_ambiguous") ambiguous.push(result);
    else unresolved.push(result || { mission_id: missionId, source_id: "", mission_source: clean(ticket.source) || clean(ticket.role), old_project: clean(ticket.project), old_project_id: clean(ticket.project_id), new_project: null, new_project_id: null, rule: "no_active_trazable_source", provenance: [], rejected_sources: [], action: "skipped_unresolved" });
  }
  return {
    assigned: assigned.sort((a, b) => a.mission_id.localeCompare(b.mission_id)),
    ambiguous: ambiguous.sort((a, b) => a.mission_id.localeCompare(b.mission_id)),
    unresolved: unresolved.sort((a, b) => a.mission_id.localeCompare(b.mission_id))
  };
}

function sqlQuote(value) { return `'${String(value).replaceAll("'", "''")}'`; }

export function applySql(assigned) {
  if (!(assigned || []).length) return "";
  const cases = assigned.map((row) => `WHEN ${sqlQuote(row.mission_id)} THEN ${sqlQuote(row.new_project)}`).join(" ");
  const guards = assigned.map((row) => {
    const id = sqlQuote(row.mission_id), project = sqlQuote(row.new_project);
    return `(id=${id} AND (COALESCE(TRIM(project),'')='' OR lower(TRIM(project))=lower(${project})) AND (COALESCE(TRIM(project_id),'')='' OR lower(TRIM(project_id))=lower(${project})) AND (COALESCE(TRIM(project),'')='' OR lower(TRIM(project))<>lower(${project}) OR COALESCE(TRIM(project_id),'')='' OR lower(TRIM(project_id))<>lower(${project})))`;
  }).join(" OR ");
  // Un único statement por lote: D1/SQLite lo ejecuta como transacción atómica;
  // cualquier error revierte el lote completo. RETURNING da el contador real.
  return `UPDATE tickets SET project=CASE id ${cases} ELSE project END,project_id=CASE id ${cases} ELSE project_id END WHERE ${guards} RETURNING id,project,project_id;`;
}

export const PROJECT_ID_MIGRATION_SQL = "ALTER TABLE tickets ADD COLUMN project_id TEXT";

export function assignedBatches(assigned, size = 50) {
  const batches = [];
  for (let i = 0; i < (assigned || []).length; i += size) batches.push(assigned.slice(i, i + size));
  return batches;
}

function parseArgs(argv) {
  const args = { database: "yokup-tickets", remote: true, apply: false, links: "", audit: "" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--local") args.remote = false;
    else if (arg === "--database") args.database = argv[++i] || "";
    else if (arg === "--links") args.links = argv[++i] || "";
    else if (arg === "--audit") args.audit = argv[++i] || "";
    else if (arg === "--confirm") args.confirm = argv[++i] || "";
    else throw new Error(`argumento desconocido: ${arg}`);
  }
  if (!args.database) throw new Error("--database requiere valor");
  if (args.apply && args.confirm !== "APPLY-1TO1") throw new Error("--apply exige --confirm APPLY-1TO1");
  return args;
}

function wranglerQuery(args, sql) {
  const command = ["wrangler", "d1", "execute", args.database, args.remote ? "--remote" : "--local", "--json", "--command", sql];
  const raw = execFileSync("npx", command, { cwd: new URL("..", import.meta.url), encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  const parsed = JSON.parse(raw), blocks = Array.isArray(parsed) ? parsed : [parsed];
  return blocks.flatMap((block) => block && Array.isArray(block.results) ? block.results : []);
}

function loadData(args) {
  const ticketColumns = wranglerQuery(args, "PRAGMA table_info(tickets)");
  const hasProjectId = ticketColumns.some((row) => clean(row.name) === "project_id");
  const tickets = wranglerQuery(args,
    `SELECT id,project,${hasProjectId ? "project_id" : "'' project_id"},parent_id,assignee,loc,source,role,created_at FROM tickets ORDER BY id`);
  const projects = wranglerQuery(args, "SELECT id,name,status FROM projects ORDER BY id");
  const batch_links = wranglerQuery(args,
    "SELECT i.mission_id,i.batch_id,b.decision_id,d.project decision_project FROM mission_batch_items i JOIN mission_batches b ON b.id=i.batch_id LEFT JOIN decisions d ON d.id=b.decision_id WHERE i.mission_id IS NOT NULL AND i.mission_id<>''");
  const declarations = wranglerQuery(args,
    "SELECT day,agent_key,agent,project_id,declared_by,statement,created_at,updated_at FROM agent_project_declarations ORDER BY day,agent_key");
  const mission_ids = wranglerQuery(args,
    "SELECT DISTINCT mission_id id FROM mission_tasks UNION SELECT DISTINCT mission_id id FROM mission_batch_items WHERE mission_id IS NOT NULL UNION SELECT DISTINCT mission_id id FROM fleet_ids")
    .map((row) => clean(row.id)).filter(Boolean);
  return { tickets, projects, batch_links, declarations, mission_ids, has_project_id: hasProjectId };
}

function ensureProjectIdColumn(args, before) {
  if (before.has_project_id) return false;
  try { wranglerQuery(args, PROJECT_ID_MIGRATION_SQL); }
  catch (error) {
    // Carrera benigna: otro operador pudo crear la columna entre PRAGMA y ALTER.
    if (!loadData(args).has_project_id) throw error;
  }
  return true;
}

async function main(argv) {
  const args = parseArgs(argv);
  // Reserva el destino antes de cualquier posible escritura en D1. Así nunca se
  // aplica una tanda para descubrir al final que la auditoría iba a sobrescribirse.
  const auditFd = args.audit ? openSync(args.audit, "wx") : null;
  const links = args.links ? JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(args.links, "utf8"))) : [];
  const before = loadData(args), result = buildBackfillAudit(before, links);
  const audit = {
    generated_at: new Date().toISOString(), mode: args.apply ? "apply" : "dry-run",
    database: args.database, target: args.remote ? "remote" : "local",
    schema: { project_id_before: before.has_project_id, project_id_added: false },
    summary: { assigned: result.assigned.length, ambiguous: result.ambiguous.length, unresolved: result.unresolved.length, updated: 0 },
    ...result
  };
  if (args.apply && result.assigned.length) {
    audit.schema.project_id_added = ensureProjectIdColumn(args, before);
    const updated = [];
    const expected = new Map(result.assigned.map((row) => [row.mission_id, row.new_project]));
    for (const batch of assignedBatches(result.assigned)) {
      for (const row of wranglerQuery(args, applySql(batch))) {
        const id = clean(row && row.id), project = expected.get(id);
        if (id && clean(row.project) === project && clean(row.project_id) === project) updated.push(id);
      }
    }
    const updatedSet = new Set(updated);
    audit.applied = result.assigned.filter((row) => updatedSet.has(row.mission_id)).map((row) => row.mission_id);
    audit.skipped_after_guard = result.assigned.filter((row) => !updatedSet.has(row.mission_id)).map((row) => row.mission_id);
    audit.summary.updated = audit.applied.length;
    for (const row of audit.assigned) row.action = updatedSet.has(row.mission_id) ? "updated" : "skipped_after_guard";
  } else {
    audit.applied = [];
    audit.skipped_after_guard = [];
  }
  const output = JSON.stringify(audit, null, 2) + "\n";
  if (auditFd !== null) { writeFileSync(auditFd, output); closeSync(auditFd); }
  process.stdout.write(output);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main(process.argv.slice(2)).catch((error) => { console.error(`backfill abortado: ${error.message}`); process.exitCode = 1; });
}
