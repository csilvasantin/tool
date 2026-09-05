import { principalTargetKey } from './agent-principal-project.js';
import { parseAgentIdentity } from './agent-identity.js';

const ACTIVE = new Set(['open','pending','assigned','in_progress','doing','active','unconcluded']);

/** Assigned work outranks automatic research, without a heartbeat expiry.
 * Only the exact linked mission for this run may be omitted. Names/prefixes,
 * runtime and interface never establish an exemption or another identity.
 */
export function assignedWorkBlockers(target, {missions = [], tasks = [], ownMissionId = ''} = {}) {
  const wanted = principalTargetKey(target?.agent || target?.persona, target?.machine);
  if (!wanted) return [{kind:'identity',reason:'identity_required'}];
  const matches = (agent, machine) => principalTargetKey(agent, machine || '') === wanted;
  const blockers = [];
  for (const row of missions) {
    if (row.id === ownMissionId || !ACTIVE.has(row.status)) continue;
    if (matches(row.assignee || row.agent, row.loc || row.machine)) blockers.push({kind:'mission',id:row.id,status:row.status});
  }
  for (const row of tasks) {
    const missionId = row.mission_id || row.id;
    if (missionId === ownMissionId || !ACTIVE.has(row.status) || ['resolved','cancelled'].includes(row.parent_status)) continue;
    const executor = row.executor || row.owner;
    const machine = row.machine || (parseAgentIdentity(executor).suffix ? '' : row.loc);
    if (executor && matches(executor, machine)) blockers.push({kind:'task',id:missionId,code:row.code || '',status:row.status});
  }
  return blockers;
}

// No verified legacy consumer can revalidate its claim immediately before
// external publication. Selection must use the supported hourly adapters.
export function legacyAcademyAvailability() {
  return {allowed:false,status:'paused',reason:'consumer_unverified',message:'Formación antigua pausada. Usa Learning o Training en un agente con adaptador verificado.'};
}

export async function pauseLegacyAcademy(db, now = Date.now()) {
  await db.prepare('CREATE TABLE IF NOT EXISTS automatic_work_pauses (kind TEXT NOT NULL,ref TEXT NOT NULL,previous_status TEXT,reason TEXT NOT NULL,paused_at INTEGER NOT NULL,PRIMARY KEY(kind,ref))').run();
  // Preserve every draft and every verified delivery. Audit the original state
  // once; repeat reads cannot reset the reason, resume work or award completion.
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO automatic_work_pauses SELECT 'academy_capsule',CAST(hour_start AS TEXT),COALESCE(smith_status,'pending'),'consumer_unverified',? FROM academy_capsulas WHERE COALESCE(smith_status,'pending') NOT IN ('verified','paused')").bind(now),
    db.prepare("INSERT OR IGNORE INTO automatic_work_pauses SELECT 'academy_decision',id,status,'consumer_unverified',? FROM decisions WHERE parent_decision='FORMACION' AND status='pending' AND NOT EXISTS(SELECT 1 FROM academy_capsulas c WHERE c.decision_id=decisions.id AND c.smith_status='verified')").bind(now),
    db.prepare("UPDATE academy_capsulas SET smith_status='paused',smith_stage='paused',smith_detail='consumer_unverified · Formación antigua pausada; usa Learning/Training con adaptador verificado.',smith_updated_at=? WHERE COALESCE(smith_status,'pending') NOT IN ('verified','paused')").bind(now),
    db.prepare("UPDATE decisions SET status='paused' WHERE parent_decision='FORMACION' AND status='pending' AND EXISTS(SELECT 1 FROM automatic_work_pauses p WHERE p.kind='academy_decision' AND p.ref=decisions.id)")
  ]);
  return legacyAcademyAvailability();
}

export async function pauseAutomaticRun(db, runId, blockers, now = Date.now(), requestedReason='human_mission_assigned') {
  const reason=requestedReason;
  const detail=reason==='automation_stopped'?'Parada solicitada desde Módulos. Nuevos lanzamientos y entregas en Yokup bloqueados; ejecución pendiente de confirmación. Investigación conservada; sin cierre automático.':'Pausada por misión asignada: '+blockers.map(row=>row.id+(row.code?':'+row.code:'')).join(', ').slice(0,400)+'. Investigación conservada; sin entrega ni cierre automático.';
  await db.prepare('CREATE TABLE IF NOT EXISTS automatic_work_pauses (kind TEXT NOT NULL,ref TEXT NOT NULL,previous_status TEXT,reason TEXT NOT NULL,paused_at INTEGER NOT NULL,PRIMARY KEY(kind,ref))').run();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO automatic_work_pauses SELECT 'hourly_run',id,status,?,? FROM fleet_agent_mode_runs WHERE id=? AND status IN ('reserved','starting','resuming','dispatched','awaiting_delivery','completing')").bind(detail,now,runId),
    db.prepare("UPDATE fleet_agent_mode_runs SET status='paused',reason=?,updated_at=? WHERE id=? AND status IN ('reserved','starting','resuming','dispatched','awaiting_delivery','completing')").bind(reason,now,runId),
    db.prepare("UPDATE fleet_agent_modes SET status='paused',reason=? WHERE EXISTS(SELECT 1 FROM fleet_agent_mode_runs r WHERE r.id=? AND r.status='paused' AND r.identity_key=fleet_agent_modes.identity_key AND r.mode=fleet_agent_modes.mode AND r.project_id=fleet_agent_modes.project_id AND r.created_at>=fleet_agent_modes.enabled_at)").bind(reason,runId),
    db.prepare("UPDATE mission_tasks SET status='unconcluded',report=COALESCE(report,'') || char(10) || ?,updated_at=? WHERE mission_id IN (SELECT mission_id FROM fleet_hourly_work WHERE run_id=?) AND status NOT IN ('done','unconcluded') AND EXISTS(SELECT 1 FROM fleet_agent_mode_runs WHERE id=? AND status='paused')").bind(detail,now,runId,runId),
    db.prepare("UPDATE tickets SET status='unconcluded',updated_at=? WHERE id IN (SELECT mission_id FROM fleet_hourly_work WHERE run_id=?) AND status NOT IN ('resolved','cancelled','unconcluded') AND EXISTS(SELECT 1 FROM fleet_agent_mode_runs WHERE id=? AND status='paused')").bind(now,runId,runId),
    db.prepare("DELETE FROM fleet_hourly_family_leases WHERE run_id=? AND EXISTS(SELECT 1 FROM fleet_agent_mode_runs WHERE id=? AND status='paused')").bind(runId,runId)
  ]);
}
