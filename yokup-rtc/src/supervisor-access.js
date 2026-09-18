export const SUPERVISOR_DEFAULT_PROJECT_ID = "admira-tv";
export const SUPERVISOR_DEFAULT_PROJECT_LABEL = "admira.tv";

function normalizedEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function emailSet(values) {
  return new Set((Array.isArray(values) ? values : [])
    .map(normalizedEmail)
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)));
}

// El directorio de acceso es la autoridad. Un supuesto superusuario que no esté
// también en la whitelist no recibe privilegios, y una respuesta incompleta falla
// cerrada para el cambio de proyecto.
export function normalizeAccessDirectory(payload) {
  const emails = emailSet(payload && payload.emails);
  const declared = emailSet(payload && payload.superusers);
  const superusers = new Set([...declared].filter((email) => emails.has(email)));
  return {emails, superusers};
}

export function supervisorAccessForSession(directory, session) {
  const email = normalizedEmail(session && session.email);
  const allowed = Boolean(email && directory && directory.emails instanceof Set && directory.emails.has(email));
  const canChangeProject = Boolean(allowed && directory.superusers instanceof Set && directory.superusers.has(email));
  return {
    defaultProjectId:SUPERVISOR_DEFAULT_PROJECT_ID,
    defaultProjectLabel:SUPERVISOR_DEFAULT_PROJECT_LABEL,
    allowed,
    canChangeProject
  };
}

export function supervisorSessionInfo(access) {
  const policy = access || {};
  return {
    capabilities:{supervisor_project_switch:policy.canChangeProject === true},
    defaults:{
      supervisor_project_id:policy.defaultProjectId || SUPERVISOR_DEFAULT_PROJECT_ID,
      supervisor_project_label:policy.defaultProjectLabel || SUPERVISOR_DEFAULT_PROJECT_LABEL
    }
  };
}

export function resolveSupervisorProject(access, requestedProjectId) {
  const policy = access || {};
  if (policy.allowed !== true) return {ok:false, status:403, error:"supervisor_forbidden"};
  const fallback = String(policy.defaultProjectId || SUPERVISOR_DEFAULT_PROJECT_ID).trim().toLowerCase();
  const requested = String(requestedProjectId || fallback).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,119}$/.test(requested)) {
    return {ok:false, status:400, error:"project_id_required"};
  }
  if (policy.canChangeProject !== true && requested !== fallback) {
    return {ok:false, status:403, error:"project_forbidden"};
  }
  return {ok:true, projectId:requested};
}
