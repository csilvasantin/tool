// Historial canónico de responsables Carbono. La pareja proyecto/persona conserva
// la primera asignación aunque se retire y se vuelva a asignar más adelante.
export const PROJECT_CARBON_ASSIGNMENTS_TABLE_SQL =
  "CREATE TABLE IF NOT EXISTS project_carbon_assignments (" +
  "project_id TEXT NOT NULL, carbon_key TEXT NOT NULL, display_name TEXT NOT NULL, " +
  "first_assigned_at INTEGER NOT NULL, last_assigned_at INTEGER NOT NULL, " +
  "PRIMARY KEY(project_id,carbon_key))";

export const PROJECT_CARBON_ASSIGNMENT_UPSERT_SQL =
  "INSERT INTO project_carbon_assignments(project_id,carbon_key,display_name,first_assigned_at,last_assigned_at) VALUES(?,?,?,?,?) " +
  "ON CONFLICT(project_id,carbon_key) DO UPDATE SET display_name=excluded.display_name,last_assigned_at=excluded.last_assigned_at";

// Para cambios CAS: sólo escribe historia si la actualización anterior dejó
// realmente a esa persona como responsable del proyecto.
export const PROJECT_CARBON_ASSIGNMENT_UPSERT_IF_CURRENT_SQL =
  "INSERT INTO project_carbon_assignments(project_id,carbon_key,display_name,first_assigned_at,last_assigned_at) " +
  "SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM projects WHERE id=? AND carbon_responsible=?) " +
  "ON CONFLICT(project_id,carbon_key) DO UPDATE SET display_name=excluded.display_name,last_assigned_at=excluded.last_assigned_at";

export function projectCarbonKey(raw) {
  return String(raw == null ? "" : raw).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);
}
