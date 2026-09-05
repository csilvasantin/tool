import { canonicalMachineSuffix, identityKey, machineIdentityKey, machineSuffix, parseAgentIdentity } from './agent-identity.js';
import { madridDayKey } from './display-ref.js';
import { CANONICAL_MISSION_SOURCES } from './mission-sources.js';

const text = value => String(value ?? '').trim();
const epoch = value => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? (number < 4102444800 ? number * 1000 : number) : 0;
};

// A legacy bare persona needs an explicit machine. A suffix contradicting that
// machine is invalid; it must never borrow another computer's assignment.
export function principalTargetKey(agent, machine = '') {
  const parsed = parseAgentIdentity(agent), physical = machineSuffix(machine);
  if (!text(agent) || (!physical && !parsed.suffix)) return '';
  if (text(machine) && !physical) return '';
  if (physical && parsed.suffix && canonicalMachineSuffix(physical) !== canonicalMachineSuffix(parsed.suffix)) return '';
  return identityKey(parsed.persona) + '|' + identityKey(canonicalMachineSuffix(physical || parsed.suffix));
}

export function principalDays(now = Date.now()) {
  const today = madridDayKey(now);
  const yesterday = new Date(Date.parse(today + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
  return {today, yesterday};
}

function missionActivity(row, now) {
  if (!['in_progress', 'unconcluded', 'resolved'].includes(row.status)) return 0;
  if (!CANONICAL_MISSION_SOURCES.includes(row.source) && row.role !== 'mission') return 0;
  if (row.source === 'decision-window') return 0;
  const started = epoch(row.started_at), resolved = epoch(row.resolved_at);
  // A queue entry or a generic heartbeat is not proof of real work.
  const material = epoch(row.material_at);
  if (!started && !resolved && !material) return 0;
  if (started > now + 30000 || resolved > now + 30000) return 0;
  const live = row.status === 'in_progress' && row.live_kind === 'process' && row.live_shot ? epoch(row.live_at) : 0;
  return Math.max(started, resolved, material <= now + 30000 ? material : 0, live <= now + 30000 ? live : 0);
}

/** Read-only, deterministic resolution shared by cards and hourly execution.
 * Inputs are fetched once per inventory, never per card. No global UI filter.
 */
export function resolveAgentPrincipalProject({target, projects = [], declarations = [], missions = [], now = Date.now()}) {
  const agent = target?.agent || target?.persona, machine = target?.machine;
  const wanted = principalTargetKey(agent, machine), {today, yesterday} = principalDays(now);
  const active = new Map(projects.filter(project => project?.id && text(project.status || 'activo').toLowerCase() === 'activo').map(project => [text(project.id), project]));
  const resolveProject = raw => active.get(text(raw)) || null;
  const result = (project, source, ref = '', day = '', at = null) => ({
    project_id: project?.id || 'admiranext', project_name: project?.name || (project?.id ? project.id : 'AdmiraNeXT'),
    project_source: source, project_source_ref: ref, project_source_day: day,
    project_source_at: at, project_available: !!project, project_resolved_day: today,
  });
  const conflict = (source, refs) => ({...result(resolveProject('admiranext'), 'admiranext_fallback'), project_available:false, project_issue:'project_ambiguous', project_conflict_source:source, project_conflict_refs:refs});
  if (wanted) {
    const ownDeclarations = declarations.filter(row => {
      const stamp = epoch(row.updated_at || row.created_at);
      return principalTargetKey(row.agent, row.machine || '') === wanted && /^\d{4}-\d{2}-\d{2}$/.test(row.day || '') && row.day <= today && stamp > 0 && stamp <= now + 30000 && resolveProject(row.project_id);
    }).sort((a,b) => b.day.localeCompare(a.day) || epoch(b.updated_at || b.created_at) - epoch(a.updated_at || a.created_at) || text(a.project_id).localeCompare(text(b.project_id)));
    const daily = ownDeclarations.find(row => row.day === today);
    if (daily) {
      const tied=ownDeclarations.filter(row=>row.day===today && epoch(row.updated_at || row.created_at)===epoch(daily.updated_at || daily.created_at));
      if (new Set(tied.map(row=>row.project_id)).size>1) return conflict('daily_primary',tied.map(row=>text(row.agent_key || row.agent)+':'+row.project_id));
    }
    if (daily) return result(resolveProject(daily.project_id), 'daily_primary', text(daily.agent_key || daily.agent), daily.day, epoch(daily.updated_at || daily.created_at));

    const recentRows = missions.map(row => ({row, at:missionActivity(row, now)})).filter(({row,at}) => {
      // Tickets require a physical loc as well as a compatible agent suffix.
      if (!row.loc || machineIdentityKey(row.loc) !== machineIdentityKey(machine) || principalTargetKey(row.assignee,row.loc) !== wanted || !at) return false;
      const day = madridDayKey(at);
      return (day === today || day === yesterday) && resolveProject(row.project_id);
    }).sort((a,b) => b.at - a.at || text(b.row.id).localeCompare(text(a.row.id)));
    const recent=recentRows[0];
    if (recent) {
      const tied=recentRows.filter(row=>row.at===recent.at);
      if (new Set(tied.map(({row})=>row.project_id)).size>1) return conflict('last_mission',tied.map(({row})=>text(row.id)));
    }
    if (recent) return result(resolveProject(recent.row.project_id), 'last_mission', text(recent.row.id), madridDayKey(recent.at), recent.at);

    const configured = ownDeclarations.find(row => row.day < today);
    if (configured) {
      const tied=ownDeclarations.filter(row=>row.day===configured.day && epoch(row.updated_at || row.created_at)===epoch(configured.updated_at || configured.created_at));
      if (new Set(tied.map(row=>row.project_id)).size>1) return conflict('configured_default',tied.map(row=>text(row.agent_key || row.agent)+':'+row.project_id));
    }
    if (configured) return result(resolveProject(configured.project_id), 'configured_default', text(configured.agent_key || configured.agent), configured.day, epoch(configured.updated_at || configured.created_at));
  }
  return result(resolveProject('admiranext'), 'admiranext_fallback');
}
