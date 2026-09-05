import { CLI_POLICY, cliPolicyBlocked, cliPolicyKeyBlocked, cliPolicyError } from './cli-policy.js';
import { agentFamilyKey, machineIdentityKey } from './agent-identity.js';

export const AUTOMATION_MODES = ['training','learning'];
export const AUTOMATIC_DECISIONS = ['OnIdle horario','Training horario','Ventana automatica','Ventana automática'];
export function automationFamily(target) { return agentFamilyKey(target.agent || target.persona)+'|'+machineIdentityKey(target.machine); }
export async function ensureAutomationSchema(env) {
  await env.DB.exec('CREATE TABLE IF NOT EXISTS fleet_automation_target_families(identity_key TEXT PRIMARY KEY,family_key TEXT NOT NULL)');
  await env.DB.exec("CREATE TABLE IF NOT EXISTS fleet_automation_controls (scope TEXT PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 1,cutoff INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 0,operation_id TEXT NOT NULL DEFAULT '',updated_at INTEGER NOT NULL DEFAULT 0)");
  await env.DB.exec('CREATE TABLE IF NOT EXISTS fleet_automation_decisions(decision_id TEXT PRIMARY KEY,mode TEXT NOT NULL,identity_key TEXT NOT NULL,created_at INTEGER NOT NULL)');
  await env.DB.exec('CREATE TABLE IF NOT EXISTS fleet_automation_commit_checks(id TEXT PRIMARY KEY,mode TEXT NOT NULL,identity_key TEXT NOT NULL,created_at INTEGER NOT NULL)');
  if(CLI_POLICY.cli_paused) await env.DB.exec("CREATE TRIGGER IF NOT EXISTS cli_policy_commit_fence_v1078 BEFORE INSERT ON fleet_automation_commit_checks WHEN substr(NEW.identity_key,-4)='|cli' BEGIN SELECT RAISE(ABORT,'cli_paused_by_carlos'); END");
  await env.DB.exec(`CREATE TRIGGER IF NOT EXISTS automation_commit_fence BEFORE INSERT ON fleet_automation_commit_checks WHEN NOT (${automationFenceSql('NEW.mode','NEW.identity_key','NEW.created_at')}) BEGIN SELECT RAISE(ABORT,'automation_stopped'); END`);

}
export async function automationControls(env) {
  await ensureAutomationSchema(env);
  return (await env.DB.prepare('SELECT * FROM fleet_automation_controls').all()).results || [];
}
export function automationPermission(rows,mode,key='',createdAt=null) {
  if(cliPolicyKeyBlocked(key)) return {allowed:false,reason:CLI_POLICY.reason};
  const controls=rows.filter(row=>row.scope===mode || key && row.scope===mode+':'+key);
  return controls.some(row=>!row.enabled || createdAt!==null && Number(createdAt)<=Number(row.cutoff))
    ?{allowed:false,reason:'automation_stopped'}:{allowed:true,reason:'ready'};
}
export async function automationAllowed(env,mode,key='',createdAt=null) {
  return automationPermission(await automationControls(env),mode,key,createdAt);
}
export function categoryRevision(rows,mode) { return Number(rows.find(row=>row.scope===mode)?.revision || 0); }
// SQL predicate used inside the publication statement itself, closing the gap
// between the last asynchronous guard and a concurrent stop transaction.
export function automationFenceSql(modeExpression,keyExpression,createdExpression) {
  return `${CLI_POLICY.cli_paused ? `COALESCE(substr(${keyExpression},-4),'')!='|cli' AND ` : ''}NOT EXISTS(SELECT 1 FROM fleet_automation_controls ac WHERE (ac.scope=${modeExpression} OR ac.scope=${modeExpression}||':'||${keyExpression}) AND (ac.enabled=0 OR ${createdExpression}<=ac.cutoff))`;
}
export async function stopAutomationGate(env,mode,key='',now=Date.now()) {
  await ensureAutomationSchema(env);
  const scope=key?mode+':'+key:mode;
  const statements=[env.DB.prepare("INSERT INTO fleet_automation_controls(scope,enabled,cutoff,revision,updated_at) VALUES(?,0,?,1,?) ON CONFLICT(scope) DO UPDATE SET enabled=0,cutoff=MAX(fleet_automation_controls.cutoff+1,excluded.cutoff),revision=fleet_automation_controls.revision+1,updated_at=excluded.updated_at").bind(scope,now,now)];
  if(key) statements.push(env.DB.prepare("INSERT INTO fleet_automation_controls(scope,enabled,revision,updated_at) VALUES(?,1,1,?) ON CONFLICT(scope) DO UPDATE SET revision=fleet_automation_controls.revision+1,updated_at=excluded.updated_at").bind(mode,now));
  await env.DB.batch(statements);
  return automationControls(env);
}
// Prepared rows already passed exact consumer/project checks. A single D1 batch
// changes preferences and their gates; a newer stop wins via category revision.
export async function activateAutomationTargets(env,mode,prepared,previousTargets,expectedRevision,requestedBy,now=Date.now(),replaceAll=true) {
  if(prepared.some(row=>cliPolicyBlocked(row.target))) throw cliPolicyError();
  if(!AUTOMATION_MODES.includes(mode) || !prepared.length) throw Object.assign(new Error('targets_required'),{status:400});
  const families=new Set();
  for(const row of prepared) { const family=automationFamily(row.target);if(families.has(family))throw Object.assign(new Error('one_surface_per_agent'),{status:409});families.add(family); }
  await ensureAutomationSchema(env);
  const controls=await automationControls(env);
  replaceAll=replaceAll || controls.some(row=>row.scope===mode && !row.enabled);
  const revision=Number(expectedRevision);
  if(!Number.isSafeInteger(revision)||revision<0)throw Object.assign(new Error('revision_required'),{status:400});
  const operation=crypto.randomUUID();
  const statements=[env.DB.prepare("INSERT INTO fleet_automation_controls(scope,enabled,revision,updated_at,operation_id) SELECT ?,1,1,?,? WHERE ?=0 ON CONFLICT(scope) DO UPDATE SET enabled=1,revision=fleet_automation_controls.revision+1,updated_at=excluded.updated_at,operation_id=excluded.operation_id WHERE fleet_automation_controls.revision=?").bind(mode,now,operation,revision,revision)];
  // With an existing category use UPDATE; INSERT SELECT WHERE revision=0 would
  // otherwise prevent the ON CONFLICT branch from running.
  if(revision>0)statements[0]=env.DB.prepare('UPDATE fleet_automation_controls SET enabled=1,revision=revision+1,updated_at=?,operation_id=? WHERE scope=? AND revision=?').bind(now,operation,mode,revision);
  const fence="EXISTS(SELECT 1 FROM fleet_automation_controls WHERE scope=? AND revision=? AND enabled=1 AND operation_id='"+operation+"')";
  const selected=new Set(prepared.map(row=>row.key));
  for(const row of previousTargets.filter(row=>row.mode===mode && !selected.has(row.identity_key) && replaceAll)) {
    statements.push(env.DB.prepare(`INSERT INTO fleet_automation_controls(scope,enabled,cutoff,updated_at) SELECT ?,0,?,? WHERE ${fence} ON CONFLICT(scope) DO UPDATE SET enabled=0,cutoff=MAX(fleet_automation_controls.cutoff,excluded.cutoff),updated_at=excluded.updated_at`).bind(mode+':'+row.identity_key,now,now,mode,revision+1));
  }
  for(const row of previousTargets)statements.push(env.DB.prepare(`INSERT OR IGNORE INTO fleet_automation_target_families(identity_key,family_key) SELECT ?,? WHERE ${fence}`).bind(row.identity_key,automationFamily(row),mode,revision+1));
  for(const {target,key,project} of prepared) {
    statements.push(env.DB.prepare(`INSERT OR REPLACE INTO fleet_automation_target_families(identity_key,family_key) SELECT ?,? WHERE ${fence}`).bind(key,automationFamily(target),mode,revision+1));
    statements.push(env.DB.prepare(`UPDATE fleet_agent_modes SET mode='manual',status='paused',reason='interface_changed',updated_at=? WHERE identity_key<>? AND identity_key IN (SELECT identity_key FROM fleet_automation_target_families WHERE family_key=?) AND ${fence}`).bind(now,key,automationFamily(target),mode,revision+1));
    statements.push(env.DB.prepare(`INSERT INTO fleet_automation_controls(scope,enabled,updated_at) SELECT ?,1,? WHERE ${fence} ON CONFLICT(scope) DO UPDATE SET enabled=1,updated_at=excluded.updated_at`).bind(mode+':'+key,now,mode,revision+1));
    statements.push(env.DB.prepare(`INSERT INTO fleet_agent_modes(identity_key,agent,persona,machine,runtime,host,mode,project_id,requested_by,enabled_at,updated_at,next_run,status,reason) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,'scheduled','next_hour' WHERE ${fence} ON CONFLICT(identity_key) DO UPDATE SET mode=excluded.mode,project_id=excluded.project_id,requested_by=excluded.requested_by,enabled_at=excluded.enabled_at,updated_at=excluded.updated_at,next_run=excluded.next_run,status=excluded.status,reason=excluded.reason`).bind(key,target.agent,target.persona,target.machine,target.runtime,target.host,mode,project.id,requestedBy,now,now,(Math.floor(now/3600000)+1)*3600000,mode,revision+1));

  }
  const result=await env.DB.batch(statements);
  if(!result[0]?.meta?.changes)throw Object.assign(new Error('configuration_changed'),{status:409});
  return {revision:revision+1,keys:[...selected]};
}

export function automationCommitStatement(env,context) {
  return env.DB.prepare('INSERT INTO fleet_automation_commit_checks(id,mode,identity_key,created_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(),context.mode,context.key,context.created_at);
}
