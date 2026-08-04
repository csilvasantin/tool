/* Referencia humana común de Objetivos · Decisiones · Misiones · Tareas.
 * El ID técnico sigue viajando en enlaces y data-*; esta función sólo pinta.
 * El worker manda `display_ref`. El fallback 0000 no inventa una secuencia. */
(function (g) {
  "use strict";
  function epochMs(value) {
    var n = Number(value || 0);
    return n && n < 4102444800 ? n * 1000 : n;
  }
  function fallback(createdAt) {
    var ms = epochMs(createdAt);
    if (!ms) return "0000.--/--/----.--:--";
    try {
      var parts = new Intl.DateTimeFormat("en-GB", {
        timeZone:"Europe/Madrid", day:"2-digit", month:"2-digit", year:"numeric",
        hour:"2-digit", minute:"2-digit", hourCycle:"h23"
      }).formatToParts(new Date(ms));
      var out = {};
      parts.forEach(function (part) { if (part.type !== "literal") out[part.type] = part.value; });
      return "0000." + out.day + "/" + out.month + "/" + out.year + "." + out.hour + ":" + out.minute;
    } catch (e) {
      var d = new Date(ms), p = function (n) { return String(n).padStart(2, "0"); };
      return "0000." + p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear() + "." + p(d.getHours()) + ":" + p(d.getMinutes());
    }
  }
  function of(row) {
    var supplied = String(row && row.display_ref || "").trim();
    return supplied || fallback(row && row.created_at);
  }
  g.YkDisplayRef = { of:of, fallback:fallback, epochMs:epochMs };
})(window);
