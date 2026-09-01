import {
  baseAgentIdentity,
  identityKey as agentIdentityKey,
  identitySqlKey as agentIdentitySqlKey,
  machineSuffix,
  parseAgentIdentity,
  scopedAgentIdentity,
} from "./agent-identity.js";

function text(value, limit) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, limit);
}

export function projectSlug(value) {
  return text(value, 120).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function identityKey(value, kind = "") {
  const source = kind === "agent" ? baseAgentIdentity(value) : value;
  let key = text(source, 80).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "");
  // project_members guarda el id de flota `admira-macmini`, mientras los
  // relojes identifican la máquina por su rótulo `Mac Mini`.
  if (kind === "machine") key = key.replace(/^admira/, "");
  return key;
}

export function machineRefKey(value) {
  return identityKey(value, "machine");
}

export function machineRefSqlKey(expression) {
  const raw = agentIdentitySqlKey(expression);
  return `(CASE WHEN ${raw} LIKE 'admira%' THEN substr(${raw},7) ELSE ${raw} END)`;
}

export function memberRefMatches(kind, ref, requested) {
  // Los agentes se comparaban sólo por PERSONA, sin apellido, así que `NeoMini`
  // contaba como `NeoMBP16`: cualquier proyecto del Mini que listara además el
  // MacBook Pro 16 se colaba como asignación del 16 y el sistema veía cinco
  // candidatos donde hay uno. Cuando ambas identidades llevan apellido tienen
  // que ser el MISMO; si la referencia va sin apellido (los alias históricos,
  // «Neo» a secas) se sigue aceptando por persona para no romperlos.
  if (kind === "agent") {
    const refId = parseAgentIdentity(ref);
    const wantId = parseAgentIdentity(requested);
    if (refId.suffix && wantId.suffix &&
      canonicalDecisionSuffix(refId.suffix) !== canonicalDecisionSuffix(wantId.suffix)) return false;
  }
  return identityKey(ref, kind) === identityKey(requested, kind);
}

// `MacMini` fue la forma física/histórica; la identidad operativa vigente se
// escribe como `Mini`. Sólo son equivalentes para esa máquina: MBP/MBA conservan
// sus sufijos exactos y siguen fallando cerrado ante cualquier contradicción.
function canonicalDecisionSuffix(suffix) {
  return suffix === "MacMini" ? "Mini" : suffix;
}

// Toda decisión nueva se persiste con la identidad derivada de su equipo. Los
// aliases planos históricos se canonizan; un apellido físico contradictorio
// falla cerrado para no atribuir trabajo del Mini al 16 (o viceversa).
export function resolveDecisionIdentity(agentValue, machineValue) {
  const rawAgent = text(agentValue, 40);
  const machine = text(machineValue, 60);
  if (!rawAgent || !machine) return invalid("agent y machine exactos requeridos");
  const physicalSuffix = machineSuffix(machine);
  if (!physicalSuffix) return invalid("machine desconocida: no se puede derivar la identidad");
  const expectedSuffix = canonicalDecisionSuffix(physicalSuffix);
  const parsed = parseAgentIdentity(rawAgent);
  if (parsed.suffix && canonicalDecisionSuffix(parsed.suffix) !== expectedSuffix) {
    return invalid(`agent ${rawAgent} contradice machine ${machine}`);
  }
  // scopedAgentIdentity deriva MacMini de la máquina cuando recibe la persona
  // plana. Para nuevas escrituras del Mini se le pasa el sufijo canónico de
  // forma explícita; así también un alias histórico OraculoMacMini se lee pero
  // converge a OraculoMini y nunca vuelve a persistirse.
  const canonicalPersona = physicalSuffix === "MacMini" ? parsed.persona + "Mini" : parsed.persona;
  return {
    ok: true,
    agent: scopedAgentIdentity(canonicalPersona, machine, parsed.role),
    machine,
  };
}

export function selectDecisionProjectAssignment(projects, members, agent, machine, requestedProjectId = "") {
  const requested = text(requestedProjectId, 120);
  const matches = (Array.isArray(projects) ? projects : []).filter((project) => {
    if (!project || String(project.status || "activo").toLowerCase() !== "activo") return false;
    const own = (Array.isArray(members) ? members : []).filter((member) => member.project_id === project.id);
    return own.some((member) => member.kind === "agent" && memberRefMatches("agent", member.ref, agent)) &&
      own.some((member) => member.kind === "machine" && memberRefMatches("machine", member.ref, machine));
  });
  if (requested) return matches.find((project) => String(project.id) === requested) || null;
  return matches.length === 1 ? matches[0] : null;
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
  const identity = resolveDecisionIdentity(input && input.agent, input && input.machine);
  if (!identity.ok) return identity;
  const { agent, machine } = identity;
  if (!assignment || !assignment.id || !assignment.name) {
    return invalid("no existe una asignación canónica única para agent+machine");
  }
  const canonicalProject = text(assignment.name, 120);
  const canonicalSlug = projectSlug(canonicalProject);
  const canonicalWeb = cleanWeb(assignment.web);
  const suppliedProjectId = text(input && input.project_id, 120);
  if (suppliedProjectId && suppliedProjectId !== String(assignment.id)) {
    return invalid("project_id no pertenece a la asignación canónica");
  }

  if (inherited) {
    const rootIdentity = resolveDecisionIdentity(inherited.agent, inherited.machine);
    if (!rootIdentity.ok ||
      agentIdentityKey(rootIdentity.agent) !== agentIdentityKey(agent) ||
      !memberRefMatches("machine", rootIdentity.machine, machine)) {
      return invalid("agent y machine no coinciden con la decisión raíz");
    }
    if ((inherited.project_id && text(inherited.project_id, 120) !== String(assignment.id)) ||
      text(inherited.project, 120) !== canonicalProject || text(inherited.project_slug, 120).toUpperCase() !== canonicalSlug) {
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
