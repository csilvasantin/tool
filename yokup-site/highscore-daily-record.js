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

  var api = { topRows:topRows, dailyRecord:dailyRecord };
  root.YkHighscoreDailyRecord = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
