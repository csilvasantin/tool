// Diccionario único de apellidos (normativa regla 02). El apellido visible es el
// modelo abreviado, igual en toda la flota: MacBookAirAzul → MBAAzul → NeoMBAAzul.
// Los apellidos por color a secas ("Azul") y "Plata16"/"14" son de la generación
// anterior: se siguen leyendo, no se vuelven a escribir (Carlos, 2026-08-03).
// MacMini sigue siendo el apellido derivado de una máquina sin identidad explícita
// y se conserva para leer el histórico. Cuando la fuente ya declara el apellido
// operativo Mini (OraculoMini/SubOraculoMini/InfraOraculoMini), ese dato explícito
// prevalece sobre la máquina para que /fleet/sync no lo reescriba al alias anterior.
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
  // GrokBot es el EQUIPO donde razonan los consejeros del Consejo de Silicio que viven
  // como bots en la app Grok Bot (SpaceXAI, «sand»): no es un Mac de la flota, es la
  // nube de xAI, y la norma 04 manda decir en qué equipo se hizo cada trabajo sin
  // disfrazarlo de otro. Carlos, 4-sep-2026 (FLT-1580): «aumentar el equipo de
  // AdmiraNeXT con la conexión con el Consejo».
  ["GrokBot", ["grokbot", "grok bot", "grok-bot", "sand", "xai", "grok"]],
];
const PERSONAS = [
  ["Oraculo", ["oraculo", "oráculo", "oracle"]],
  ["Neo", ["neo"]],
  // Link es la identidad principal de Claude con csilva@admira.com EN EL MAC MINI
  // desde el 1-sep-2026 (FLT-1487), por la misma razón que Niobe más abajo: el
  // mandamiento 12 asigna la identidad por máquina. Neo se queda — sigue siendo esa
  // cuenta en MBP16 y MBAAzul, y firma todo lo ya cerrado (norma 03).
  ["Link", ["link"]],
  ["Morfeo", ["morfeo", "morpheus"]],
  ["Trinity", ["trinity"]],
  // Un solo Smith: el color NO es apellido (Carlos, 3-sep-2026). Los nombres con color
  // que ya firmó la flota se leen como Smith. «Smith Rosa/Azul/Crema/Plata» no van aquí:
  // ese color es apellido de MÁQUINA y el parser ya lo convierte en SmithMBARosa, etc.
  ["Smith", ["smith", "cypher", "agente smith", "smith gris", "smith negro", "smithgris", "smithnegro"]],
  ["WhiteRabbit", ["whiterabbit", "white rabbit"]],
  // Niobe corre de verdad en el MacMini (launchd com.admiranext.agente-niobe +
  // agent-inbox-niobe + sesión tmux + presencia), pero faltaba aquí, y una persona que
  // no está en este diccionario NO PUEDE CERRAR NADA: parseAgentIdentity cae al return
  // final con suffix vacío, y validateMissionActor lo compara contra machineSuffix(loc)
  // — «MacMini» — así que devuelve 403 owner_mismatch con expected y received IDÉNTICOS
  // («NiobeMacMini» vs «NiobeMacMini»), que es el peor error posible de diagnosticar.
  // Lo destapó NiobeMacMini el 15-08-2026 intentando cerrar FLT-1445.
  ["Niobe", ["niobe"]],
  // Persefone: OpenCode + NVIDIA Nemotron en MacBookAirCrema (Carlos, 3-sep-2026, misión 0148).
  ["Persefone", ["persefone", "perséfone", "persephone"]],
  // Seraph: OpenCode + Qwen 3.6 en MacBookAirPlata (Carlos, 3-sep-2026, misión 0211).
  ["Seraph", ["seraph", "serafín", "serafin"]],
  // Los consejeros del Consejo de Silicio que trabajan desde GrokBot (Carlos, 4-sep-2026,
  // FLT-1580). Su apellido de equipo es GrokBot: WozniakGrokBot, JobsGrokBot,
  // DisneyGrokBot, LucasGrokBot. El alias corto es el apellido de la persona real; el
  // nombre completo también se lee para que «Steve Wozniak» firme como Wozniak.
  ["Wozniak", ["wozniak", "steve wozniak", "stevewozniak", "woz"]],
  ["Jobs", ["jobs", "steve jobs", "stevejobs"]],
  ["Disney", ["disney", "walt disney", "waltdisney"]],
  ["Lucas", ["lucas", "george lucas", "georgelucas"]],
];
// Apellidos que se usaron antes y siguen vivos en datos ya guardados. Se leen,
// pero al volver a escribir salen con el apellido actual.
const LEGACY_SUFFIXES = new Map([
  ["16", "MBP16"], ["14", "MBP14"], ["mini", "Mini"],
  ["azul", "MBAAzul"], ["rosa", "MBARosa"], ["crema", "MBACrema"], ["plata", "MBAPlata"],
  ["air16", "MBA16"], ["plata16", "MBA16"],
]);

// El Mac Mini se ha escrito de dos formas: `Mini`, que fue la operativa hasta el
// 3-ago-2026, y `MacMini`. La normativa 02 zanjó cuál vale el 4-ago con estas
// palabras: «el apellido no se abrevia; el del Mac Mini es MacMini, así que Neo
// en el Mac Mini es NeoMacMini, no NeoMini». Las dos se LEEN —hay meses de
// misiones, ventanas e informes firmados con `Mini`— pero solo una se ESCRIBE.
// Sin esto, el mismo agente sale partido en dos filas del Highscore.
export function canonicalMachineSuffix(suffix) {
  return suffix === "Mini" ? "MacMini" : suffix;
}

// Identidad canónica para AGRUPAR: misma persona, misma capa y misma máquina =
// misma fila, se escriba el apellido como se escriba. La capa NO se funde:
// subMorfeo e infraMorfeo son agentes distintos de Morfeo y puntúan aparte.
export function groupingIdentityKey(agent, machine = "") {
  const parsed = parseAgentIdentity(agent);
  const suffix = canonicalMachineSuffix(parsed.suffix || machineSuffix(machine) || "");
  const persona = identityKey(parsed.persona) || identityKey(agent);
  return `${parsed.role}|${persona}|${identityKey(suffix)}`;
}

export function identityKey(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// Equivalente SQL (SQLite/D1) de identityKey para los caracteres que admite el
// censo operativo. Se construye aquí, junto al diccionario, para que los guards
// atómicos no mantengan una tercera normalización aproximada.
export function identitySqlKey(expression) {
  let sql = `lower(COALESCE(${expression},''))`;
  for (const [from, to] of [
    ['á','a'],['é','e'],['í','i'],['ó','o'],['ú','u'],['ü','u'],['ñ','n'],
    ['Á','a'],['É','e'],['Í','i'],['Ó','o'],['Ú','u'],['Ü','u'],['Ñ','n']
  ]) sql = `replace(${sql},'${from}','${to}')`;
  for (const char of [' ','-','_','·','.',"'",'(',')','/','\\']) {
    const escaped = char === "'" ? "''" : char;
    sql = `replace(${sql},'${escaped}','')`;
  }
  return sql;
}

export function machineSuffix(machine) {
  const key = identityKey(machine);
  if (!key) return "";
  for (const [suffix, aliases] of MACHINES) {
    if (aliases.some((alias) => {
      const candidate = identityKey(alias);
      return key === candidate;
    })) return suffix;
  }
  return "";
}

// Clave de equipo físico, no de su rótulo. Todos los aliases del censo que
// machineSuffix reconoce convergen en el mismo sufijo; los valores ajenos al
// censo conservan la comparación exacta histórica, sin mezclarse entre sí.
export function machineIdentityKey(value) {
  const suffix = machineSuffix(value);
  return suffix ? identityKey(suffix) : identityKey(value).replace(/^admira/, "");
}

export function machineIdentitySqlKey(expression) {
  const raw = identitySqlKey(expression);
  const aliases = MACHINES.flatMap(([suffix, values]) => values.map((value) => [
    identityKey(suffix), identityKey(value)
  ])).filter(([, alias]) => alias);
  const aliasesJson = JSON.stringify(aliases).replaceAll("'", "''");
  const fallback = `(CASE WHEN ${raw} LIKE 'admira%' THEN substr(${raw},7) ELSE ${raw} END)`;
  return `COALESCE((SELECT json_extract(machine_alias.value,'$[0]') ` +
    `FROM json_each('${aliasesJson}') AS machine_alias ` +
    `WHERE ${raw}=json_extract(machine_alias.value,'$[1]') ` +
    `ORDER BY machine_alias.key ASC LIMIT 1),${fallback})`;
}

/** Una persona está en el diccionario (regla 02). Única fuente: PERSONAS de este fichero. */
export function isKnownPersona(name) {
  const n = String(name || "");
  return PERSONAS.some(([persona]) => persona === n);
}
export function knownPersonas() {
  return PERSONAS.map(([persona]) => persona);
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
      // Niobe nace canónicamente como NiobeMacMini. Se acepta el apellido corto
      // NiobeMini que ya usan los ejecutores, pero se reescribe al equipo físico
      // completo. La excepción es deliberadamente sólo para Niobe: OraculoMini
      // conserva su contrato histórico y nunca se convierte ni transfiere a Niobe.
      const suffix = MACHINES.map(([s]) => s).find((s) => identityKey(s) === tail) ||
        (name === "Niobe" && tail === "mini" ? "MacMini" : LEGACY_SUFFIXES.get(tail)) || "";
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
  const suffix = parsed.suffix || machineSuffix(machine);
  return `${effectiveRole === "sub" ? "Sub" : effectiveRole === "infra" ? "Infra" : ""}${parsed.persona}${suffix}`;
}

// Identidad visible en informes: EL MISMO nombre que en el resto de pantallas.
// Los registros históricos pueden guardar sólo la persona, una capa genérica o un
// apellido antiguo; la máquina de la misión es la fuente física real, así que el
// nombre se recompone sin alterar el owner persistido. Si no se puede recomponer,
// se devuelve tal cual antes que inventar un apellido (normativa regla 04).
export function reportAgentIdentity(owner, machine) {
  const parsed = parseAgentIdentity(owner);
  const suffix = parsed.suffix || machineSuffix(machine);
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
  const suffix = parsed.suffix || machineSuffix(machine);
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
  return agentFamilyKey(a) === agentFamilyKey(b);
}

export function agentFamilyKey(value) {
  return identityKey(baseAgentIdentity(value));
}

export function agentFamilySqlKey(expression) {
  const raw = identitySqlKey(expression);
  const roleless = `(CASE WHEN ${raw} LIKE 'infra%' THEN substr(${raw},6) ` +
    `WHEN ${raw} LIKE 'sub%' THEN substr(${raw},4) ELSE ${raw} END)`;
  const agentless = `(CASE WHEN ${roleless} LIKE 'agente%' THEN substr(${roleless},7) ELSE ${roleless} END)`;
  const aliases = PERSONAS.flatMap(([name, values]) =>
    [...new Set([name, ...values].map((value) => identityKey(value).replace(/^agente/, '')).filter(Boolean))]
      .map((alias) => [identityKey(name), alias]));
  const aliasesJson = JSON.stringify(aliases).replaceAll("'", "''");
  // Para identidades ajenas al censo parseAgentIdentity conserva el valor crudo,
  // incluido Sub/Infra; por eso el fallback es raw y no roleless. JSON1 evita
  // repetir el árbol normalizador una vez por alias dentro de cada guarda D1.
  return `COALESCE((SELECT json_extract(family_alias.value,'$[0]') FROM json_each('${aliasesJson}') AS family_alias ` +
    `WHERE ${agentless} LIKE json_extract(family_alias.value,'$[1]')||'%' ` +
    `ORDER BY length(json_extract(family_alias.value,'$[1]')) DESC,family_alias.key ASC LIMIT 1),${raw})`;
}

export const AGENT_IDENTITY_SPEC = Object.freeze({
  machines: MACHINES.map(([suffix, aliases]) => ({ suffix, aliases: aliases.slice() })),
  personas: PERSONAS.map(([name, aliases]) => ({ name, aliases: aliases.slice() })),
});
