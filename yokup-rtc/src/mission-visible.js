import { madridDayStart } from './display-ref.js';
import { MISSION_UNCONCLUDED_AFTER_MS } from './daily-mission-close.js';

export const MISSION_VISIBLE_STATES = Object.freeze([
  'unassigned', 'pending', 'in_progress', 'unconcluded', 'resolved', 'cancelled'
]);
export const OPERATIONAL_LIMIT_REASON = 'operational_limit_60m';

export function missionDayRange(day) {
  const value = String(day || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, date] = value.split('-').map(Number);
  const noonUtc = Date.UTC(year, month - 1, date, 12);
  const start = madridDayStart(noonUtc);
  if (new Date(start + 12 * 3600000).toLocaleDateString('en-CA', {timeZone:'Europe/Madrid'}) !== value) return null;
  return { day:value, start, end:madridDayStart(start + 36 * 3600000) };
}

function activityMillis(value) {
  let at = Number(value) || 0;
  if (at && at < 4_102_444_800) at *= 1000;
  return at;
}

function operationalInput(activity) {
  if (activity && typeof activity === 'object') return {
    touched: activity.touched === true || Number(activity.activity_at) > 0,
    activityAt: activityMillis(activity.activity_at),
    activeSince: activityMillis(activity.active_since)
  };
  return {
    touched: activity === true || Number(activity) > 0,
    activityAt: activity === true ? 0 : activityMillis(activity),
    activeSince: 0
  };
}

export function missionVisibleDetails(ticket, now = Date.now(), activity = false) {
  const status = String(ticket && ticket.status || '').toLowerCase();
  if (status === 'cancelled') return { state:'cancelled', active_since:null, transition_at:null, reason:null };
  if (status === 'resolved') return { state:'resolved', active_since:null, transition_at:null, reason:null };
  const input = operationalInput(activity);
  const active = status === 'in_progress' || status === 'unconcluded' || input.touched;
  // `active_since` es estable. updated_at/live_at/activity_at sólo prueban que
  // hubo trabajo; nunca reinician el reloj. Para históricos sin sello explícito,
  // la creación es el fallback más conservador y auditable.
  const activeSince = active ? (input.activeSince || activityMillis(ticket && ticket.started_at) ||
    activityMillis(ticket && ticket.created_at) || input.activityAt) : 0;
  const transitionAt = activeSince ? activeSince + MISSION_UNCONCLUDED_AFTER_MS : 0;
  if (status === 'unconcluded' || (active && transitionAt && now >= transitionAt)) {
    return { state:'unconcluded', active_since:activeSince || null,
      transition_at:transitionAt || null, reason:OPERATIONAL_LIMIT_REASON };
  }
  if (active) return { state:'in_progress', active_since:activeSince || null,
    transition_at:transitionAt || null, reason:null };
  if (ticket && (ticket.assignee || ticket.loc)) return { state:'pending', active_since:null, transition_at:null, reason:null };
  return { state:'unassigned', active_since:null, transition_at:null, reason:null };
}

export function missionVisibleState(ticket, now = Date.now(), activity = false) {
  return missionVisibleDetails(ticket, now, activity).state;
}

export function taskVisibleDetails(task, now = Date.now()) {
  const status = String(task && task.status || '').toLowerCase();
  if (['done','resolved','completed'].includes(status)) return { state:'done', active_since:null, transition_at:null, reason:null };
  if (status === 'cancelled') return { state:'cancelled', active_since:null, transition_at:null, reason:null };
  if (status !== 'in_progress' && status !== 'doing' && status !== 'active' && status !== 'unconcluded') {
    return { state:'pending', active_since:null, transition_at:null, reason:null };
  }
  const activeSince = activityMillis(task && task.started_at) || activityMillis(task && task.updated_at) ||
    activityMillis(task && task.created_at);
  const transitionAt = activeSince ? activeSince + MISSION_UNCONCLUDED_AFTER_MS : 0;
  if (status === 'unconcluded' || (transitionAt && now >= transitionAt)) {
    return { state:'unconcluded', active_since:activeSince || null,
      transition_at:transitionAt || null, reason:OPERATIONAL_LIMIT_REASON };
  }
  return { state:'in_progress', active_since:activeSince || null,
    transition_at:transitionAt || null, reason:null };
}

export function taskVisibleState(task, now = Date.now()) {
  return taskVisibleDetails(task, now).state;
}

export function onIdleEligibility({ missions = [], tasks = [], live_decisions = 0,
  windows_today = 0, now = Date.now(), daily_limit = 8 } = {}) {
  const missionStates = missions.map((row) => missionVisibleDetails(row, now, row.activity || false));
  const taskStates = tasks.map((row) => taskVisibleDetails(row, now));
  const blockers = {
    missions: missionStates.filter((row) => row.state === 'in_progress').length,
    tasks: taskStates.filter((row) => row.state === 'in_progress').length,
    decisions: Math.max(0, Number(live_decisions) || 0)
  };
  const used = Math.max(0, Number(windows_today) || 0);
  const limit = Math.max(0, Number(daily_limit) || 8);
  const quota = { used, limit, remaining:Math.max(0, limit - used) };
  const canOpen = !blockers.missions && !blockers.tasks && !blockers.decisions && quota.remaining > 0;
  return { can_open:canOpen, blockers, quota,
    unconcluded:{
      missions:missionStates.filter((row) => row.state === 'unconcluded').length,
      tasks:taskStates.filter((row) => row.state === 'unconcluded').length
    }, reason:canOpen ? 'ready' : quota.remaining <= 0 ? 'daily_limit' :
      blockers.decisions ? 'live_decision' : blockers.tasks ? 'active_task' : 'active_mission' };
}

export function missionVisibleCounts(rows) {
  const out = Object.fromEntries(MISSION_VISIBLE_STATES.map((state) => [state, 0]));
  for (const row of rows || []) {
    const state = String(row && row.visible_state || '');
    if (Object.hasOwn(out, state)) out[state] += 1;
  }
  out.total = (rows || []).length;
  return out;
}
