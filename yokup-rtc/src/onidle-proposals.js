const TARGET_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const TERMINAL = new Set(["resolved", "cancelled", "closed"]);
const ACTIVE = new Set(["in_progress", "unconcluded", "active", "doing"]);

export const ONIDLE_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const ACTION = /^(?:anadir|añadir|automatizar|completar|corregir|crear|detectar|eliminar|evitar|mejorar|migrar|optimizar|reducir|reforzar|rehacer|revisar|simplificar|sustituir)\b/i;
const CONCRETE_SCOPE = /(?:https?:\/\/|\/[a-z0-9][a-z0-9._~!$&'()*+,;=:@%\/-]*|\b(?:api|endpoint|flujo|formulario|highscore|navegaci[oó]n|pantalla|ruta|sitemap|status|worker)\b)/i;
const MEASURABLE = /(?:\b\d+(?:[.,]\d+)?\s*(?:%|ms|s|min|h|bytes?|kb|mb|gb|rutas?|pasos?|errores?|veces?)?\b|\b(?:http\s*)?[45]\d\d\b|\b(?:medir|medido|verificar|verificado|de\s+\d+\s+a\s+\d+|hasta\s+\d+)\b)/i;
const OUTCOME = /\b(?:para|hasta|de\s+\d+\s+a|reducir|aumentar|eliminar|evitar|corregir|completar|verificar)\b/i;

function cleanTitle(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 200);
}

export function buildOnIdleExplicitNewCandidates(project, dayKey) {
  const day = String(dayKey || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  // Academy deja de premiar hablar por hablar. Si el backlog no contiene tres
  // mejoras fundadas, OnIdle debe encargar investigación y NO fabricar títulos.
  return [];
}

export function assessOnIdleProposal(raw, now = Date.now()) {
  const title = cleanTitle(raw && raw.title);
  const evidenceAt = Number(raw && (raw.evidence_at || raw.updated_at || raw.created_at)) || 0;
  const fresh = evidenceAt > 0 && evidenceAt <= now + 5 * 60 * 1000 && now - evidenceAt <= ONIDLE_EVIDENCE_MAX_AGE_MS;
  const criteria = {
    evidence:fresh,
    problem:title.length >= 24 && CONCRETE_SCOPE.test(title),
    impact:MEASURABLE.test(title),
    action:ACTION.test(title),
    verification:OUTCOME.test(title) && MEASURABLE.test(title)
  };
  const score = Object.values(criteria).filter(Boolean).length;
  return { ok:fresh && criteria.action && criteria.impact && score >= 4,
    score, criteria, evidence_at:evidenceAt || null, max_age_ms:ONIDLE_EVIDENCE_MAX_AGE_MS };
}

export function onIdleProposalTitleKey(value) {
  return cleanTitle(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function priorityRank(value) {
  const key = String(value || "").trim().toLowerCase();
  if (key === "critical" || key === "urgent" || key === "critica" || key === "crítica") return 0;
  if (key === "high" || key === "alta") return 1;
  if (key === "normal" || key === "medium" || key === "media") return 2;
  if (key === "low" || key === "baja") return 3;
  return 4;
}

function compareCandidates(left, right) {
  return priorityRank(left.priority) - priorityRank(right.priority) ||
    (Number(left.created_at) || Number.MAX_SAFE_INTEGER) - (Number(right.created_at) || Number.MAX_SAFE_INTEGER) ||
    String(left.target_mission_id || "").localeCompare(String(right.target_mission_id || ""), "es") ||
    onIdleProposalTitleKey(left.title).localeCompare(onIdleProposalTitleKey(right.title), "es");
}

// La selección no inventa propuestas. Recibe el backlog canónico del proyecto
// y devuelve exactamente tres filas fundadas o falla para encargar investigación.
// Una fila sin `target_mission_id` jamás se convierte silenciosamente en texto libre.
export function selectOnIdleProposals(candidates, context = {}) {
  const usedTargets = new Set((context.used_target_ids || []).map((value) => String(value || "").trim()).filter(Boolean));
  const activeTargets = new Set((context.active_mission_ids || []).map((value) => String(value || "").trim()).filter(Boolean));
  const usedTitles = new Set((context.used_titles || []).map(onIdleProposalTitleKey).filter(Boolean));
  const eligible = [], rejected = { stale:0, generic:0 };
  const now = Number(context.now) || Date.now();
  for (const raw of Array.isArray(candidates) ? candidates : []) {
    const title = cleanTitle(raw && raw.title);
    const titleKey = onIdleProposalTitleKey(title);
    const status = String(raw && raw.status || "").trim().toLowerCase();
    const target = String(raw && raw.target_mission_id || "").trim();
    const explicitNew = raw && raw.explicit_new === true;
    if (!title || !titleKey || TERMINAL.has(status) || ACTIVE.has(status) || usedTitles.has(titleKey)) continue;
    if (target) {
      if (!TARGET_ID.test(target) || explicitNew || usedTargets.has(target) || activeTargets.has(target)) continue;
    } else if (!explicitNew) {
      // Un texto sin misión ni investigación canónica sigue siendo relleno.
      // `explicit_new` sólo se admite cuando pasa el mismo contrato de evidencia
      // fresca, acción, alcance y métrica que una misión del backlog.
      rejected.generic++;
      continue;
    }
    const quality = assessOnIdleProposal({ ...raw, title }, now);
    if (!quality.ok) {
      if (!quality.criteria.evidence) rejected.stale++;
      else rejected.generic++;
      continue;
    }
    eligible.push({ ...raw, title, target_mission_id:target, quality });
  }
  eligible.sort(compareCandidates);
  const selected = [], seenTargets = new Set(), seenTitles = new Set();
  for (const row of eligible) {
    const titleKey = onIdleProposalTitleKey(row.title);
    if (seenTitles.has(titleKey) || (row.target_mission_id && seenTargets.has(row.target_mission_id))) continue;
    seenTitles.add(titleKey);
    if (row.target_mission_id) seenTargets.add(row.target_mission_id);
    selected.push(row.target_mission_id
      ? { title:row.title, target_mission_id:row.target_mission_id }
      : { title:row.title, target_mission_id:null, explicit_new:true });
    if (selected.length === 3) break;
  }
  if (selected.length !== 3) {
    return { ok:false, code:"onidle_proposals_insufficient", required:3,
      available:selected.length, rejected, action:"investigate", proposals:[] };
  }
  return { ok:true, quality_contract:"academy-improvement-v1", rejected, proposals:selected };
}
