export const MISSION_NOVELTY_TABLE_SQL =
  "CREATE TABLE IF NOT EXISTS mission_novelty_events (cursor INTEGER PRIMARY KEY AUTOINCREMENT, event_key TEXT NOT NULL UNIQUE, mission_id TEXT NOT NULL, created_at INTEGER NOT NULL, source TEXT NOT NULL, decision_id TEXT, batch_id TEXT)";

export const MISSION_NOVELTY_INDEX_SQL =
  "CREATE INDEX IF NOT EXISTS idx_mission_novelty_created ON mission_novelty_events(created_at DESC,cursor DESC)";

export const MISSION_NOVELTY_DECISION_INDEX_SQL =
  "CREATE INDEX IF NOT EXISTS idx_mission_novelty_decision ON mission_novelty_events(decision_id)";

export const MISSION_NOVELTY_INSERT_SQL =
  "INSERT OR IGNORE INTO mission_novelty_events(event_key,mission_id,created_at,source,decision_id,batch_id) " +
  "SELECT ?,t.id,t.created_at,t.source,?,? FROM tickets t WHERE t.id=?";

export const MISSION_NOVELTY_RECENT_SQL =
  "SELECT cursor,mission_id,created_at,source,decision_id,batch_id FROM mission_novelty_events ORDER BY cursor DESC LIMIT 20";

export function missionNoveltyEventKey(missionId) {
  return "mission-created:" + String(missionId || "");
}

export function missionNoveltyContract(rows) {
  const events = (rows || []).map((row) => ({
    cursor:Number(row.cursor) || 0,
    mission_id:String(row.mission_id || ""),
    created_at:Number(row.created_at) || 0,
    source:String(row.source || ""),
    decision_id:String(row.decision_id || ""),
    batch_id:String(row.batch_id || "")
  }));
  const newest = events[0] || null;
  return {
    created_cursor:newest ? newest.cursor : 0,
    latest_created_at:newest ? newest.created_at : 0,
    newest_id:newest ? newest.mission_id : "",
    events
  };
}
