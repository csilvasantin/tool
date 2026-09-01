-- Primera asignación histórica de cada responsable Carbono a cada proyecto.
CREATE TABLE IF NOT EXISTS project_carbon_assignments (
  project_id TEXT NOT NULL,
  carbon_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  first_assigned_at INTEGER NOT NULL,
  last_assigned_at INTEGER NOT NULL,
  PRIMARY KEY(project_id, carbon_key)
);
