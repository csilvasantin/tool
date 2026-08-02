/* Carrera de highscore: reglas puras y deterministas, compartidas con pruebas. */
(function (root) {
  "use strict";

  function key(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function liveRows(rows) {
    return (rows || []).filter(function (row) { return !!(row && row.vivo); });
  }

  function laneKey(row) {
    return key(row && (row.agente || row.persona || row.agent));
  }

  function runnerVariant(row) {
    var value = laneKey(row), hash = 0;
    for (var i = 0; i < value.length; i++) hash = ((hash * 31) + value.charCodeAt(i)) >>> 0;
    return hash % 2 ? "dark" : "light";
  }

  function finishPose(place, finished) {
    if (!finished) return "running";
    return Number(place) === 1 ? "winner-arm-up" : "loser-head-scratch";
  }

  // Sólo 1.º y 2.º reciben una pequeña ventaja; 3.º y calles posteriores
  // comparten la meta de referencia sin producir duraciones negativas.
  function finishAdvanceMs(place, stepMs) {
    return Math.max(0, 3 - Math.max(1, Number(place) || 1)) * (Number(stepMs) || 0);
  }

  var api = { key:key, liveRows:liveRows, laneKey:laneKey, runnerVariant:runnerVariant,
    finishPose:finishPose, finishAdvanceMs:finishAdvanceMs };
  root.YkHighscoreRace = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
