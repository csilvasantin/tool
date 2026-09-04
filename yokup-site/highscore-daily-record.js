/* Récord diario histórico y distancia viva para batirlo.
 * El récord excluye el día en curso: si hoy lo supera, la meta no se mueve
 * detrás del líder en cada refresco. */
(function (root) {
  "use strict";

  function topRows(day) {
    return (day && Array.isArray(day.top) ? day.top : []).filter(function (row) {
      return row && String(row.agent || "").trim() && Number.isFinite(Number(row.points));
    }).map(function (row) {
      return { agent:String(row.agent).trim(), points:Math.max(0, Number(row.points) || 0) };
    }).sort(function (a, b) { return b.points - a.points || a.agent.localeCompare(b.agent, "es"); });
  }

  function dailyRecord(payload, todayKey) {
    var days = payload && Array.isArray(payload.all_days) ? payload.all_days : [];
    var today = String(todayKey || payload && payload.evolution && payload.evolution.end || "");
    var records = [];
    days.forEach(function (day) {
      if (!day || String(day.day || "") === today) return;
      topRows(day).forEach(function (row) {
        records.push({ day:String(day.day || ""), agent:row.agent, points:row.points });
      });
    });
    records.sort(function (a, b) {
      return b.points - a.points || a.day.localeCompare(b.day) || a.agent.localeCompare(b.agent, "es");
    });
    var record = records[0] || null;
    var todayRow = days.filter(function (day) { return day && String(day.day || "") === today; })[0] || null;
    var leader = topRows(todayRow)[0] || null;
    if (!record) return { available:false, today:today, record:null, leader:leader };
    var target = record.points + 1, current = leader ? leader.points : 0;
    return { available:true, today:today, record:record, leader:leader, target:target,
      remaining:Math.max(0, target - current), beatenBy:Math.max(0, current - record.points),
      progress:Math.max(0, Math.min(100, target ? current / target * 100 : 0)) };
  }

  function zoneClock(now, timeZone) {
    var parts = {}, date = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
    new Intl.DateTimeFormat("en-GB", {
      timeZone:timeZone || "Europe/Madrid", hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23"
    }).formatToParts(date).forEach(function (part) { parts[part.type] = Number(part.value); });
    return { hour:parts.hour || 0, minute:parts.minute || 0, second:parts.second || 0 };
  }

  function zoneDateKey(now, timeZone) {
    var parts = {}, date = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
    new Intl.DateTimeFormat("en-CA", {
      timeZone:timeZone || "Europe/Madrid", year:"numeric", month:"2-digit", day:"2-digit"
    }).formatToParts(date).forEach(function (part) { parts[part.type] = part.value; });
    return parts.year + "-" + parts.month + "-" + parts.day;
  }

  /* Ritmo del líder de hoy frente a una meta fija (récord histórico + 1).
   * Se calcula con el reloj civil de Madrid incluso si el navegador está en
   * otra zona. La proyección usa el promedio transcurrido del día y el ritmo
   * necesario reparte solamente los puntos que faltan entre las horas restantes. */
  function recordPace(chase, now, timeZone) {
    if (!chase || !chase.available) return { available:false };
    var clock = zoneClock(now, timeZone), elapsedHours = clock.hour + clock.minute / 60 + clock.second / 3600;
    var remainingHours = Math.max(0, 24 - elapsedHours), current = chase.leader ? Math.max(0, Number(chase.leader.points) || 0) : 0;
    var currentPerHour = elapsedHours > 0 ? current / elapsedHours : 0;
    var requiredPerHour = remainingHours > 0 ? chase.remaining / remainingHours : chase.remaining;
    var projected = elapsedHours > 0 ? currentPerHour * 24 : current;
    var won = chase.remaining === 0, ahead = won || projected >= chase.target;
    return {
      available:true, clock:clock, elapsedHours:elapsedHours, remainingHours:remainingHours,
      current:current, currentPerHour:currentPerHour, requiredPerHour:requiredPerHour,
      projected:projected, ahead:ahead, won:won, status:won ? "won" : (ahead ? "ahead" : "behind")
    };
  }

  var api = { topRows:topRows, dailyRecord:dailyRecord, zoneClock:zoneClock, zoneDateKey:zoneDateKey, recordPace:recordPace };
  root.YkHighscoreDailyRecord = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
