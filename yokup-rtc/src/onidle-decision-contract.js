import { memberRefMatches } from "./decision-project.js";

export const ONIDLE_BACK_OPTION = "↩ Volver atrás";
export const ONIDLE_CUSTOM_OPTION = "✍️ Custom · Escribe la mejora que quieras a mano";

function titleKey(value) {
  return String(value || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function parseOnIdleOptions(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// El contrato del publicador servidor es más estricto que el renderer genérico
// de decisiones: tres propuestas reales y distintas, seguidas por los dos
// controles exactos. Una fila academy, legacy o incompleta nunca es OnIDLE.
export function isCanonicalOnIdleOptions(value) {
  const options = parseOnIdleOptions(value);
  if (options.length !== 5 || options[3] !== ONIDLE_BACK_OPTION || options[4] !== ONIDLE_CUSTOM_OPTION) return false;
  const proposals = options.slice(0, 3).map(titleKey);
  return proposals.every(Boolean) && new Set(proposals).size === 3 &&
    proposals.every((title) => title !== titleKey(ONIDLE_BACK_OPTION) && title !== titleKey(ONIDLE_CUSTOM_OPTION));
}

export function isCanonicalOnIdleDecision(row, scope, marker) {
  if (!row || !scope || String(row.mission || "") !== String(marker || "") ||
      String(row.surface || "") !== "highscore" || String(row.project || "") !== String(scope.project_id || "")) return false;
  if (!memberRefMatches("agent", row.agent, scope.agent) || !memberRefMatches("machine", row.machine, scope.machine)) return false;
  return isCanonicalOnIdleOptions(row.options);
}

export function selectCanonicalLiveOnIdleDecision(rows, scope, marker) {
  return (Array.isArray(rows) ? rows : []).find((row) =>
    String(row && row.status || "") === "pending" && isCanonicalOnIdleDecision(row, scope, marker)) || null;
}
