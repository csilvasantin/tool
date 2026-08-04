/* Carrera de highscore: reglas puras y deterministas, compartidas con pruebas. */
(function (root) {
  "use strict";

  function key(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function activeMissionRows(rows, activeAgentKeys) {
    var active = Object.create(null);
    (activeAgentKeys || []).forEach(function (agentKey) { active[key(agentKey)] = true; });
    return (rows || []).filter(function (row) { return !!(row && row.vivo && active[laneKey(row)]); });
  }

  function raceRows(rows, activeAgentKeys, extraAgentKeys) {
    var extras = Object.create(null), seen = Object.create(null), automatic = 0;
    (extraAgentKeys || []).forEach(function (agentKey) { extras[key(agentKey)] = true; });
    return activeMissionRows(rows, activeAgentKeys).filter(function (row) {
      var agentKey = laneKey(row);
      if (!agentKey || seen[agentKey]) return false;
      seen[agentKey] = true;
      if (automatic < 3) { automatic += 1; return true; }
      return !!extras[agentKey];
    });
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

  /* Fisher-Yates puro: devuelve una permutación 1..N y permite inyectar el RNG
     para que pruebas y simulaciones reproduzcan exactamente el mismo sorteo. */
  function randomFinishOrder(count, rng) {
    var total = Math.max(0, Math.floor(Number(count) || 0));
    var order = Array.from({ length:total }, function (_, index) { return index + 1; });
    var random = typeof rng === "function" ? rng : Math.random;
    for (var i = order.length - 1; i > 0; i--) {
      var sample = Number(random());
      if (!Number.isFinite(sample)) sample = 0;
      sample = Math.max(0, Math.min(.9999999999999999, sample));
      var j = Math.floor(sample * (i + 1)), swap = order[i];
      order[i] = order[j]; order[j] = swap;
    }
    return order;
  }

  /* Un reinicio debe producir un ganador visible distinto cuando hay rival. La
     permutación sigue siendo aleatoria: sólo intercambia el 1 si el sorteo acaba
     de repetir al vencedor anterior. */
  function avoidRepeatedWinner(order, keys, previousWinnerKey) {
    var next = Array.from(order || []), lanes = Array.from(keys || []);
    if (next.length < 2 || lanes.length !== next.length || !previousWinnerKey) return next;
    var winnerIndex = next.indexOf(1), previousIndex = lanes.indexOf(previousWinnerKey);
    if (winnerIndex < 0 || winnerIndex !== previousIndex) return next;
    var challengerIndex = (winnerIndex + 1) % next.length;
    var swap = next[winnerIndex]; next[winnerIndex] = next[challengerIndex]; next[challengerIndex] = swap;
    return next;
  }

  var api = { key:key, activeMissionRows:activeMissionRows, raceRows:raceRows, laneKey:laneKey, runnerVariant:runnerVariant,
    finishPose:finishPose, finishAdvanceMs:finishAdvanceMs, randomFinishOrder:randomFinishOrder,
    avoidRepeatedWinner:avoidRepeatedWinner };
  root.YkHighscoreRace = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
