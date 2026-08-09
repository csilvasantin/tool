export const COACH_HOUR = 60 * 60 * 1000;
export const COACH_ANCHOR = Date.UTC(2026, 7, 8, 23, 0, 0, 0);
export const COACH_COUNSELORS = new Set(["ceo", "cto", "coo", "cfo", "cco", "cdo", "cxo", "cso"]);
export const COACH_AUDIENCES = new Set(["silicio", "carbono"]);

const LESSONS = {
  tecnologia: ["contratos-claros", "observabilidad", "automatizacion", "simplicidad"],
  creatividad: ["restriccion", "divergir-converger", "narrativa", "prototipo"],
  negocio: ["problema-real", "valor-captura", "prioridad", "validacion"]
};
const DIMENSIONS = Object.keys(LESSONS);

export function coachLessonForSlot(slotId) {
  const offset = Math.floor((slotId * COACH_HOUR - COACH_ANCHOR) / COACH_HOUR);
  const dimensionIndex = ((offset % DIMENSIONS.length) + DIMENSIONS.length) % DIMENSIONS.length;
  return coachLessonForDimension(slotId, DIMENSIONS[dimensionIndex]);
}

// La lección que le tocaría a OTRA temática en esta misma franja (Carlos,
// 9-ago-2026: la ventana de formación deja escoger las dos temáticas que no
// tocaban). La franja deja de imponer la dimensión, pero sigue imponiendo el
// CICLO: escoger «creatividad» a las 10:00 y otra vez a las 13:00 no repite
// lección, porque el ciclo ha avanzado. Devolver siempre la primera del
// catálogo habría convertido la elección manual en un bucle de una lección.
export function coachLessonForDimension(slotId, dimension) {
  const dim = DIMENSIONS.includes(dimension) ? dimension : DIMENSIONS[0];
  const offset = Math.floor((slotId * COACH_HOUR - COACH_ANCHOR) / COACH_HOUR);
  const cycle = Math.floor(offset / DIMENSIONS.length);
  const catalog = LESSONS[dim];
  return { dimension: dim, lessonId: catalog[((cycle % catalog.length) + catalog.length) % catalog.length] };
}

export function validateCoachLaunch(body, now = Date.now()) {
  const audience = String(body && body.audience || "").toLowerCase();
  const counselor = String(body && body.counselor || "").toLowerCase();
  if (!COACH_AUDIENCES.has(audience) || !COACH_COUNSELORS.has(counselor)) {
    return { ok:false, status:400, error:"Agente o audiencia no válidos" };
  }
  const targetSlotId = Math.floor(now / COACH_HOUR) + 1;
  const { dimension, lessonId } = coachLessonForSlot(targetSlotId);
  return {
    ok:true, audience, counselor, targetSlotId, dimension, lessonId,
    launchId:`coach-launch-${audience}-${counselor}-${targetSlotId}-${lessonId}`
  };
}

export function validateCoachCompletion(body, now = Date.now(), options = {}) {
  const audience = String(body && body.audience || "").toLowerCase();
  const counselor = String(body && body.counselor || "").toLowerCase();
  const slotId = Number(body && body.slotId);
  const application = String(body && body.application || "").replace(/\s+/g, " ").trim();
  if (!COACH_AUDIENCES.has(audience) || !COACH_COUNSELORS.has(counselor)) {
    return { ok:false, status:400, error:"Agente o audiencia no válidos" };
  }
  if (!Number.isInteger(slotId)) return { ok:false, status:400, error:"Franja no válida" };
  const currentSlot = Math.floor(now / COACH_HOUR);
  const manuallyLaunchedNext = options.allowNextSlot === true && slotId === currentSlot + 1;
  if ((slotId > currentSlot && !manuallyLaunchedNext) || slotId < currentSlot - 24) {
    return { ok:false, status:409, error:"La franja está fuera de la ventana de registro de 24 horas" };
  }
  if (application.length < 20 || application.length > 900) {
    return { ok:false, status:400, error:"La aplicación debe tener entre 20 y 900 caracteres" };
  }
  const { dimension, lessonId } = coachLessonForSlot(slotId);
  return {
    ok:true, audience, counselor, slotId, application, dimension, lessonId,
    eventId:`coach-${audience}-${counselor}-${slotId}-${lessonId}`
  };
}
