export const REPORTS_DEFAULT_LIMIT = 30;
export const REPORTS_MAX_LIMIT = 100;

function encodeUtf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeUtf8(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

export function encodeReportsCursor(row) {
  return encodeUtf8(JSON.stringify([1, Number(row.updated_at) || 0, String(row.mission_id || ""), String(row.code || "")]));
}

export function decodeReportsCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(decodeUtf8(String(value)));
    if (!Array.isArray(parsed) || parsed.length !== 4 || parsed[0] !== 1 ||
        !Number.isFinite(parsed[1]) || parsed[1] < 0 || !parsed[2] || !parsed[3]) return null;
    return { updated_at:parsed[1], mission_id:String(parsed[2]), code:String(parsed[3]) };
  } catch {
    return null;
  }
}

function epochParam(params, name) {
  const raw = params.get(name);
  if (raw == null || raw === "") return { value:null };
  if (!/^\d+$/.test(raw)) return { error:`${name} debe ser epoch-ms` };
  const value = Number(raw);
  return Number.isSafeInteger(value) ? { value } : { error:`${name} debe ser epoch-ms` };
}

export function parseReportsPageOptions(params) {
  const rawLimit = params.get("limit");
  const limit = rawLimit == null || rawLimit === "" ? REPORTS_DEFAULT_LIMIT : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > REPORTS_MAX_LIMIT) {
    return { ok:false, error:`limit debe estar entre 1 y ${REPORTS_MAX_LIMIT}` };
  }
  const from = epochParam(params, "updated_from"), to = epochParam(params, "updated_to");
  if (from.error || to.error) return { ok:false, error:from.error || to.error };
  if (from.value != null && to.value != null && from.value >= to.value) {
    return { ok:false, error:"updated_from debe ser anterior a updated_to" };
  }
  const rawCursor = params.get("cursor") || "";
  const cursor = decodeReportsCursor(rawCursor);
  if (rawCursor && !cursor) return { ok:false, error:"cursor de informes no válido" };
  const project = String(params.get("project") || "").trim();
  if (project.length > 160) return { ok:false, error:"project supera 160 caracteres" };
  return {
    ok:true,
    limit,
    updated_from:from.value,
    updated_to:to.value,
    project:project || null,
    cursor,
    include_total:["1", "true"].includes(String(params.get("include_total") || "").toLowerCase())
  };
}

export function buildReportsPageFilter(options, scopeClause = "1=1") {
  const clauses = [scopeClause, "m.report IS NOT NULL", "TRIM(m.report)<>''"];
  const binds = [];
  if (options.updated_from != null) { clauses.push("COALESCE(m.updated_at,0)>=?"); binds.push(options.updated_from); }
  if (options.updated_to != null) { clauses.push("COALESCE(m.updated_at,0)<?"); binds.push(options.updated_to); }
  // project_id es la llave canónica. `project` queda como compatibilidad para
  // filas históricas anteriores a la migración; la vista nunca debe vaciarse
  // porque una generación escribió sólo una de las dos columnas.
  if (options.project) {
    clauses.push("COALESCE(NULLIF(t.project_id,''),t.project)=?");
    binds.push(options.project);
  }
  const count_sql = clauses.join(" AND "), count_binds = binds.slice();
  if (options.cursor) {
    const cursor = options.cursor;
    clauses.push("(COALESCE(m.updated_at,0)<? OR (COALESCE(m.updated_at,0)=? AND m.mission_id<?) OR (COALESCE(m.updated_at,0)=? AND m.mission_id=? AND m.code<?))");
    binds.push(cursor.updated_at, cursor.updated_at, cursor.mission_id, cursor.updated_at, cursor.mission_id, cursor.code);
  }
  return { page_sql:clauses.join(" AND "), page_binds:binds, count_sql, count_binds };
}
