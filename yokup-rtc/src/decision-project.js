function text(value, limit) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, limit);
}

export function projectSlug(value) {
  return text(value, 120).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function identityKey(value, kind = "") {
  let key = text(value, 80).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "");
  // project_members guarda el id de flota `admira-macmini`, mientras los
  // relojes identifican la máquina por su rótulo `Mac Mini`.
  if (kind === "machine") key = key.replace(/^admira/, "");
  return key;
}

export function memberRefMatches(kind, ref, requested) {
  return identityKey(ref, kind) === identityKey(requested, kind);
}

function invalid(error) { return { ok: false, error }; }
function isAggregateDomain(value) {
  return /^(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\/?$/i.test(text(value, 120));
}
function cleanWeb(value) {
  return text(value, 160).toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

// `assignment` procede exclusivamente de projects + project_members. El
// helper no conoce ningún proyecto por código: valida el contrato explícito
// contra la intersección agent+machine que resolvió D1.
export function resolveDecisionProject(input, assignment, inherited = null) {
  const agent = text(input && input.agent, 40);
  const machine = text(input && input.machine, 60);
  if (!agent || !machine) return invalid("agent y machine exactos requeridos");
  if (!assignment || !assignment.id || !assignment.name) {
    return invalid("no existe una asignación canónica única para agent+machine");
  }
  const canonicalProject = text(assignment.name, 120);
  const canonicalSlug = projectSlug(canonicalProject);
  const canonicalWeb = cleanWeb(assignment.web);

  if (inherited) {
    if (!memberRefMatches("agent", inherited.agent, agent) || !memberRefMatches("machine", inherited.machine, machine)) {
      return invalid("agent y machine no coinciden con la decisión raíz");
    }
    if (text(inherited.project, 120) !== canonicalProject || text(inherited.project_slug, 120).toUpperCase() !== canonicalSlug) {
      return invalid("la decisión raíz ya no coincide con la asignación canónica");
    }
  }

  const project = text((input && input.project) || (inherited && inherited.project), 120);
  const slug = text((input && input.project_slug) || (inherited && inherited.project_slug), 120).toUpperCase();
  if (!project || !slug) return invalid("project y project_slug granulares requeridos");
  if (isAggregateDomain(project)) return invalid("un dominio agregado no identifica un proyecto granular");
  if (projectSlug(project) !== slug) return invalid("project_slug no corresponde exactamente a project");
  if (project !== canonicalProject || slug !== canonicalSlug) {
    return invalid("project/project_slug no coinciden con projects/project_members");
  }
  const suppliedWeb = cleanWeb(input && input.project_web);
  if (suppliedWeb && suppliedWeb !== canonicalWeb) return invalid("project_web no coincide con el proyecto canónico");
  return {
    ok: true, project: canonicalProject, project_id: assignment.id,
    project_slug: canonicalSlug, project_web: canonicalWeb, agent, machine
  };
}
