import { madridDayStart } from './display-ref.js';

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

export function missionVisibleState(ticket, now = Date.now(), touched = false) {
  const status = String(ticket && ticket.status || '').toLowerCase();
  if (status === 'cancelled') return 'cancelled';
  if (status === 'resolved') return 'resolved';
  let created = Number(ticket && ticket.created_at) || 0;
  if (created && created < 4_102_444_800) created *= 1000;
  if (created && now - created >= 30 * 60 * 1000) return 'unconcluded';
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
