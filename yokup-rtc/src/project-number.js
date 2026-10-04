// Número entero del censo. Se asigna una vez, por orden de alta
// (created_at ascendente y, si empatan, id), y no se reutiliza ni se renumera.

export const PROJECT_NUMBER_COLUMN_SQL = "ALTER TABLE projects ADD COLUMN number INTEGER";
export const PROJECT_NUMBER_INDEX_SQL =
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_number ON projects(number)";
export const PROJECT_NUMBER_SEQ_SQL =
  "CREATE TABLE IF NOT EXISTS project_number_seq (id INTEGER PRIMARY KEY CHECK (id=1), highest INTEGER NOT NULL)";

export function publishedProjectNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function birthCompare(a, b) {
  const ca = Number(a.created_at) || 0;
  const cb = Number(b.created_at) || 0;
  if (ca !== cb) return ca - cb;
  const ia = String(a.id);
  const ib = String(b.id);
  return ia < ib ? -1 : ia > ib ? 1 : 0;
}

// Mapa id → número. Los que ya tienen número se quedan. Los vacíos reciben
// max+1 en orden de alta. Nunca cambia un número ya escrito.
export function planProjectNumbers(rows) {
  const out = new Map();
  let max = 0;
  for (const row of rows || []) {
    const n = publishedProjectNumber(row.number);
    if (n == null) continue;
    out.set(row.id, n);
    if (n > max) max = n;
  }
  const missing = (rows || []).filter((row) => !out.has(row.id)).slice().sort(birthCompare);
  for (const row of missing) {
    max += 1;
    out.set(row.id, max);
  }
  return out;
}

export async function backfillProjectNumbers(env) {
  const rows = (await env.DB.prepare("SELECT id, created_at, number FROM projects").all()).results || [];
  const plan = planProjectNumbers(rows);
  const statements = [];
  for (const row of rows) {
    if (publishedProjectNumber(row.number) != null) continue;
    const n = plan.get(row.id);
    if (!n) continue;
    statements.push(env.DB.prepare("UPDATE projects SET number=? WHERE id=? AND number IS NULL").bind(n, row.id));
  }
  if (!statements.length) return 0;
  if (typeof env.DB.batch === "function") await env.DB.batch(statements);
  else for (const statement of statements) await statement.run();
  return statements.length;
}

export async function syncProjectNumberHighWater(env) {
  await env.DB.exec(PROJECT_NUMBER_SEQ_SQL);
  const row = await env.DB.prepare("SELECT COALESCE(MAX(number),0) AS m FROM projects").first();
  const max = Number(row && row.m) || 0;
  await env.DB.prepare(
    "INSERT INTO project_number_seq(id, highest) VALUES(1, ?) " +
    "ON CONFLICT(id) DO UPDATE SET highest=MAX(project_number_seq.highest, excluded.highest)"
  ).bind(max).run();
}

export async function allocateProjectNumber(env) {
  await syncProjectNumberHighWater(env);
  const reserved = await env.DB.prepare(
    "UPDATE project_number_seq SET highest=highest+1 WHERE id=1 RETURNING highest"
  ).first();
  const n = Number(reserved && reserved.highest);
  if (!Number.isInteger(n) || n < 1) throw new Error("no se pudo reservar el número de proyecto");
  return n;
}

export async function assignMissingProjectNumber(env, id) {
  const current = await env.DB.prepare("SELECT number FROM projects WHERE id=?").bind(id).first();
  if (!current) return null;
  const existing = publishedProjectNumber(current.number);
  if (existing != null) return existing;
  const n = await allocateProjectNumber(env);
  await env.DB.prepare("UPDATE projects SET number=? WHERE id=? AND number IS NULL").bind(n, id).run();
  const stored = await env.DB.prepare("SELECT number FROM projects WHERE id=?").bind(id).first();
  return publishedProjectNumber(stored && stored.number) || n;
}
