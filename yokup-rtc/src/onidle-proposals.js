const TARGET_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const TERMINAL = new Set(["resolved", "cancelled", "closed"]);
const ACTIVE = new Set(["in_progress", "unconcluded", "active", "doing"]);

// Último recurso canónico cuando incidencias y backlog abierto no alcanzan tres
// filas adoptables. No inventa un target: cada fila declara explícitamente que
// debe crear una misión nueva si Carlos la elige. El catálogo contiene las 24
// propuestas máximas que pueden consumir ocho ventanas diarias; la fecha de
// Madrid hace que al día siguiente vuelvan a ser vigentes sin reciclar un título
// ya usado durante el mismo día.
const EXPLICIT_NEW_SCOPES = Object.freeze([
  "Auditar el flujo principal y corregir el primer fallo reproducible",
  "Reducir una fricción visible en la navegación",
  "Mejorar la claridad de una acción primaria",
  "Corregir una inconsistencia visual reproducible",
  "Optimizar el primer cuello de rendimiento medible",
  "Mejorar el estado de carga más confuso",
  "Revisar la navegación por teclado y corregir el primer bloqueo",
  "Mejorar el contraste del elemento menos legible",
  "Corregir etiquetas ambiguas para lectores de pantalla",
  "Clarificar el mensaje de error menos accionable",
  "Añadir recuperación segura al primer flujo que hoy se interrumpe",
  "Evitar un doble envío o una acción repetida",
  "Detectar y corregir el primer dato incoherente visible",
  "Reforzar una validación de entrada débil",
  "Eliminar el primer duplicado verificable en una vista",
  "Añadir telemetría útil a un flujo sin diagnóstico",
  "Mejorar el informe de contexto de un error recurrente",
  "Registrar evidencia real en un proceso que hoy usa relleno",
  "Añadir una prueba de regresión a un comportamiento crítico",
  "Convertir el primer bug recurrente en una comprobación automática",
  "Cubrir un caso límite sin prueba automatizada",
  "Reducir pasos innecesarios en una tarea frecuente",
  "Mejorar la adaptación móvil de la vista más frágil",
  "Automatizar una verificación manual repetitiva"
]);

function cleanTitle(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 200);
}

export function buildOnIdleExplicitNewCandidates(project, dayKey) {
  const name = cleanTitle(project && (project.name || project.id) || "Proyecto").slice(0, 60) || "Proyecto";
  const day = String(dayKey || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  return EXPLICIT_NEW_SCOPES.map((scope, index) => ({
    title:`${scope} en ${name} · ${day}`,
    target_mission_id:null,
    explicit_new:true,
    status:"new",
    // Cualquier incidencia/backlog real queda antes que este fallback, incluso
    // si su prioridad no está normalizada.
    priority:"fallback",
    created_at:Number.MAX_SAFE_INTEGER - EXPLICIT_NEW_SCOPES.length + index
  }));
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

// La selección no inventa propuestas. Recibe backlog canónico ya acotado por
// proyecto/agente y devuelve exactamente tres filas estructuradas o falla.
// `target_mission_id:null` sólo existe para una mejora marcada explícitamente
// como nueva; una fila ambigua jamás se convierte silenciosamente en texto libre.
export function selectOnIdleProposals(candidates, context = {}) {
  const usedTargets = new Set((context.used_target_ids || []).map((value) => String(value || "").trim()).filter(Boolean));
  const activeTargets = new Set((context.active_mission_ids || []).map((value) => String(value || "").trim()).filter(Boolean));
  const usedTitles = new Set((context.used_titles || []).map(onIdleProposalTitleKey).filter(Boolean));
  const eligible = [];
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
      continue;
    }
    eligible.push({ ...raw, title, target_mission_id:target || null, explicit_new:!target && explicitNew });
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
    return { ok:false, code:"onidle_proposals_insufficient", required:3, available:selected.length, proposals:[] };
  }
  return { ok:true, proposals:selected };
}
