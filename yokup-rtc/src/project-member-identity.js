import { parseAgentIdentity } from "./agent-identity.js";

// El censo de proyectos acepta el apellido físico histórico MacMini al leer,
// pero las respuestas y escrituras nuevas usan la identidad operativa Mini.
export function canonicalProjectAgentRef(value) {
  const raw = String(value || "").trim().slice(0, 80);
  const parsed = parseAgentIdentity(raw);
  if (parsed.persona !== "Oraculo" || parsed.suffix !== "MacMini") return raw;
  const prefix = parsed.role === "sub" ? "Sub" : parsed.role === "infra" ? "Infra" : "";
  return `${prefix}OraculoMini`;
}

export function canonicalProjectAgentRefs(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => canonicalProjectAgentRef(value)).filter(Boolean))];
}

// project_members son filas relacionales, no JSON. INSERT-before-DELETE hace el
// backfill recuperable: si ya existe la fila canónica no duplica; si el segundo
// statement falla, el siguiente arranque termina la limpieza sin perder miembro.
export const YOKUP_MINI_MEMBER_BACKFILL_SQL = `
INSERT OR IGNORE INTO project_members(project_id,kind,ref,added_at)
SELECT project_id,kind,'OraculoMini',MIN(added_at)
FROM project_members
WHERE project_id='yokup' AND kind='agent' AND lower(ref)='oraculomacmini'
GROUP BY project_id,kind;
DELETE FROM project_members
WHERE project_id='yokup' AND kind='agent' AND lower(ref)='oraculomacmini';
UPDATE projects SET owner='OraculoMini'
WHERE id='yokup' AND lower(owner)='oraculomacmini';
`;
