export const PROJECT_NOVELTY_TABLE_SQL =
  "CREATE TABLE IF NOT EXISTS project_novelty_events (cursor INTEGER PRIMARY KEY AUTOINCREMENT, event_key TEXT NOT NULL UNIQUE, project_id TEXT NOT NULL, created_at INTEGER NOT NULL)";

export const PROJECT_NOVELTY_INDEX_SQL =
  "CREATE INDEX IF NOT EXISTS idx_project_novelty_created ON project_novelty_events(created_at DESC,cursor DESC)";

export const PROJECT_NOVELTY_INSERT_SQL =
  "INSERT OR IGNORE INTO project_novelty_events(event_key,project_id,created_at) " +
  "SELECT ?,p.id,p.created_at FROM projects p WHERE p.id=?";

export const PROJECT_NOVELTY_RECENT_SQL =
  "SELECT cursor,project_id,created_at FROM project_novelty_events ORDER BY cursor DESC LIMIT 20";

export function projectNoveltyEventKey(projectId) {
  return "project-created:" + String(projectId || "");
}

export function projectNoveltyContract(rows, total) {
  const events = (rows || []).map((row) => ({
    cursor:Number(row.cursor) || 0,
    project_id:String(row.project_id || ""),
    created_at:Number(row.created_at) || 0
  }));
  const newest = events[0] || null;
  return {
    total:Math.max(0, Number(total) || 0),
    created_cursor:newest ? newest.cursor : 0,
    latest_created_at:newest ? newest.created_at : 0,
    newest_id:newest ? newest.project_id : "",
    events
  };
}
