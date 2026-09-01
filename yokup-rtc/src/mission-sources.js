// Puertas canónicas por las que nace trabajo de agente. Mantener la lista aquí
// evita que /fleet/missions, Highscore, informes y el alcance de campo diverjan.
export const CANONICAL_MISSION_SOURCES = Object.freeze([
  'fleet', 'decision-batch', 'cli-declare'
]);

const SOURCE_LIST_SQL = CANONICAL_MISSION_SOURCES.map((source) => `'${source}'`).join(',');

export const AGENT_SOURCE_SQL = `source IN (${SOURCE_LIST_SQL})`;
export const AGENT_SOURCE_SQL_T = `t.source IN (${SOURCE_LIST_SQL})`;
export const FIELD_SOURCE_SQL_T = `(t.source IS NULL OR t.source NOT IN (${SOURCE_LIST_SQL}))`;

// Misiones antiguas/importadas pueden no tener una fuente moderna, pero role=mission
// las declara canónicas. Los tickets de campo quedan fuera salvo que sean realmente
// una misión explícita; una fila field/screen nunca entra por accidente.
export const MISSION_SCOPE_SQL = `(role='mission' OR source IN (${SOURCE_LIST_SQL}))`;
export const MISSION_SCOPE_SQL_T = `(t.role='mission' OR t.source IN (${SOURCE_LIST_SQL}))`;
export const FIELD_MISSION_SCOPE_SQL_T = `(COALESCE(t.role,'')!='mission' AND (t.source IS NULL OR t.source NOT IN (${SOURCE_LIST_SQL})))`;

export const FLEET_MISSIONS_LIMIT = 120;
export const FLEET_MISSIONS_SQL =
  "SELECT id,subject,loc,project,project_id,role,source,status,assignee,created_at,updated_at,parent_id," +
  "project_inherited,project_inherited_from,proof_image FROM tickets WHERE " + AGENT_SOURCE_SQL +
  " ORDER BY (status IN ('open','in_progress','unconcluded')) DESC,(status='open') DESC," +
  "(status='in_progress') DESC,created_at DESC,id ASC LIMIT " + FLEET_MISSIONS_LIMIT;
