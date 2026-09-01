-- FLT-1504 · ranking de importancia compartido por proyecto.
-- 0 significa sin priorizar; 5 es el máximo visible en el Dashboard.
ALTER TABLE projects
  ADD COLUMN importance INTEGER NOT NULL DEFAULT 0
  CHECK (importance BETWEEN 0 AND 5);
