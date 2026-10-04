-- Número único e inmutable del censo de proyectos.
-- El orden de alta es created_at ascendente; si empatan, id.
-- Un proyecto retirado conserva su número: no se reutiliza ni se renumera.
ALTER TABLE projects ADD COLUMN number INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_number ON projects(number);
CREATE TABLE IF NOT EXISTS project_number_seq (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  highest INTEGER NOT NULL
);
