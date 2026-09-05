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

// Listado FILTRADO y PAGINADO de /fleet/missions (misión yokup DCL-d65ad512, Neo·MBP14,
// 2026-09-05). El contrato de siempre (FLEET_MISSIONS_SQL, 120 filas, sin filtros) sigue
// intacto; cuando el que pregunta acota (agente, máquina, proyecto, estado) o pide otra
// página, se construye la misma consulta con WHERE y LIMIT/OFFSET parametrizados.
// Antes /fleet/missions ignoraba ?agent= y se cortaba en 120: con 110 misiones de GrokBot
// en un día, las de cualquier otro agente desaparecían de /misiones aunque el marcador
// las contara. Las claves de identidad se pasan ya normalizadas (identityKey /
// machineIdentityKey) y el SQL las compara con la misma normalización.
export const FLEET_MISSIONS_MAX_LIMIT = 500;
export const FLEET_MISSION_STATUSES = Object.freeze(['open', 'in_progress', 'unconcluded', 'resolved', 'cancelled']);
const FLEET_MISSIONS_SELECT =
  "SELECT id,subject,loc,project,project_id,role,source,status,assignee,created_at,updated_at,parent_id," +
  "project_inherited,project_inherited_from,proof_image FROM tickets WHERE " + AGENT_SOURCE_SQL;
const FLEET_MISSIONS_ORDER =
  " ORDER BY (status IN ('open','in_progress','unconcluded')) DESC,(status='open') DESC," +
  "(status='in_progress') DESC,created_at DESC,id ASC";

export function normalizeFleetMissionsFilters(raw = {}) {
  const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
  const agent = str(raw.agent, 80), machine = str(raw.machine, 80), projectId = str(raw.project_id, 160);
  const status = str(raw.status, 20).toLowerCase();
  if (status && !FLEET_MISSION_STATUSES.includes(status) && status !== 'active') {
    return { ok:false, error:`status debe ser uno de ${FLEET_MISSION_STATUSES.join(', ')} o active` };
  }
  const limitRaw = raw.limit == null || raw.limit === '' ? FLEET_MISSIONS_LIMIT : Number(raw.limit);
  const offsetRaw = raw.offset == null || raw.offset === '' ? 0 : Number(raw.offset);
  if (!Number.isInteger(limitRaw) || limitRaw < 1 || !Number.isInteger(offsetRaw) || offsetRaw < 0) {
    return { ok:false, error:'limit debe ser un entero ≥1 y offset un entero ≥0' };
  }
  const limit = Math.min(limitRaw, FLEET_MISSIONS_MAX_LIMIT);
  const filtered = !!(agent || machine || projectId || status || offsetRaw || limit !== FLEET_MISSIONS_LIMIT);
  return { ok:true, agent, machine, projectId, status, limit, offset:offsetRaw, filtered };
}

// Devuelve { sql, binds, countSql } para el listado acotado. `agentSqlKey(expr)` y
// `machineSqlKey(expr)` son las normalizaciones SQL del censo (agent-identity.js);
// se inyectan para no acoplar este módulo al worker.
export function fleetMissionsQuery(filters, keys = {}) {
  const clauses = [], binds = [];
  const agentSqlKey = keys.agentSqlKey || ((e) => `lower(COALESCE(${e},''))`);
  const machineSqlKey = keys.machineSqlKey || ((e) => `lower(COALESCE(${e},''))`);
  const agentKey = keys.agentKey || ((v) => String(v || '').toLowerCase());
  const machineKey = keys.machineKey || ((v) => String(v || '').toLowerCase());
  if (filters.agent) { clauses.push(`${agentSqlKey('assignee')}=?`); binds.push(agentKey(filters.agent)); }
  if (filters.machine) { clauses.push(`${machineSqlKey('loc')}=?`); binds.push(machineKey(filters.machine)); }
  if (filters.projectId) { clauses.push("COALESCE(NULLIF(project_id,''),project)=?"); binds.push(filters.projectId); }
  if (filters.status === 'active') clauses.push("status IN ('open','in_progress','unconcluded')");
  else if (filters.status) { clauses.push('status=?'); binds.push(filters.status); }
  const where = clauses.length ? ' AND ' + clauses.join(' AND ') : '';
  return {
    sql: FLEET_MISSIONS_SELECT + where + FLEET_MISSIONS_ORDER + ' LIMIT ? OFFSET ?',
    binds: [...binds, filters.limit, filters.offset],
    countSql: 'SELECT COUNT(*) c FROM tickets WHERE ' + AGENT_SOURCE_SQL + where,
    countBinds: binds
  };
}
