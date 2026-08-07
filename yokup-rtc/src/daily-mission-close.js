import { madridDayKey, madridDayStart } from './display-ref.js';

export const DAILY_MISSION_CLOSE_REASON = 'daily_cleanup';
export const DAILY_MISSION_CLOSE_EVENT_KIND = 'status';
export const DAILY_MISSION_CLOSE_AUTHOR = 'yokup';
export const DAILY_MISSION_CLOSE_LEASE_MS = 10 * 60 * 1000;
// Límite operativo compartido por misiones, tareas y OnIdle. Es un reloj duro:
// los heartbeats prueban presencia, pero no prolongan indefinidamente el encargo.
export const MISSION_UNCONCLUDED_AFTER_MS = 60 * 60 * 1000;

// El plan no depende de la hora UTC del cron. `closedAt` es siempre la
// medianoche real de Madrid (23:00 o 22:00 UTC según DST) que acaba de cerrar
// `day`; un reintento horas después conserva exactamente el mismo corte.
export function dailyMissionClosePlan(now = Date.now()) {
  const currentDayStart = madridDayStart(now);
  return {
    day: madridDayKey(currentDayStart - 1),
    closedAt: currentDayStart
  };
}

export function dailyMissionCloseEventText(day) {
  return `Estado → cancelled · cierre_diario · día ${day}`;
}
