const MAX_FIELD = 80;
const PERSONAS = ["Oraculo", "Neo", "Morfeo", "Trinity", "Smith", "WhiteRabbit"];
const INTERNAL = /^(?:ampere|erdos|noether|sol|terra|luna|claude|codex|grok|openai|anthropic)/i;
const MACHINES = [
  { name:"MacMini", suffix:"MacMini", legacySuffixes:["Mini"], aliases:["macmini","mac mini","mac mini carlos","admira-macmini","macmini.local"] },
  { name:"MacBookPro14", suffix:"MBP14", legacySuffixes:["14"], aliases:["macbookpro14","macbook pro 14","macbookpronegro14","macbook pro negro 14","admira-macbookpronegro14"] },
  { name:"MacBookPro16", suffix:"MBP16", aliases:["macbookpro16","macbook pro 16","admira-macbookpro16","macbook-pro-16"] },
  { name:"MacBookAirAzul", suffix:"Azul", aliases:["macbookairazul","macbook air azul","mba azul","admira-macbookairazul"] },
  { name:"MacBookAirRosa", suffix:"Rosa", aliases:["macbookairrosa","macbook air rosa","mba rosa","admira-macbookairrosa"] },
  { name:"MacBookAirCrema", suffix:"Crema", aliases:["macbookaircrema","macbook air crema","mba crema","admira-macbookaircrema"] },
  { name:"MacBookAirPlata", suffix:"Plata", aliases:["macbookairplata","macbook air plata","mba plata","admira-macbookairplata"] },
  { name:"MacBookAir16plata", suffix:"Plata16", aliases:["macbookair16plata","macbook air 16 dg","macbookair16","mba 16 plata","admira-macbookair16"] },
  { name:"ASUS Zenbook", suffix:"Zenbook", aliases:["asus zenbook","asuszenbook","admira-asuszenbook"] },
  { name:"DGX Spark", suffix:"DGX", aliases:["dgx spark","dgxspark","dgx-spark"] },
  { name:"ThinkStation PGX", suffix:"PGX", aliases:["thinkstation pgx","thinkstationpgx","thinkstation"] }
];

function key(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }
function clean(value, label) {
  const raw = String(value || "");
  if (!raw.trim()) throw new Error(`Falta ${label}`);
  if (raw.length > MAX_FIELD) throw new Error(`${label} supera ${MAX_FIELD} caracteres`);
  if (/[\u0000-\u001f\u007f-\u009f]/.test(raw)) throw new Error(`${label} contiene caracteres de control`);
  return raw.trim();
}
function resolveMachine(value) {
  const raw = clean(value, "YOKUP_DEPLOY_MACHINE"), k = key(raw);
  const found = MACHINES.find((m) => key(m.name) === k || m.aliases.some((a) => key(a) === k));
  if (!found) throw new Error("YOKUP_DEPLOY_MACHINE no pertenece al censo operativo");
  return found;
}
export function validateDeployIdentity(agentValue, machineValue) {
  const agent = clean(agentValue, "YOKUP_DEPLOY_AGENT");
  if (INTERNAL.test(agent)) throw new Error("YOKUP_DEPLOY_AGENT no puede ser un runtime o identidad interna");
  const machine = resolveMachine(machineValue);
  let role = "", body = agent;
  if (body.startsWith("Infra")) { role = "Infra"; body = body.slice(5); }
  else if (body.startsWith("Sub")) { role = "Sub"; body = body.slice(3); }
  const smithAir = body.startsWith("Agente Smith ");
  const persona = smithAir ? "Smith" : PERSONAS.find((name) => body.startsWith(name));
  if (!persona) throw new Error("YOKUP_DEPLOY_AGENT no es una identidad operativa conocida");
  const suffix = smithAir ? body.slice("Agente Smith ".length) : body.slice(persona.length);
  if (!suffix) throw new Error("YOKUP_DEPLOY_AGENT debe incluir el apellido físico");
  if (suffix !== machine.suffix && !(machine.legacySuffixes || []).includes(suffix)) throw new Error("El apellido de YOKUP_DEPLOY_AGENT no coincide con YOKUP_DEPLOY_MACHINE");
  const airStyle = persona === "Smith" && /^(?:Azul|Rosa|Crema|Plata|Plata16)$/.test(suffix);
  const canonicalSuffix=machine.suffix;
  const canonicalAirStyle=persona === "Smith" && /^(?:Azul|Rosa|Crema|Plata|Plata16)$/.test(canonicalSuffix);
  const deployer = role + (canonicalAirStyle ? "Agente Smith " + canonicalSuffix : persona + canonicalSuffix);
  const inputStyled = role + (airStyle ? "Agente Smith " + suffix : persona + suffix);
  const compact = role + persona + suffix;
  if (agent !== inputStyled && agent !== compact) throw new Error("YOKUP_DEPLOY_AGENT debe usar la forma canónica completa");
  return { deployer, machine:machine.name, signature:`${deployer} · ${machine.name}` };
}

export function wranglerCommitArgs({ gitFull, signature, version }) {
  return ["--commit-hash", clean(gitFull, "git hash"), "--commit-message", `Yokup ${clean(version, "versión")} · ${clean(signature, "firma")}`];
}
