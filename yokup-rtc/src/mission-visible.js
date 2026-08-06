import { madridDayStart } from './display-ref.js';
import { MISSION_UNCONCLUDED_AFTER_MS } from './daily-mission-close.js';

export const MISSION_VISIBLE_STATES = Object.freeze([
  'unassigned', 'pending', 'in_progress', 'unconcluded', 'resolved', 'cancelled'
]);

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

export function missionVisibleState(ticket, now = Date.now(), activity = false) {
  const status = String(ticket && ticket.status || '').toLowerCase();
  if (status === 'cancelled') return 'cancelled';
  if (status === 'resolved') return 'resolved';
  const touched = activity === true || Number(activity) > 0;
  const activityAt = activity === true ? now : activityMillis(activity);
  const lastActivity = Math.max(
    activityMillis(ticket && ticket.created_at),
    activityMillis(ticket && ticket.updated_at),
    activityMillis(ticket && ticket.live_at),
    activityAt
  );
  if (lastActivity && now - lastActivity > MISSION_UNCONCLUDED_AFTER_MS) return 'unconcluded';
  if (status === 'in_progress' || touched) return 'in_progress';
  if (ticket && (ticket.assignee || ticket.loc)) return 'pending';
  return 'unassigned';
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
