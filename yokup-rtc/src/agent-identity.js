const MACHINES = [
  ["Mini", ["macmini", "mac mini", "mac mini carlos", "admira-macmini", "macmini.local"]],
  ["14", ["macbookpro14", "macbook pro 14", "macbookpronegro14", "macbook pro negro 14", "admira-macbookpronegro14"]],
  // El apellido del Pro 16 es MBP16, no "16" a secas (Carlos, 2026-08-02). Los
  // "Neo16"/"Morfeo16" ya guardados siguen resolviendo a su persona por
  // parseAgentIdentity, así que no se pierde la familia; sólo dejan de llevar
  // apellido reconocido y quedan marcados como legacy.
  ["MBP16", ["macbookpro16", "macbook pro 16", "admira-macbookpro16", "macbook-pro-16"]],
  ["Azul", ["macbookairazul", "macbook air azul", "mba azul", "admira-macbookairazul"]],
  ["Rosa", ["macbookairrosa", "macbook air rosa", "mba rosa", "admira-macbookairrosa"]],
  ["Crema", ["macbookaircrema", "macbook air crema", "mba crema", "admira-macbookaircrema"]],
  ["Plata", ["macbookairplata", "macbook air plata", "mba plata", "admira-macbookairplata"]],
  ["Plata16", ["macbookair16plata", "macbookair16", "macbook air 16 dg", "mba 16 plata", "admira-macbookair16"]],
  ["Zenbook", ["asuszenbook", "asus zenbook", "admira-asuszenbook"]],
  ["DGX", ["dgxspark", "dgx spark", "dgx-spark"]],
  ["PGX", ["thinkstationpgx", "thinkstation pgx", "thinkstation"]],
];
const PERSONAS = [
  ["Oraculo", ["oraculo", "oráculo", "oracle"]],
  ["Neo", ["neo"]],
  ["Morfeo", ["morfeo", "morpheus"]],
  ["Trinity", ["trinity"]],
  ["Smith", ["smith", "cypher", "agente smith"]],
  ["WhiteRabbit", ["whiterabbit", "white rabbit"]],
];
const AIR_SUFFIXES = new Set(["Azul", "Rosa", "Crema", "Plata", "Plata16"]);
// Apellidos que se usaron antes y siguen vivos en datos ya guardados. Se leen,
// pero al volver a escribir salen con el apellido actual.
const LEGACY_SUFFIXES = new Map([["16", "MBP16"]]);

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
  const main = parsed.persona === "Smith" && AIR_SUFFIXES.has(suffix)
    ? `Agente Smith ${suffix}` : `${parsed.persona}${suffix}`;
  return `${effectiveRole === "sub" ? "Sub" : effectiveRole === "infra" ? "Infra" : ""}${main}`;
}

export function sameAgentFamily(a, b) {
  return identityKey(baseAgentIdentity(a)) === identityKey(baseAgentIdentity(b));
}

export const AGENT_IDENTITY_SPEC = Object.freeze({
  machines: MACHINES.map(([suffix, aliases]) => ({ suffix, aliases: aliases.slice() })),
  personas: PERSONAS.map(([name, aliases]) => ({ name, aliases: aliases.slice() })),
});
