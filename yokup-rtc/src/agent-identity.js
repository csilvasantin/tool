// Diccionario único de apellidos (normativa regla 02). El apellido visible es el
// modelo abreviado, igual en toda la flota: MacBookAirAzul → MBAAzul → NeoMBAAzul.
// Los apellidos por color a secas ("Azul") y "Plata16"/"14" son de la generación
// anterior: se siguen leyendo, no se vuelven a escribir (Carlos, 2026-08-03).
// El apellido del Mac Mini es MacMini, sin abreviar: MorfeoMacMini, no MorfeoMini
// (Carlos, 2026-08-04). El front ya lo hacía (yk-agent-identity.js); aquí seguía
// al revés y el API reescribía el apellido completo al legado en cada censo.
const MACHINES = [
  ["MacMini", ["macmini", "mac mini", "mac mini carlos", "admira-macmini", "macmini.local"]],
  ["MBP14", ["mbp14", "macbookpro14", "macbook pro 14", "macbookpronegro14", "macbook pro negro 14", "admira-macbookpronegro14"]],
  ["MBP16", ["mbp16", "macbookpro16", "macbook pro 16", "admira-macbookpro16", "macbook-pro-16"]],
  ["MBAAzul", ["mbaazul", "macbookairazul", "macbook air azul", "mba azul", "admira-macbookairazul"]],
  ["MBARosa", ["mbarosa", "macbookairrosa", "macbook air rosa", "mba rosa", "admira-macbookairrosa"]],
  ["MBACrema", ["mbacrema", "macbookaircrema", "macbook air crema", "mba crema", "admira-macbookaircrema"]],
  ["MBAPlata", ["mbaplata", "macbookairplata", "macbook air plata", "mba plata", "admira-macbookairplata"]],
  ["MBA16", ["mba16", "macbookair16plata", "macbookair16", "macbook air 16 dg", "mba 16 plata", "admira-macbookair16"]],
  ["Zenbook", ["asuszenbook", "asus zenbook", "admira-asuszenbook"]],
  ["DGX", ["dgxspark", "dgx spark", "dgx-spark", "spark-1e61", "spark1e61"]],
  ["PGX", ["thinkstationpgx", "thinkstation pgx", "thinkstation", "lenovo-thinkstation", "lenovothinkstation"]],
];
const PERSONAS = [
  ["Oraculo", ["oraculo", "oráculo", "oracle"]],
  ["Neo", ["neo"]],
  ["Morfeo", ["morfeo", "morpheus"]],
  ["Trinity", ["trinity"]],
  ["Smith", ["smith", "cypher", "agente smith"]],
  ["WhiteRabbit", ["whiterabbit", "white rabbit"]],
];
// Apellidos que se usaron antes y siguen vivos en datos ya guardados. Se leen,
// pero al volver a escribir salen con el apellido actual.
const LEGACY_SUFFIXES = new Map([
  ["16", "MBP16"], ["14", "MBP14"], ["mini", "MacMini"],
  ["azul", "MBAAzul"], ["rosa", "MBARosa"], ["crema", "MBACrema"], ["plata", "MBAPlata"],
  ["air16", "MBA16"], ["plata16", "MBA16"],
]);

export function identityKey(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function machineSuffix(machine) {
  const key = identityKey(machine);
  if (!key) return "";
  for (const [suffix, aliases] of MACHINES) {
    if (aliases.some((alias) => {
      const candidate = identityKey(alias);
      return key === candidate || key.startsWith(candidate);
    })) return suffix;
  }
  return "";
}

export function parseAgentIdentity(value) {
  let key = identityKey(value), role = "main";
  if (key.startsWith("infra")) { role = "infra"; key = key.slice(5); }
  else if (key.startsWith("sub")) { role = "sub"; key = key.slice(3); }
  key = key.replace(/^agente/, "");
  for (const [name, aliases] of PERSONAS) {
    const candidates = aliases.map((alias) => identityKey(alias).replace(/^agente/, ""))
      .sort((a, b) => b.length - a.length);
    for (const alias of candidates) {
      if (!key.startsWith(alias)) continue;
      const tail = key.slice(alias.length);
      const suffix = MACHINES.map(([s]) => s).find((s) => identityKey(s) === tail) ||
        LEGACY_SUFFIXES.get(tail) || "";
      return { role, persona: name, suffix, legacy: !suffix };
    }
  }
  return { role, persona: String(value || ""), suffix: "", legacy: true };
}

export function baseAgentIdentity(value) {
  return parseAgentIdentity(value).persona;
}

export function scopedAgentIdentity(persona, machine, role) {
  const parsed = parseAgentIdentity(persona);
  const effectiveRole = role || parsed.role || "main";
  const suffix = machineSuffix(machine) || parsed.suffix;
  return `${effectiveRole === "sub" ? "Sub" : effectiveRole === "infra" ? "Infra" : ""}${parsed.persona}${suffix}`;
}

// Identidad visible en informes: EL MISMO nombre que en el resto de pantallas.
// Los registros históricos pueden guardar sólo la persona, una capa genérica o un
// apellido antiguo; la máquina de la misión es la fuente física real, así que el
// nombre se recompone sin alterar el owner persistido. Si no se puede recomponer,
// se devuelve tal cual antes que inventar un apellido (normativa regla 04).
export function reportAgentIdentity(owner, machine) {
  const parsed = parseAgentIdentity(owner);
  const suffix = machineSuffix(machine) || parsed.suffix;
  const knownPersona = PERSONAS.some(([name]) => name === parsed.persona);
  if (!suffix || !parsed.persona || !knownPersona) {
    return String(owner || "");
  }
  const prefix = parsed.role === "sub" ? "Sub" : parsed.role === "infra" ? "Infra" : "";
  return `${prefix}${parsed.persona}${suffix}`;
}

// Una familia es persona + máquina física. La capa de ejecución (main/sub/infra)
// cambia executor y role, pero nunca la clave familiar. Para identidades ajenas
// al censo se conserva owner+máquina en la clave para no mezclar homónimos ni
// equipos distintos.
export function reportAgentFamily(owner, machine) {
  const executor = reportAgentIdentity(owner, machine);
  const parsed = parseAgentIdentity(executor || owner);
  const suffix = machineSuffix(machine) || parsed.suffix;
  const knownPersona = PERSONAS.some(([name]) => name === parsed.persona);
  const role = ["main", "sub", "infra"].includes(parsed.role) ? parsed.role : "main";
  if (knownPersona && suffix) {
    return {
      executor,
      role,
      family_key:`${identityKey(parsed.persona)}@${identityKey(suffix)}`,
      family_name:`${parsed.persona}${suffix}`
    };
  }
  const raw = String(executor || owner || "desconocido").trim() || "desconocido";
  return {
    executor:raw,
    role,
    family_key:`external:${identityKey(raw) || "desconocido"}@${identityKey(machine) || "equipo-desconocido"}`,
    family_name:raw
  };
}

export function sameAgentFamily(a, b) {
  return identityKey(baseAgentIdentity(a)) === identityKey(baseAgentIdentity(b));
}

export const AGENT_IDENTITY_SPEC = Object.freeze({
  machines: MACHINES.map(([suffix, aliases]) => ({ suffix, aliases: aliases.slice() })),
  personas: PERSONAS.map(([name, aliases]) => ({ name, aliases: aliases.slice() })),
});
