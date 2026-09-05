import { CLI_POLICY, cliPolicyBlocked } from './cli-policy.js';
import { reportAgentFamily } from './agent-identity.js';

export const WORK_ACTIVITY_TTL_MS = 120_000;
export const WORK_ACTIVITY_TABLE_SQL = 'CREATE TABLE IF NOT EXISTS fleet_work_activity (mission_id TEXT PRIMARY KEY, activity_json TEXT NOT NULL, observed_at INTEGER NOT NULL)';
const KINDS = new Set(['coordination', 'implementation', 'verification']);
const clean = value => String(value || '').trim();
export function normalizeWorkActivity(activity, selector) {
  if (activity == null) return null;
  const kind = clean(activity.kind), detail = clean(activity.detail);
  const runtime = clean(selector?.runtime), host = clean(selector?.host).toLowerCase(), session_id = clean(selector?.session_id);
  if (!KINDS.has(kind) || detail.length < 8 || detail.length > 240 || /[\x00-\x08\x0b-\x1f]/.test(detail)) throw new Error('activity_invalid');
  if (!runtime || runtime.length > 80 || !['app','cli'].includes(host) || !session_id || session_id.length > 160 || /[\x00-\x1f]/.test(runtime + session_id)) throw new Error('activity_session_required');
  return { kind, detail, runtime, host, session_id };
}
export function workActivityProcessKey(family, runtime, host, session) {
  return [family, clean(runtime).toLowerCase(), clean(host).toLowerCase(), clean(session)].join('|');
}

// This INSERT is guarded in SQLite, after the asynchronous session binding.
// A concurrent canonical closure must win; no event is stored on a closed mission.
export async function recordWorkActivity(env, ticket, owner, activity, binding, now) {
  if (!activity) return { accepted:false, reason:'not_requested' };
  if (cliPolicyBlocked(activity)) return {accepted:false,reason:CLI_POLICY.reason};
  const family = reportAgentFamily(owner, ticket.loc).family_key;
  if (family.startsWith('external:') || family !== reportAgentFamily(ticket.assignee, ticket.loc).family_key) return { accepted:false, reason:'owner_mismatch' };
  if (!binding?.bound) return { accepted:false, reason:binding?.reason || 'session_not_bound' };
  const signal = { ...activity, family_key:family, observed_at:now, basis:'explicit_bound_progress' };
  const result = await env.DB.prepare(`INSERT INTO fleet_work_activity (mission_id,activity_json,observed_at)
    SELECT id,?,? FROM tickets WHERE id=? AND status='in_progress' AND assignee=? AND COALESCE(loc,'')=?
    ON CONFLICT(mission_id) DO UPDATE SET activity_json=excluded.activity_json,observed_at=excluded.observed_at
    WHERE excluded.observed_at>=fleet_work_activity.observed_at`)
    .bind(JSON.stringify(signal), now, ticket.id, ticket.assignee, ticket.loc || '').run();
  return Number(result?.meta?.changes) > 0
    ? { accepted:true, activity_at:now, activity_kind:activity.kind, ttl_ms:WORK_ACTIVITY_TTL_MS, basis:signal.basis }
    : { accepted:false, reason:'mission_changed_or_closed' };
}

// The process snapshot confirms precisely the emitting surface; the work ledger
// confirms that the mission is still bound. A new process birth invalidates the
// previous process's activity even if an OS PID or session name was reused.
export function evaluateWorkActivity({ signal, status, ended_at, family_key, linked, exact_processes, now }) {
  if (typeof signal === 'string') { try { signal = JSON.parse(signal); } catch { return null; } }
  if (!signal || status !== 'in_progress' || Number(ended_at) > 0 || signal.basis !== 'explicit_bound_progress' || signal.family_key !== family_key) return null;
  let normalized;
  try { normalized = normalizeWorkActivity(signal, signal); } catch { return null; }
  if (cliPolicyBlocked(normalized)) return null;
  const at = Number(signal.observed_at);
  if (!Number.isSafeInteger(at) || at <= 0 || at > now + 5_000 || now - at > WORK_ACTIVITY_TTL_MS) return null;
  if (!linked || linked.state !== 'open' || linked.surface !== normalized.host || clean(linked.runtime).toLowerCase() !== normalized.runtime.toLowerCase() || linked.session_id !== normalized.session_id || !Number(linked.started_at) || Number(linked.started_at) > at || Number(linked.ended_at) > 0) return null;
  const processAt = exact_processes?.get(workActivityProcessKey(family_key, normalized.runtime, normalized.host, normalized.session_id));
  if (!Number.isFinite(processAt) || processAt < now - 30_000 || processAt > now + 5_000) return null;
  return { activity_at:at, activity_kind:normalized.kind, activity_text:normalized.detail, activity_basis:'explicit_bound_progress' };
}
